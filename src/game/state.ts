import { BOWLER_NAMES } from '../config/bowlers';
import {
  applyRollToBowler,
  createBowler,
  fullRack,
  getBallNumberForNextRoll,
  getCurrentFrameIndex,
  getStandingPinsForNextRoll,
} from './scoring';
import type { EventKind, GameState, ShotContext, ShotResult, StatusTone } from './types';

export const DEFAULT_SHOT_SETUP = {
  startBoard: 11,
  aimBoard: 6,
  spin: -0.42,
};

export function createInitialGameState(): GameState {
  return {
    screen: 'title',
    overlay: null,
    phase: 'idle',
    bowlers: BOWLER_NAMES.map((name, index) => createBowler(`bowler-${index + 1}`, name)),
    currentBowlerIndex: 0,
    shotSetup: { ...DEFAULT_SHOT_SETUP },
    currentStandingPins: fullRack(),
    statusText: 'Choose a board, aim marker, spin, then hold for power.',
    statusTone: 'neutral',
    eventBanner: null,
    activeAnimation: null,
    animationStartedAt: null,
    lastPower: 0.7,
    settings: {
      muted: false,
    },
  };
}

export function startGameState(): GameState {
  return {
    ...createInitialGameState(),
    screen: 'game',
  };
}

export function resetGameState(): GameState {
  return startGameState();
}

export function getCurrentBowler(game: GameState) {
  return game.bowlers[game.currentBowlerIndex];
}

export function getCurrentShotContext(game: GameState): ShotContext {
  const bowler = getCurrentBowler(game);
  return {
    bowlerIndex: game.currentBowlerIndex,
    frameIndex: getCurrentFrameIndex(bowler),
    ballNumber: getBallNumberForNextRoll(bowler),
    standingPins: getStandingPinsForNextRoll(bowler),
  };
}

export function getTeamTotal(game: GameState): number {
  return game.bowlers.reduce((total, bowler) => total + bowler.runningTotal, 0);
}

export function updateShotSetup(
  game: GameState,
  patch: Partial<GameState['shotSetup']>,
): GameState {
  return {
    ...game,
    shotSetup: {
      ...game.shotSetup,
      ...patch,
      startBoard: clampBoard(patch.startBoard ?? game.shotSetup.startBoard),
      aimBoard: clampBoard(patch.aimBoard ?? game.shotSetup.aimBoard),
      spin: clampValue(patch.spin ?? game.shotSetup.spin, -1, 1),
    },
  };
}

export function setMuted(game: GameState, muted: boolean): GameState {
  return {
    ...game,
    settings: {
      ...game.settings,
      muted,
    },
  };
}

export function setOverlay(game: GameState, overlay: GameState['overlay']): GameState {
  return {
    ...game,
    overlay,
  };
}

export function setPhase(game: GameState, phase: GameState['phase']): GameState {
  return {
    ...game,
    phase,
  };
}

export function clearEventBanner(game: GameState): GameState {
  return {
    ...game,
    eventBanner: null,
  };
}

export function getFrameBallLabel(game: GameState): string {
  const context = getCurrentShotContext(game);
  const frameLabel = context.frameIndex >= 10 ? 'Final' : `Frame ${context.frameIndex + 1}`;
  return `${frameLabel}  Ball ${context.ballNumber}`;
}

export function shouldShowLandscapeHint(): boolean {
  return window.innerHeight > window.innerWidth;
}

export function commitShot(game: GameState, result: ShotResult, now: number): GameState {
  const bowlers = [...game.bowlers];
  const currentBowler = bowlers[game.currentBowlerIndex];
  const applied = applyRollToBowler(currentBowler, result.standingPins);

  bowlers[game.currentBowlerIndex] = applied.bowler;

  const gameFinished = bowlers.every((bowler) => bowler.finished);
  let currentBowlerIndex = game.currentBowlerIndex;
  let currentStandingPins = getStandingPinsForNextRoll(applied.bowler);
  let shotSetup = game.shotSetup;

  if (applied.frameComplete && !gameFinished) {
    currentBowlerIndex = getNextBowlerIndex(bowlers, game.currentBowlerIndex);
    currentStandingPins = getStandingPinsForNextRoll(bowlers[currentBowlerIndex]);
    shotSetup = { ...DEFAULT_SHOT_SETUP };
  }

  if (gameFinished) {
    currentStandingPins = result.standingPins;
  }

  const event = deriveEvent(applied, result);

  return {
    ...game,
    bowlers,
    currentBowlerIndex,
    currentStandingPins,
    shotSetup,
    screen: gameFinished ? 'results' : 'game',
    overlay: null,
    phase: gameFinished ? 'complete' : 'idle',
    activeAnimation: null,
    animationStartedAt: null,
    lastPower: game.lastPower,
    statusText: buildStatusText(applied, bowlers[currentBowlerIndex].name, result),
    statusTone: event.tone,
    eventBanner:
      event.kind === 'open'
        ? null
        : {
            kind: event.kind,
            label: event.label,
            startedAt: now,
            durationMs: event.durationMs,
          },
  };
}

function getNextBowlerIndex(bowlers: GameState['bowlers'], currentBowlerIndex: number): number {
  for (let offset = 1; offset <= bowlers.length; offset += 1) {
    const candidateIndex = (currentBowlerIndex + offset) % bowlers.length;
    if (!bowlers[candidateIndex].finished) {
      return candidateIndex;
    }
  }

  return currentBowlerIndex;
}

function buildStatusText(
  applied: ReturnType<typeof applyRollToBowler>,
  nextBowlerName: string,
  result: ShotResult,
): string {
  if (applied.isStrike) {
    return 'STRIKE. Pins explode off the deck.';
  }

  if (applied.isSpare) {
    return 'SPARE. Cleaned up and kept the pressure on.';
  }

  if (applied.split) {
    return 'SPLIT. Tough leave. Line up the conversion.';
  }

  if (result.isGutter) {
    return 'GUTTER. Reset the line and trust the next ball.';
  }

  if (applied.knockedPins === 0) {
    return 'No count. Reset the target and trust the next roll.';
  }

  if (applied.frameComplete) {
    return `${nextBowlerName} is up. Stay on the house shot.`;
  }

  return `${applied.knockedPins} down, ${result.standingPins.length} left.`;
}

function deriveEvent(
  applied: ReturnType<typeof applyRollToBowler>,
  result: ShotResult,
): {
  kind: EventKind;
  label: string;
  tone: StatusTone;
  durationMs: number;
} {
  if (applied.isStrike) {
    return {
      kind: 'strike',
      label: 'STRIKE',
      tone: 'good',
      durationMs: 1800,
    };
  }

  if (applied.isSpare) {
    return {
      kind: 'spare',
      label: 'SPARE',
      tone: 'good',
      durationMs: 1500,
    };
  }

  if (applied.split) {
    return {
      kind: 'split',
      label: 'SPLIT',
      tone: 'warn',
      durationMs: 1450,
    };
  }

  if (result.isGutter) {
    return {
      kind: 'gutter',
      label: 'GUTTER',
      tone: 'danger',
      durationMs: 1300,
    };
  }

  return {
    kind: 'open',
    label: `${applied.knockedPins}`,
    tone: 'neutral',
    durationMs: 0,
  };
}

function clampBoard(board: number): number {
  return clampValue(board, -18, 18);
}

function clampValue(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
