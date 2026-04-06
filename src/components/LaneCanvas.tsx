import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  AIM_MARKER_Y,
  APPROACH_MIN_Y,
  FOUL_LINE_Y,
  GUTTER_WIDTH,
  LANE_HALF_WIDTH,
  PIN_RENDER_MAX_Y,
  START_MARKER_Y,
  boardToLaneX,
  getStandingPinsSnapshot,
  laneXToBoard,
  previewTrajectory,
  sampleAnimation,
} from '../game/simulation';
import type { EmberSnapshot, EventKind, GameState, PinSnapshot } from '../game/types';

interface LaneCanvasProps {
  game: GameState;
  onChangeStartBoard?: (board: number) => void;
  onChangeAimBoard?: (board: number) => void;
}

type DragMode = 'start' | 'aim' | null;

const SURFACE_HALF_WIDTH = LANE_HALF_WIDTH + GUTTER_WIDTH;

export function LaneCanvas({ game, onChangeStartBoard, onChangeAimBoard }: LaneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragModeRef = useRef<DragMode>(null);
  const pointerIdRef = useRef<number | null>(null);
  const latestRef = useRef({
    game,
    onChangeStartBoard,
    onChangeAimBoard,
  });

  useEffect(() => {
    latestRef.current = {
      game,
      onChangeStartBoard,
      onChangeAimBoard,
    };
  }, [game, onChangeAimBoard, onChangeStartBoard]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    let destroyed = false;
    let frameId = 0;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(bounds.width * scale));
      canvas.height = Math.max(1, Math.floor(bounds.height * scale));
      context.setTransform(scale, 0, 0, scale, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const render = (now: number) => {
      if (destroyed) {
        return;
      }

      drawScene(context, canvas, latestRef.current.game, now);
      frameId = window.requestAnimationFrame(render);
    };

    frameId = window.requestAnimationFrame(render);

    return () => {
      destroyed = true;
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const { game: latestGame } = latestRef.current;
    const interactive = latestGame.screen === 'game' && latestGame.phase === 'idle';
    if (!interactive) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    const point = getCanvasPoint(event.clientX, event.clientY, bounds);
    const startPoint = projectPoint(bounds.width, bounds.height, boardToLaneX(latestGame.shotSetup.startBoard), START_MARKER_Y);
    const aimPoint = projectPoint(bounds.width, bounds.height, boardToLaneX(latestGame.shotSetup.aimBoard), AIM_MARKER_Y);
    const aimBandY = projectPoint(bounds.width, bounds.height, 0, AIM_MARKER_Y).y;
    const foulLineY = projectPoint(bounds.width, bounds.height, 0, FOUL_LINE_Y).y;

    let dragMode: DragMode = null;
    if (distance(point, startPoint) <= 34 || point.y > foulLineY + 8) {
      dragMode = 'start';
    } else if (distance(point, aimPoint) <= 36 || Math.abs(point.y - aimBandY) <= 44) {
      dragMode = 'aim';
    }

    if (!dragMode) {
      return;
    }

    dragModeRef.current = dragMode;
    pointerIdRef.current = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    updateDrag(dragMode, point.x, bounds, latestRef.current.onChangeStartBoard, latestRef.current.onChangeAimBoard);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!dragModeRef.current || pointerIdRef.current !== event.pointerId) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    const point = getCanvasPoint(event.clientX, event.clientY, bounds);
    updateDrag(dragModeRef.current, point.x, bounds, latestRef.current.onChangeStartBoard, latestRef.current.onChangeAimBoard);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }

    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    dragModeRef.current = null;
    pointerIdRef.current = null;
  };

  return (
    <div className="lane-shell">
      <canvas
        className="lane-canvas"
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <div className="lane-caption">
        <span>Drag the approach marker and lane target directly on the lane.</span>
        <strong>Read the house shot and let it turn off the dry.</strong>
      </div>
    </div>
  );
}

function updateDrag(
  mode: Exclude<DragMode, null>,
  pointerX: number,
  bounds: DOMRect,
  onChangeStartBoard?: (board: number) => void,
  onChangeAimBoard?: (board: number) => void,
) {
  const markerY = mode === 'start' ? START_MARKER_Y : AIM_MARKER_Y;
  const laneX = screenToLaneX(pointerX, bounds.width, bounds.height, markerY);
  const board = laneXToBoard(laneX);

  if (mode === 'start') {
    onChangeStartBoard?.(board);
    return;
  }

  onChangeAimBoard?.(board);
}

