import { PIN_IDS } from './types';
import type {
  AnimationSnapshot,
  EmberSnapshot,
  PinId,
  PinSnapshot,
  ShotContext,
  ShotResult,
  ShotSetup,
} from './types';

interface PathPoint {
  time: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  inGutter: boolean;
}

interface SimPin {
  id: PinId;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  down: boolean;
  fall: number;
  angle: number;
  impact: number;
}

interface DiscBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
}

const BALL_RADIUS = 0.045;
const DECK_BALL_RADIUS = 0.085;
const PIN_RADIUS = 0.043;
const PATH_DT = 1 / 60;
const DECK_DT = 1 / 120;
const PIN_DECK_TIME = 1.8;
const FULL_RACK = [...PIN_IDS];

export const APPROACH_MIN_Y = -0.18;
export const START_MARKER_Y = -0.08;
export const FOUL_LINE_Y = 0;
export const AIM_MARKER_Y = 0.28;
export const PIN_DECK_FRONT_Y = 0.88;
export const PIN_RENDER_MAX_Y = 1.1;
export const LANE_HALF_WIDTH = 0.5;
export const GUTTER_WIDTH = 0.085;

export const PIN_LAYOUT: Record<PinId, { x: number; y: number }> = {
  1: { x: 0, y: 0.015 },
  2: { x: -0.06, y: 0.075 },
  3: { x: 0.06, y: 0.075 },
  4: { x: -0.12, y: 0.135 },
  5: { x: 0, y: 0.135 },
  6: { x: 0.12, y: 0.135 },
  7: { x: -0.18, y: 0.195 },
  8: { x: -0.06, y: 0.195 },
  9: { x: 0.06, y: 0.195 },
  10: { x: 0.18, y: 0.195 },
};

export function boardToLaneX(board: number): number {
  return clamp((board / 20) * (LANE_HALF_WIDTH * 0.94), -LANE_HALF_WIDTH, LANE_HALF_WIDTH);
}

export function laneXToBoard(x: number): number {
  return clamp(Math.round((x / (LANE_HALF_WIDTH * 0.94)) * 20), -18, 18);
}

export function previewTrajectory(setup: ShotSetup, power = 0.72): Array<{ x: number; y: number }> {
  return simulateBallPath(setup, power).map((point) => ({ x: point.x, y: point.y }));
}

export function getAnimationDuration(animation: AnimationSnapshot[]): number {
  return animation.length > 0 ? animation[animation.length - 1].time : 0;
}

export function sampleAnimation(
  animation: AnimationSnapshot[] | null,
  elapsedSeconds: number,
): AnimationSnapshot | null {
  if (!animation || animation.length === 0) {
    return null;
  }

  for (const frame of animation) {
    if (frame.time >= elapsedSeconds) {
      return frame;
    }
  }

  return animation[animation.length - 1];
}

export function getStandingPinsSnapshot(standingPins: PinId[]): PinSnapshot[] {
  const standingSet = new Set(standingPins);
  return FULL_RACK.filter((pinId) => standingSet.has(pinId)).map((pinId) => ({
    id: pinId,
    x: PIN_LAYOUT[pinId].x,
    y: PIN_DECK_FRONT_Y + PIN_LAYOUT[pinId].y,
    z: 1,
    angle: 0,
    down: false,
  }));
}

