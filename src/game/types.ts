export const PIN_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type PinId = (typeof PIN_IDS)[number];
export type Screen = 'title' | 'game' | 'results';
export type Overlay = 'how-to' | 'settings' | 'pause' | null;
export type StatusTone = 'neutral' | 'good' | 'warn' | 'danger';
export type EventKind = 'strike' | 'spare' | 'split' | 'gutter' | 'open' | 'fill';

export interface FrameState {
  index: number;
  rolls: number[];
  leaves: PinId[][];
  split: boolean;
}

export interface BowlerState {
  id: string;
  name: string;
  frames: FrameState[];
  totals: Array<number | null>;
  runningTotal: number;
  finished: boolean;
}

export interface ShotSetup {
  startBoard: number;
  aimBoard: number;
  spin: number;
}

export interface ShotContext {
  bowlerIndex: number;
  frameIndex: number;
  ballNumber: 1 | 2 | 3;
  standingPins: PinId[];
}

export interface BallSnapshot {
  x: number;
  y: number;
  radius: number;
  visible: boolean;
  inGutter: boolean;
}

export interface PinSnapshot {
  id: PinId;
  x: number;
  y: number;
  z: number;
  angle: number;
  down: boolean;
}

export interface EmberSnapshot {
  x: number;
  y: number;
  size: number;
  alpha: number;
}

export interface AnimationSnapshot {
  time: number;
  ball: BallSnapshot;
  pins: PinSnapshot[];
  embers: EmberSnapshot[];
}

export interface ShotResult {
  knockedPins: number;
  standingPins: PinId[];
  isGutter: boolean;
  pocketQuality: number;
  entryAngle: number;
  animation: AnimationSnapshot[];
}

export interface EventBanner {
  kind: EventKind;
  label: string;
  startedAt: number;
  durationMs: number;
}

export interface SettingsState {
  muted: boolean;
}

export interface GameState {
  screen: Screen;
  overlay: Overlay;
  phase: 'idle' | 'charging' | 'rolling' | 'paused' | 'complete';
  bowlers: BowlerState[];
  currentBowlerIndex: number;
  shotSetup: ShotSetup;
  currentStandingPins: PinId[];
  statusText: string;
  statusTone: StatusTone;
  eventBanner: EventBanner | null;
  activeAnimation: AnimationSnapshot[] | null;
  animationStartedAt: number | null;
  lastPower: number;
  settings: SettingsState;
}
