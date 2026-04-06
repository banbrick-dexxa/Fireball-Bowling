import { PIN_IDS } from './types';
import type { BowlerState, FrameState, PinId } from './types';

const SPLIT_LINKS: Array<[PinId, PinId]> = [
  [1, 2],
  [1, 3],
  [2, 4],
  [2, 5],
  [3, 5],
  [3, 6],
  [4, 7],
  [4, 8],
  [5, 8],
  [5, 9],
  [6, 9],
  [6, 10],
];

export function createEmptyFrame(index: number): FrameState {
  return {
    index,
    rolls: [],
    leaves: [],
    split: false,
  };
}

export function createBowler(id: string, name: string): BowlerState {
  return {
    id,
    name,
    frames: [],
    totals: Array.from({ length: 10 }, () => null),
    runningTotal: 0,
    finished: false,
  };
}

export function fullRack(): PinId[] {
  return [...PIN_IDS];
}

export function normalizePins(pins: PinId[]): PinId[] {
  return [...pins].sort((left, right) => left - right);
}

export function isStrike(frame: FrameState): boolean {
  return frame.rolls[0] === 10;
}

export function isSpare(frame: FrameState): boolean {
  if (frame.index === 9) {
    return frame.rolls.length >= 2 && frame.rolls[0] < 10 && frame.rolls[0] + frame.rolls[1] === 10;
  }

  return frame.rolls.length >= 2 && frame.rolls[0] < 10 && frame.rolls[0] + frame.rolls[1] === 10;
}

export function isFrameComplete(frame: FrameState): boolean {
  if (frame.index < 9) {
    return frame.rolls[0] === 10 || frame.rolls.length >= 2;
  }

  const [first = 0, second = 0] = frame.rolls;

  if (frame.rolls.length < 2) {
    return false;
  }

  if (first === 10 || first + second === 10) {
    return frame.rolls.length >= 3;
  }

  return true;
}

export function getCurrentFrameIndex(bowler: BowlerState): number {
  for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
    const frame = bowler.frames[frameIndex];
    if (!frame || !isFrameComplete(frame)) {
      return frameIndex;
    }
  }

  return 10;
}

export function getCurrentFrame(bowler: BowlerState): FrameState | null {
  const frameIndex = getCurrentFrameIndex(bowler);
  if (frameIndex >= 10) {
    return null;
  }

  return bowler.frames[frameIndex] ?? createEmptyFrame(frameIndex);
}

export function getBallNumberForNextRoll(bowler: BowlerState): 1 | 2 | 3 {
  const frame = getCurrentFrame(bowler);
  if (!frame) {
    return 3;
  }

  if (frame.rolls.length === 0) {
    return 1;
  }

  if (frame.index < 9) {
    return 2;
  }

  if (frame.rolls.length === 1) {
    return 2;
  }

  return 3;
}

export function getStandingPinsForNextRoll(bowler: BowlerState): PinId[] {
  const frame = getCurrentFrame(bowler);
  if (!frame) {
    return [];
  }

  if (frame.rolls.length === 0) {
    return fullRack();
  }

  if (frame.index < 9) {
    return normalizePins(frame.leaves[0] ?? []);
  }

  const [first = 0, second = 0] = frame.rolls;

  if (frame.rolls.length === 1) {
    if (first === 10) {
      return fullRack();
    }

    return normalizePins(frame.leaves[0] ?? []);
  }

  if (first === 10) {
    if (second === 10) {
      return fullRack();
    }

    return normalizePins(frame.leaves[1] ?? []);
  }

  if (first + second === 10) {
    return fullRack();
  }

  return [];
}

export function detectSplit(standingPins: PinId[]): boolean {
  const normalized = normalizePins(standingPins);
  if (normalized.length < 2 || normalized.includes(1)) {
    return false;
  }

  const standingSet = new Set(normalized);
  const seen = new Set<PinId>();

  const walk = (pin: PinId) => {
    const stack = [pin];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current)) {
        continue;
      }
      seen.add(current);

      for (const [left, right] of SPLIT_LINKS) {
        if (left === current && standingSet.has(right) && !seen.has(right)) {
          stack.push(right);
        }
        if (right === current && standingSet.has(left) && !seen.has(left)) {
          stack.push(left);
        }
      }
    }
  };

  walk(normalized[0]);
  return seen.size !== normalized.length;
}