export function simulateShot(
  setup: ShotSetup,
  standingPins: PinId[],
  _context: ShotContext,
  power: number,
  seed: number,
): ShotResult {
  const path = simulateBallPath(setup, power);
  const rackSet = new Set(standingPins);
  const staticPins = FULL_RACK.filter((pinId) => rackSet.has(pinId));
  const preImpactFrames: AnimationSnapshot[] = path.map((point) => ({
    time: point.time,
    ball: {
      x: point.x,
      y: point.y,
      radius: BALL_RADIUS,
      visible: true,
      inGutter: point.inGutter,
    },
    pins: staticPins.map((pinId) => ({
      id: pinId,
      x: PIN_LAYOUT[pinId].x,
      y: PIN_DECK_FRONT_Y + PIN_LAYOUT[pinId].y,
      z: 1,
      angle: 0,
      down: false,
    })),
    embers: buildTrailEmbers(point.x, point.y, power, point.time),
  }));

  const impactPoint = path[path.length - 1];

  if (impactPoint.inGutter) {
    const finishTime = impactPoint.time + 0.15;
    return {
      knockedPins: 0,
      standingPins,
      isGutter: true,
      pocketQuality: 0,
      entryAngle: 0,
      animation: [
        ...preImpactFrames,
        {
          time: finishTime,
          ball: {
            x: impactPoint.x,
            y: impactPoint.y + 0.08,
            radius: BALL_RADIUS,
            visible: false,
            inGutter: true,
          },
          pins: getStandingPinsSnapshot(standingPins),
          embers: [],
        },
      ],
    };
  }

  const entryAngle = Math.atan2(impactPoint.vx, impactPoint.vy);
  const pocketQuality = getPocketQuality(impactPoint.x, entryAngle);
  const random = createRandom(seed);
  const deck = simulatePinDeck(standingPins, impactPoint, power, pocketQuality, entryAngle, random);
  const deckFrames = deck.frames.map((frame) => ({
    ...frame,
    time: impactPoint.time + frame.time,
  }));

  const animation = [...preImpactFrames, ...deckFrames];

  return {
    knockedPins: standingPins.length - deck.standingPins.length,
    standingPins: deck.standingPins,
    isGutter: false,
    pocketQuality,
    entryAngle,
    animation,
  };
}

function simulateBallPath(setup: ShotSetup, power: number): PathPoint[] {
  const startX = boardToLaneX(setup.startBoard);
  const targetX = boardToLaneX(setup.aimBoard);
  const baseSpeed = mix(0.46, 0.68, power);
  const points: PathPoint[] = [];

  let x = startX;
  let y = START_MARKER_Y;
  let vx = 0;
  let vy = baseSpeed;
  let time = 0;
  let inGutter = false;

  while (time < 3.2 && y < PIN_DECK_FRONT_Y) {
    if (!inGutter) {
      const frontBlend = saturate((y - START_MARKER_Y) / (AIM_MARKER_Y - START_MARKER_Y));
      const desiredX = mix(startX, targetX, frontBlend);
      const guidePull = mix(5.1, 2.6, frontBlend);

      vx += (desiredX - x) * guidePull * PATH_DT;

      const outsideDry = smoothstep(0.12, 0.68, Math.abs(x) / LANE_HALF_WIDTH);
      const frontOil = 1 - smoothstep(FOUL_LINE_Y + 0.02, 0.6, y);
      const backendRead = smoothstep(0.54, 0.96, y);
      const houseOil = mix(0.88, 0.24, outsideDry);
      const readWindow = saturate(backendRead * 0.85 + outsideDry * 0.35 - frontOil * houseOil * 0.44);
      const hookStrength = (0.06 + readWindow * 0.34) * (1.06 - power * 0.16);

      vx += setup.spin * hookStrength * PATH_DT;
      vx *= 0.988 - readWindow * 0.003;
      vy = baseSpeed * (1 - readWindow * 0.09);
      x += vx * PATH_DT;
      y += vy * PATH_DT;

      if (Math.abs(x) > LANE_HALF_WIDTH - BALL_RADIUS * 0.6 && y > FOUL_LINE_Y + 0.06) {
        inGutter = true;
        x = Math.sign(x || 1) * (LANE_HALF_WIDTH + GUTTER_WIDTH * 0.55);
        vx = 0;
      }
    } else {
      vy *= 0.998;
      y += vy * PATH_DT;
    }

    points.push({
      time,
      x,
      y,
      vx,
      vy,
      inGutter,
    });

    time += PATH_DT;
  }

  if (points.length === 0) {
    points.push({
      time: 0,
      x,
      y: PIN_DECK_FRONT_Y,
      vx: 0,
      vy: baseSpeed,
      inGutter,
    });
  }

  points[points.length - 1] = {
    ...points[points.length - 1],
    y: Math.max(points[points.length - 1].y, PIN_DECK_FRONT_Y),
  };

  return points;
}