function drawScene(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  game: GameState,
  now: number,
) {
  const bounds = canvas.getBoundingClientRect();
  const width = bounds.width;
  const height = bounds.height;
  const elapsedSeconds =
    game.activeAnimation && game.animationStartedAt
      ? Math.max(0, (now - game.animationStartedAt) / 1000)
      : 0;
  const animationFrame = sampleAnimation(game.activeAnimation, elapsedSeconds);
  const pins = animationFrame?.pins ?? getStandingPinsSnapshot(game.currentStandingPins);
  const ball = animationFrame?.ball ?? null;
  const embers = animationFrame?.embers ?? [];

  context.clearRect(0, 0, width, height);

  drawBackdrop(context, width, height);
  drawApproach(context, width, height);
  drawGutters(context, width, height);
  drawLaneSurface(context, width, height);
  drawLaneMarkings(context, width, height);

  const interactive = game.screen === 'game' && game.phase === 'idle';
  if (interactive) {
    drawAimGuide(context, width, height, game);
    drawMarkers(context, width, height, game);
  }

  drawPins(context, width, height, pins);
  drawEmbers(context, width, height, embers);

  if (ball?.visible) {
    drawBall(context, width, height, ball.x, ball.y, ball.radius, ball.inGutter, elapsedSeconds);
  } else if (!animationFrame && game.screen === 'game') {
    drawIdleBall(context, width, height, boardToLaneX(game.shotSetup.startBoard));
  }

  if (game.eventBanner) {
    const progress = (now - game.eventBanner.startedAt) / game.eventBanner.durationMs;
    if (progress >= 0 && progress <= 1) {
      drawBanner(context, width, height, game.eventBanner.label, game.eventBanner.kind, progress);
    }
  }
}