function cloneFrames(frames: FrameState[]): FrameState[] {
  return frames.map((frame) => ({
    index: frame.index,
    rolls: [...frame.rolls],
    leaves: frame.leaves.map((leave) => [...leave]),
    split: frame.split,
  }));
}

export function scoreBowler(bowler: BowlerState): BowlerState {
  const frames = Array.from({ length: 10 }, (_, index) => bowler.frames[index] ?? createEmptyFrame(index));
  const flatRolls = frames.flatMap((frame) => frame.rolls);
  const rollOffsets: number[] = [];

  let rollCursor = 0;
  for (const frame of frames) {
    rollOffsets.push(rollCursor);
    rollCursor += frame.rolls.length;
  }

  const totals = Array.from({ length: 10 }, () => null as number | null);
  let runningTotal = 0;

  for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
    const frame = frames[frameIndex];
    const offset = rollOffsets[frameIndex];
    let frameScore: number | null = null;

    if (frameIndex === 9) {
      if (isFrameComplete(frame)) {
        frameScore = frame.rolls.reduce((total, roll) => total + roll, 0);
      }
    } else if (isStrike(frame)) {
      if (flatRolls.length >= offset + 3) {
        frameScore = 10 + flatRolls[offset + 1] + flatRolls[offset + 2];
      }
    } else if (frame.rolls.length >= 2) {
      if (isSpare(frame)) {
        if (flatRolls.length >= offset + 3) {
          frameScore = 10 + flatRolls[offset + 2];
        }
      } else {
        frameScore = frame.rolls[0] + frame.rolls[1];
      }
    }

    if (frameScore !== null) {
      runningTotal += frameScore;
      totals[frameIndex] = runningTotal;
    }
  }

  return {
    ...bowler,
    frames: bowler.frames,
    totals,
    runningTotal,
    finished: getCurrentFrameIndex({ ...bowler, totals, runningTotal, finished: bowler.finished }) >= 10,
  };
}

export interface AppliedRoll {
  bowler: BowlerState;
  frameIndex: number;
  ballNumber: 1 | 2 | 3;
  knockedPins: number;
  isStrike: boolean;
  isSpare: boolean;
  split: boolean;
  frameComplete: boolean;
}

export function applyRollToBowler(bowler: BowlerState, standingPinsAfterRoll: PinId[]): AppliedRoll {
  const frameIndex = getCurrentFrameIndex(bowler);
  if (frameIndex >= 10) {
    return {
      bowler,
      frameIndex: 9,
      ballNumber: 3,
      knockedPins: 0,
      isStrike: false,
      isSpare: false,
      split: false,
      frameComplete: true,
    };
  }

  const ballNumber = getBallNumberForNextRoll(bowler);
  const previousStandingPins = getStandingPinsForNextRoll(bowler);
  const normalizedStanding = normalizePins(standingPinsAfterRoll);
  const knockedPins = previousStandingPins.length - normalizedStanding.length;
  const nextFrames = cloneFrames(bowler.frames);
  const frame = nextFrames[frameIndex] ?? createEmptyFrame(frameIndex);

  frame.rolls.push(knockedPins);
  frame.leaves.push(normalizedStanding);

  const split = ballNumber === 1 && frame.rolls[0] < 10 && detectSplit(normalizedStanding);
  if (split) {
    frame.split = true;
  }

  nextFrames[frameIndex] = frame;

  const rescored = scoreBowler({
    ...bowler,
    frames: nextFrames,
  });

  const updatedFrame = rescored.frames[frameIndex];
  return {
    bowler: rescored,
    frameIndex,
    ballNumber,
    knockedPins,
    isStrike: ballNumber === 1 && knockedPins === 10,
    isSpare:
      !(
        ballNumber === 1 && knockedPins === 10
      ) &&
      updatedFrame.index <= 9 &&
      updatedFrame.rolls.length >= 2 &&
      updatedFrame.rolls[0] < 10 &&
      updatedFrame.rolls[0] + updatedFrame.rolls[1] === 10 &&
      (ballNumber === 2 || updatedFrame.index === 9),
    split,
    frameComplete: isFrameComplete(updatedFrame),
  };
}