function simulatePinDeck(
  standingPins: PinId[],
  impactPoint: PathPoint,
  power: number,
  pocketQuality: number,
  entryAngle: number,
  random: () => number,
): {
  standingPins: PinId[];
  frames: AnimationSnapshot[];
} {
  const side = impactPoint.x >= 0 ? 'right' : 'left';
  const pins: SimPin[] = standingPins.map((pinId) => ({
    id: pinId,
    homeX: PIN_LAYOUT[pinId].x,
    homeY: PIN_LAYOUT[pinId].y,
    x: PIN_LAYOUT[pinId].x,
    y: PIN_LAYOUT[pinId].y,
    vx: 0,
    vy: 0,
    radius: PIN_RADIUS,
    mass: 1,
    down: false,
    fall: 0,
    angle: 0,
    impact: 0,
  }));

  const ball: DiscBody = {
    x: impactPoint.x,
    y: -0.08,
    vx: clamp(impactPoint.vx * 1.7, -0.38, 0.38),
    vy: mix(0.78, 1.06, power),
    radius: DECK_BALL_RADIUS,
    mass: 7.5,
  };

  biasPocketCarry(pins, pocketQuality, side, entryAngle);

  const frames: AnimationSnapshot[] = [];
  let time = 0;

  while (time <= PIN_DECK_TIME) {
    ball.x += ball.vx * DECK_DT;
    ball.y += ball.vy * DECK_DT;
    ball.vx *= 0.995;
    ball.vy *= 0.998;

    for (const pin of pins) {
      pin.x += pin.vx * DECK_DT;
      pin.y += pin.vy * DECK_DT;
      pin.vx *= pin.down ? 0.994 : 0.987;
      pin.vy *= pin.down ? 0.994 : 0.987;
    }

    for (const pin of pins) {
      resolveDiscCollision(ball, pin, 0.86, (impulse) => {
        pin.impact += impulse;
      });
    }

    for (let index = 0; index < pins.length; index += 1) {
      for (let compareIndex = index + 1; compareIndex < pins.length; compareIndex += 1) {
        resolveDiscCollision(pins[index], pins[compareIndex], 0.82, (impulse) => {
          pins[index].impact += impulse * 0.55;
          pins[compareIndex].impact += impulse * 0.55;
        });
      }
    }

    for (const pin of pins) {
      const speed = Math.hypot(pin.vx, pin.vy);
      const displacement = Math.hypot(pin.x - pin.homeX, pin.y - pin.homeY);
      const toppleThreshold = mix(0.24, 0.18, pocketQuality);

      if (!pin.down && (pin.impact > toppleThreshold || speed > toppleThreshold * 1.42 || displacement > 0.062)) {
        pin.down = true;
      }

      if (pin.down) {
        pin.fall = Math.min(1, pin.fall + DECK_DT * (2.6 + speed * 8));
        pin.angle = Math.atan2(pin.vx || 0.001, pin.vy || 0.001);
      }
    }

    if (time === 0 || Math.round(time / DECK_DT) % 2 === 0) {
      frames.push({
        time,
        ball: {
          x: ball.x,
          y: PIN_DECK_FRONT_Y + ball.y,
          radius: BALL_RADIUS,
          visible: ball.y < 0.42,
          inGutter: false,
        },
        pins: pins.map((pin) => ({
          id: pin.id,
          x: pin.x,
          y: PIN_DECK_FRONT_Y + pin.y,
          z: 1 - pin.fall * 0.7,
          angle: pin.angle,
          down: pin.down,
        })),
        embers: buildImpactEmbers(ball.x, PIN_DECK_FRONT_Y + 0.05, pocketQuality, time),
      });
    }

    time += DECK_DT;
  }

  let standingSet = new Set(
    pins.filter((pin) => !pin.down && Math.hypot(pin.vx, pin.vy) < 0.16).map((pin) => pin.id),
  );

  standingSet = applyMessengerCarry(standingSet, pocketQuality, random);

  const standingPinsAfter = FULL_RACK.filter((pinId) => standingSet.has(pinId));

  frames.push({
    time: PIN_DECK_TIME + 0.06,
    ball: {
      x: ball.x,
      y: PIN_DECK_FRONT_Y + 0.48,
      radius: BALL_RADIUS,
      visible: false,
      inGutter: false,
    },
    pins: pins.map((pin) => ({
      id: pin.id,
      x: pin.x,
      y: PIN_DECK_FRONT_Y + pin.y,
      z: standingSet.has(pin.id) ? 1 : 0.32,
      angle: pin.angle,
      down: !standingSet.has(pin.id),
    })),
    embers: [],
  });

  return {
    standingPins: standingPinsAfter,
    frames,
  };
}