function drawBackdrop(context: CanvasRenderingContext2D, width: number, height: number) {
  const background = context.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, '#1b0d0a');
  background.addColorStop(0.55, '#110806');
  background.addColorStop(1, '#040404');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width * 0.52, height * 0.08, 0, width * 0.52, height * 0.08, width * 0.42);
  glow.addColorStop(0, 'rgba(255, 182, 70, 0.22)');
  glow.addColorStop(1, 'rgba(255, 182, 70, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

function drawApproach(context: CanvasRenderingContext2D, width: number, height: number) {
  const leftNear = projectCustom(width, height, -0.62, APPROACH_MIN_Y, 0.62);
  const rightNear = projectCustom(width, height, 0.62, APPROACH_MIN_Y, 0.62);
  const rightFar = projectCustom(width, height, LANE_HALF_WIDTH, FOUL_LINE_Y, SURFACE_HALF_WIDTH);
  const leftFar = projectCustom(width, height, -LANE_HALF_WIDTH, FOUL_LINE_Y, SURFACE_HALF_WIDTH);

  context.beginPath();
  context.moveTo(leftNear.x, leftNear.y);
  context.lineTo(rightNear.x, rightNear.y);
  context.lineTo(rightFar.x, rightFar.y);
  context.lineTo(leftFar.x, leftFar.y);
  context.closePath();
  const gradient = context.createLinearGradient(0, rightFar.y, 0, leftNear.y);
  gradient.addColorStop(0, '#6f4327');
  gradient.addColorStop(1, '#4b2c1d');
  context.fillStyle = gradient;
  context.fill();
}

function drawGutters(context: CanvasRenderingContext2D, width: number, height: number) {
  const yTop = FOUL_LINE_Y;
  const yBottom = PIN_RENDER_MAX_Y;

  drawQuad(
    context,
    projectCustom(width, height, -SURFACE_HALF_WIDTH, yTop, SURFACE_HALF_WIDTH),
    projectCustom(width, height, -LANE_HALF_WIDTH, yTop, SURFACE_HALF_WIDTH),
    projectCustom(width, height, -LANE_HALF_WIDTH, yBottom, SURFACE_HALF_WIDTH),
    projectCustom(width, height, -SURFACE_HALF_WIDTH, yBottom, SURFACE_HALF_WIDTH),
    '#241411',
  );

  drawQuad(
    context,
    projectCustom(width, height, LANE_HALF_WIDTH, yTop, SURFACE_HALF_WIDTH),
    projectCustom(width, height, SURFACE_HALF_WIDTH, yTop, SURFACE_HALF_WIDTH),
    projectCustom(width, height, SURFACE_HALF_WIDTH, yBottom, SURFACE_HALF_WIDTH),
    projectCustom(width, height, LANE_HALF_WIDTH, yBottom, SURFACE_HALF_WIDTH),
    '#241411',
  );
}

function drawLaneSurface(context: CanvasRenderingContext2D, width: number, height: number) {
  const topLeft = projectPoint(width, height, -LANE_HALF_WIDTH, FOUL_LINE_Y);
  const topRight = projectPoint(width, height, LANE_HALF_WIDTH, FOUL_LINE_Y);
  const bottomRight = projectPoint(width, height, LANE_HALF_WIDTH, PIN_RENDER_MAX_Y);
  const bottomLeft = projectPoint(width, height, -LANE_HALF_WIDTH, PIN_RENDER_MAX_Y);

  context.beginPath();
  context.moveTo(topLeft.x, topLeft.y);
  context.lineTo(topRight.x, topRight.y);
  context.lineTo(bottomRight.x, bottomRight.y);
  context.lineTo(bottomLeft.x, bottomLeft.y);
  context.closePath();

  const laneGradient = context.createLinearGradient(0, topLeft.y, 0, bottomLeft.y);
  laneGradient.addColorStop(0, '#e4b269');
  laneGradient.addColorStop(0.5, '#f2cf92');
  laneGradient.addColorStop(1, '#c18347');
  context.fillStyle = laneGradient;
  context.fill();

  for (let board = -19; board <= 19; board += 1) {
    const x = (board / 20) * LANE_HALF_WIDTH;
    const lineTop = projectPoint(width, height, x, FOUL_LINE_Y);
    const lineBottom = projectPoint(width, height, x, PIN_RENDER_MAX_Y);
    context.beginPath();
    context.moveTo(lineTop.x, lineTop.y);
    context.lineTo(lineBottom.x, lineBottom.y);
    context.strokeStyle = board % 5 === 0 ? 'rgba(136, 78, 38, 0.18)' : 'rgba(255, 255, 255, 0.06)';
    context.lineWidth = 1;
    context.stroke();
  }
}

function drawLaneMarkings(context: CanvasRenderingContext2D, width: number, height: number) {
  const foulLeft = projectPoint(width, height, -LANE_HALF_WIDTH, FOUL_LINE_Y);
  const foulRight = projectPoint(width, height, LANE_HALF_WIDTH, FOUL_LINE_Y);
  context.beginPath();
  context.moveTo(foulLeft.x, foulLeft.y);
  context.lineTo(foulRight.x, foulRight.y);
  context.strokeStyle = '#fff6dc';
  context.lineWidth = 3;
  context.stroke();

  for (let marker = -3; marker <= 3; marker += 1) {
    const x = marker * 0.11;
    const point = projectPoint(width, height, x, AIM_MARKER_Y);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x - 9, point.y - 16);
    context.lineTo(point.x + 9, point.y - 16);
    context.closePath();
    context.fillStyle = 'rgba(173, 91, 33, 0.72)';
    context.fill();
  }

  const oilGlow = context.createLinearGradient(0, foulLeft.y, 0, projectPoint(width, height, 0, 0.54).y);
  oilGlow.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
  oilGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = oilGlow;
  drawQuad(
    context,
    projectPoint(width, height, -LANE_HALF_WIDTH * 0.72, FOUL_LINE_Y),
    projectPoint(width, height, LANE_HALF_WIDTH * 0.72, FOUL_LINE_Y),
    projectPoint(width, height, LANE_HALF_WIDTH * 0.4, 0.56),
    projectPoint(width, height, -LANE_HALF_WIDTH * 0.4, 0.56),
    oilGlow,
  );
}

function drawAimGuide(context: CanvasRenderingContext2D, width: number, height: number, game: GameState) {
  const startX = boardToLaneX(game.shotSetup.startBoard);
  const trajectory = previewTrajectory(game.shotSetup, Math.max(0.62, game.lastPower || 0.72));
  const startPoint = projectPoint(width, height, startX, START_MARKER_Y);
  const targetPoint = projectPoint(width, height, boardToLaneX(game.shotSetup.aimBoard), AIM_MARKER_Y);

  context.save();
  context.setLineDash([10, 8]);
  context.strokeStyle = 'rgba(255, 226, 164, 0.75)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(startPoint.x, startPoint.y);
  context.lineTo(targetPoint.x, targetPoint.y);
  context.stroke();

  context.setLineDash([6, 10]);
  context.strokeStyle = 'rgba(255, 129, 40, 0.48)';
  context.beginPath();
  trajectory.forEach((point, index) => {
    const projected = projectPoint(width, height, point.x, point.y);
    if (index === 0) {
      context.moveTo(projected.x, projected.y);
    } else {
      context.lineTo(projected.x, projected.y);
    }
  });
  context.stroke();
  context.restore();
}