function biasPocketCarry(
  pins: SimPin[],
  pocketQuality: number,
  side: 'left' | 'right',
  entryAngle: number,
) {
  if (pocketQuality < 0.36) {
    return;
  }

  const carryPins = side === 'right' ? [1, 3, 5, 6, 9] : [1, 2, 5, 4, 8];
  for (const pin of pins) {
    if (!carryPins.includes(pin.id)) {
      continue;
    }

    pin.vy += pocketQuality * 0.16;
    pin.vx += (side === 'right' ? -1 : 1) * pocketQuality * 0.1;
    pin.impact += pocketQuality * 0.065;
  }

  for (const pin of pins) {
    if (pin.id === 1) {
      pin.vx += -entryAngle * 0.25;
    }
  }
}

function applyMessengerCarry(
  standingPins: Set<PinId>,
  pocketQuality: number,
  random: () => number,
): Set<PinId> {
  const nextStanding = new Set(standingPins);

  if (nextStanding.size === 0 || pocketQuality < 0.66) {
    return nextStanding;
  }

  const edgePins: PinId[] = [];
  if (nextStanding.has(7)) {
    edgePins.push(7);
  }
  if (nextStanding.has(10)) {
    edgePins.push(10);
  }

  if (edgePins.length > 0 && edgePins.length <= 2 && random() < pocketQuality - 0.5) {
    for (const pinId of edgePins) {
      nextStanding.delete(pinId);
    }
  }

  if (nextStanding.size === 1) {
    const lonePin = [...nextStanding][0];
    if ((lonePin === 8 || lonePin === 9) && random() < pocketQuality - 0.6) {
      nextStanding.delete(lonePin);
    }
  }

  return nextStanding;
}

function resolveDiscCollision(
  left: DiscBody,
  right: DiscBody,
  restitution: number,
  onImpulse?: (impulse: number) => void,
) {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  const distance = Math.hypot(dx, dy) || 0.0001;
  const overlap = left.radius + right.radius - distance;

  if (overlap <= 0) {
    return;
  }

  const normalX = dx / distance;
  const normalY = dy / distance;
  const relativeSpeed =
    (right.vx - left.vx) * normalX + (right.vy - left.vy) * normalY;

  if (relativeSpeed > 0) {
    return;
  }

  const impulseMagnitude =
    (-(1 + restitution) * relativeSpeed) / (1 / left.mass + 1 / right.mass);

  left.vx -= (impulseMagnitude / left.mass) * normalX;
  left.vy -= (impulseMagnitude / left.mass) * normalY;
  right.vx += (impulseMagnitude / right.mass) * normalX;
  right.vy += (impulseMagnitude / right.mass) * normalY;

  const correction = overlap / (1 / left.mass + 1 / right.mass);
  left.x -= (correction / left.mass) * normalX;
  left.y -= (correction / left.mass) * normalY;
  right.x += (correction / right.mass) * normalX;
  right.y += (correction / right.mass) * normalY;

  if (onImpulse) {
    onImpulse(Math.abs(impulseMagnitude));
  }
}

function getPocketQuality(impactX: number, entryAngle: number): number {
  const rightPocket =
    gaussian(impactX, 0.082, 0.068) *
    gaussian(entryAngle, -0.16, 0.12);
  const leftPocket =
    gaussian(impactX, -0.082, 0.068) *
    gaussian(entryAngle, 0.16, 0.12);

  return Math.max(rightPocket, leftPocket);
}

function buildTrailEmbers(x: number, y: number, power: number, time: number): EmberSnapshot[] {
  return Array.from({ length: 4 }, (_, index) => ({
    x: x + Math.sin(time * 12 + index * 1.2) * 0.01,
    y: y + 0.025 + index * 0.004,
    size: mix(0.004, 0.012, power) * (1 - index * 0.16),
    alpha: 0.2 + (1 - index * 0.18) * 0.3,
  }));
}

function buildImpactEmbers(
  x: number,
  y: number,
  pocketQuality: number,
  time: number,
): EmberSnapshot[] {
  const intensity = Math.max(0.22, pocketQuality);
  return Array.from({ length: 8 }, (_, index) => {
    const angle = time * 12 + index * 0.8;
    const radius = 0.02 + index * 0.004;
    return {
      x: x + Math.cos(angle) * radius,
      y: y + Math.sin(angle) * radius * 0.45,
      size: 0.008 + intensity * 0.016,
      alpha: intensity * (0.9 - index * 0.08),
    };
  });
}

function createRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function gaussian(value: number, mean: number, deviation: number): number {
  return Math.exp(-((value - mean) ** 2) / (2 * deviation ** 2));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = saturate((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

function mix(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}

function saturate(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