function drawMarkers(context: CanvasRenderingContext2D, width: number, height: number, game: GameState) {
  const startPoint = projectPoint(width, height, boardToLaneX(game.shotSetup.startBoard), START_MARKER_Y);
  const targetPoint = projectPoint(width, height, boardToLaneX(game.shotSetup.aimBoard), AIM_MARKER_Y);

  context.fillStyle = '#ff9d36';
  context.beginPath();
  context.arc(startPoint.x, startPoint.y, 14, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#fff3cf';
  context.lineWidth = 3;
  context.stroke();

  context.beginPath();
  context.moveTo(targetPoint.x, targetPoint.y - 16);
  context.lineTo(targetPoint.x + 16, targetPoint.y);
  context.lineTo(targetPoint.x, targetPoint.y + 16);
  context.lineTo(targetPoint.x - 16, targetPoint.y);
  context.closePath();
  context.fillStyle = '#ffd24b';
  context.fill();
  context.strokeStyle = '#fff5d6';
  context.lineWidth = 2;
  context.stroke();
}

function drawPins(context: CanvasRenderingContext2D, width: number, height: number, pins: PinSnapshot[]) {
  const sortedPins = [...pins].sort((left, right) => right.y - left.y);
  for (const pin of sortedPins) {
    const point = projectPoint(width, height, pin.x, pin.y, pin.z);
    const depthScale = getDepthScale(pin.y);
    const bodyHeight = 40 * depthScale;
    const bodyWidth = 17 * depthScale;

    context.save();
    context.translate(point.x, point.y);

    context.fillStyle = 'rgba(0, 0, 0, 0.28)';
    context.beginPath();
    context.ellipse(0, 9 * depthScale, bodyWidth * 0.9, bodyWidth * 0.45, 0, 0, Math.PI * 2);
    context.fill();

    if (pin.down) {
      context.rotate(-pin.angle);
      context.fillStyle = '#fff6ea';
      roundRect(context, -bodyHeight * 0.6, -bodyWidth * 0.32, bodyHeight * 1.2, bodyWidth * 0.64, bodyWidth * 0.28);
      context.fill();
      context.fillStyle = '#c63f29';
      context.fillRect(-bodyHeight * 0.18, -bodyWidth * 0.36, bodyHeight * 0.14, bodyWidth * 0.72);
      context.fillRect(bodyHeight * 0.02, -bodyWidth * 0.36, bodyHeight * 0.14, bodyWidth * 0.72);
    } else {
      context.fillStyle = '#fff8ef';
      roundRect(context, -bodyWidth * 0.58, -bodyHeight, bodyWidth * 1.16, bodyHeight * 1.2, bodyWidth * 0.55);
      context.fill();
      context.fillStyle = '#cf4730';
      context.fillRect(-bodyWidth * 0.56, -bodyHeight * 0.52, bodyWidth * 1.12, bodyHeight * 0.11);
      context.fillRect(-bodyWidth * 0.56, -bodyHeight * 0.36, bodyWidth * 1.12, bodyHeight * 0.11);
    }

    context.restore();
  }
}

function drawBall(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  laneX: number,
  laneY: number,
  radius: number,
  inGutter: boolean,
  elapsed: number,
) {
  const point = projectPoint(width, height, laneX, laneY);
  const scale = getDepthScale(laneY);
  const ballRadius = Math.max(8, radius * 270 * scale);

  context.save();
  context.translate(point.x, point.y);

  const glow = context.createRadialGradient(0, 0, ballRadius * 0.25, 0, 0, ballRadius * 2);
  glow.addColorStop(0, 'rgba(255, 194, 92, 0.86)');
  glow.addColorStop(0.6, inGutter ? 'rgba(255, 110, 46, 0.28)' : 'rgba(255, 126, 32, 0.42)');
  glow.addColorStop(1, 'rgba(255, 126, 32, 0)');
  context.fillStyle = glow;
  context.beginPath();
  context.arc(0, 0, ballRadius * 2, 0, Math.PI * 2);
  context.fill();

  const ballGradient = context.createRadialGradient(
    -ballRadius * 0.3,
    -ballRadius * 0.3,
    ballRadius * 0.2,
    0,
    0,
    ballRadius,
  );
  ballGradient.addColorStop(0, '#ffec91');
  ballGradient.addColorStop(0.2, '#ff8a31');
  ballGradient.addColorStop(0.6, '#ab1308');
  ballGradient.addColorStop(1, '#1c0706');
  context.fillStyle = ballGradient;
  context.beginPath();
  context.arc(0, 0, ballRadius, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = `rgba(255, 241, 191, ${0.28 + Math.sin(elapsed * 10) * 0.08})`;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, ballRadius * 0.96, 0, Math.PI * 2);
  context.stroke();

  context.restore();
}

function drawIdleBall(context: CanvasRenderingContext2D, width: number, height: number, laneX: number) {
  drawBall(context, width, height, laneX, START_MARKER_Y, 0.045, false, 0);
}

function drawEmbers(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  embers: EmberSnapshot[],
) {
  for (const ember of embers) {
    const point = projectPoint(width, height, ember.x, ember.y);
    const scale = Math.max(1.5, ember.size * 760 * getDepthScale(ember.y));
    context.fillStyle = `rgba(255, 180, 58, ${ember.alpha})`;
    context.beginPath();
    context.arc(point.x, point.y, scale, 0, Math.PI * 2);
    context.fill();
  }
}

function drawBanner(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  label: string,
  kind: EventKind,
  progress: number,
) {
  const alpha = Math.sin(progress * Math.PI);
  const scale = 0.86 + alpha * 0.22;
  context.save();
  context.translate(width * 0.5, height * 0.18);
  context.scale(scale, scale);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '900 46px Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif';

  const gradient = context.createLinearGradient(0, -28, 0, 28);
  if (kind === 'split') {
    gradient.addColorStop(0, '#ffe8a3');
    gradient.addColorStop(1, '#ff6a2a');
  } else if (kind === 'gutter') {
    gradient.addColorStop(0, '#ffd0a3');
    gradient.addColorStop(1, '#ff5c2e');
  } else {
    gradient.addColorStop(0, '#fff1b2');
    gradient.addColorStop(1, '#ff8a29');
  }

  context.shadowColor = `rgba(255, 120, 32, ${0.65 * alpha})`;
  context.shadowBlur = 30;
  context.lineWidth = 7;
  context.strokeStyle = `rgba(44, 6, 3, ${alpha})`;
  context.strokeText(label, 0, 0);
  context.fillStyle = gradient;
  context.fillText(label, 0, 0);
  context.restore();
}

function projectPoint(
  width: number,
  height: number,
  x: number,
  y: number,
  z = 0,
) {
  return projectCustom(width, height, x, y, SURFACE_HALF_WIDTH, z);
}

function projectCustom(
  width: number,
  height: number,
  x: number,
  y: number,
  halfWidth: number,
  z = 0,
) {
  const leftBottom = { x: width * 0.12, y: height * 0.93 };
  const rightBottom = { x: width * 0.88, y: height * 0.93 };
  const leftTop = { x: width * 0.38, y: height * 0.16 };
  const rightTop = { x: width * 0.62, y: height * 0.16 };
  const v = clamp((y - APPROACH_MIN_Y) / (PIN_RENDER_MAX_Y - APPROACH_MIN_Y), 0, 1);
  const u = clamp((x + halfWidth) / (halfWidth * 2), 0, 1);
  const left = lerpPoint(leftBottom, leftTop, v);
  const right = lerpPoint(rightBottom, rightTop, v);
  const point = lerpPoint(left, right, u);
  return {
    x: point.x,
    y: point.y - z * 24 * getDepthScale(y),
  };
}

function screenToLaneX(pointerX: number, width: number, height: number, worldY: number): number {
  const left = projectPoint(width, height, -SURFACE_HALF_WIDTH, worldY);
  const right = projectPoint(width, height, SURFACE_HALF_WIDTH, worldY);
  const alpha = clamp((pointerX - left.x) / (right.x - left.x), 0, 1);
  return -SURFACE_HALF_WIDTH + alpha * SURFACE_HALF_WIDTH * 2;
}

function getCanvasPoint(clientX: number, clientY: number, bounds: DOMRect) {
  return {
    x: clientX - bounds.left,
    y: clientY - bounds.top,
  };
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function drawQuad(
  context: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
  fillStyle: string | CanvasGradient,
) {
  context.beginPath();
  context.moveTo(a.x, a.y);
  context.lineTo(b.x, b.y);
  context.lineTo(c.x, c.y);
  context.lineTo(d.x, d.y);
  context.closePath();
  context.fillStyle = fillStyle;
  context.fill();
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function getDepthScale(worldY: number) {
  const t = clamp((worldY - APPROACH_MIN_Y) / (PIN_RENDER_MAX_Y - APPROACH_MIN_Y), 0, 1);
  return 1.34 - t * 0.64;
}

function lerpPoint(left: { x: number; y: number }, right: { x: number; y: number }, alpha: number) {
  return {
    x: left.x + (right.x - left.x) * alpha,
    y: left.y + (right.y - left.y) * alpha,
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
