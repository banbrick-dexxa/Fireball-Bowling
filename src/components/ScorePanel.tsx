import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { getCurrentFrameIndex, isFrameComplete } from '../game/scoring';
import { getCurrentShotContext, getTeamTotal } from '../game/state';
import type { FrameState, GameState } from '../game/types';

interface ScorePanelProps {
  game: GameState;
  chargePower: number;
  onSpinChange: (spin: number) => void;
  onPowerStart: () => void;
  onPowerRelease: () => void;
  onPause: () => void;
  onOpenSettings: () => void;
}

export function ScorePanel({
  game,
  chargePower,
  onSpinChange,
  onPowerStart,
  onPowerRelease,
  onPause,
  onOpenSettings,
}: ScorePanelProps) {
  const currentContext = getCurrentShotContext(game);
  const currentFrameText =
    currentContext.frameIndex >= 10
      ? 'Complete'
      : `Frame ${currentContext.frameIndex + 1}  Ball ${currentContext.ballNumber}`;
  const canShoot = game.screen === 'game' && (game.phase === 'idle' || game.phase === 'charging');

  return (
    <aside className="score-panel">
      <div className="panel-header">
        <span className="kicker">Team Board</span>
        <h1>Fireball Bowling</h1>
      </div>
      <div className="status-card">
        <div className={`status-pill status-pill--${game.statusTone}`}>{game.statusText}</div>
        <div className="round-strip">
          <div>
            <span className="meta-label">Current Bowler</span>
            <strong>{game.bowlers[game.currentBowlerIndex]?.name ?? 'Bowler'}</strong>
          </div>
          <div>
            <span className="meta-label">Frame / Ball</span>
            <strong>{currentFrameText}</strong>
          </div>
          <div>
            <span className="meta-label">Team Total</span>
            <strong>{getTeamTotal(game)}</strong>
          </div>
        </div>
      </div>
      <div className="scoreboard">
        {game.bowlers.map((bowler, bowlerIndex) => (
          <section
            className={`bowler-card ${
              bowlerIndex === game.currentBowlerIndex && game.screen === 'game'
                ? 'bowler-card--active'
                : ''
            }`}
            key={bowler.id}
          >
            <header className="bowler-header">
              <div>
                <span className="meta-label">Bowler</span>
                <strong>{bowler.name}</strong>
              </div>
              <div className="bowler-total">
                <span className="meta-label">Running</span>
                <strong>{bowler.runningTotal}</strong>
              </div>
            </header>
            <div className="frame-grid" role="table" aria-label={`${bowler.name} scoreboard`}>
              {Array.from({ length: 10 }, (_, frameIndex) => {
                const frame = bowler.frames[frameIndex] ?? {
                  index: frameIndex,
                  rolls: [],
                  leaves: [],
                  split: false,
                };
                const cells = getFrameRollCells(frame);
                return (
                  <div
                    className={`frame-cell ${
                      frameIndex === getCurrentFrameIndex(bowler) &&
                      bowlerIndex === game.currentBowlerIndex &&
                      game.screen === 'game'
                        ? 'frame-cell--active'
                        : ''
                    }`}
                    key={`${bowler.id}-${frameIndex + 1}`}
                  >
                    <div className="frame-cell__number">{frameIndex + 1}</div>
                    <div className={`roll-strip roll-strip--${cells.length}`}>
                      {cells.map((cell, cellIndex) => (
                        <span className="roll-mark" key={`${bowler.id}-${frameIndex}-${cellIndex}`}>
                          {cell}
                        </span>
                      ))}
                    </div>
                    <div className="frame-total">
                      {bowler.totals[frameIndex] ?? (isFrameComplete(frame) ? '' : ' ')}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <section className="control-card">
        <div className="control-card__header">
          <div>
            <span className="meta-label">Shot Control</span>
            <strong>Start on lane, spin here, then hold to fire</strong>
          </div>
          <div className="control-actions">
            <button className="ghost-button ghost-button--small" type="button" onClick={onPause}>
              Pause
            </button>
            <button className="ghost-button ghost-button--small" type="button" onClick={onOpenSettings}>
              Settings
            </button>
          </div>
        </div>
        <div className="shot-readout">
          <div>
            <span className="meta-label">Start Board</span>
            <strong>{formatBoard(game.shotSetup.startBoard)}</strong>
          </div>
          <div>
            <span className="meta-label">Aim Board</span>
            <strong>{formatBoard(game.shotSetup.aimBoard)}</strong>
          </div>
          <div>
            <span className="meta-label">Spin</span>
            <strong>{Math.abs(game.shotSetup.spin) < 0.08 ? 'Straight' : `${game.shotSetup.spin < 0 ? 'Left' : 'Right'} Hook`}</strong>
          </div>
          <div>
            <span className="meta-label">Pins Left</span>
            <strong>{game.currentStandingPins.length}</strong>
          </div>
        </div>
        <div className="control-grid">
          <SpinDial value={game.shotSetup.spin} onChange={onSpinChange} disabled={!canShoot} />
          <div className="power-card">
              <div className="power-meter">
              <div className="power-meter__fill" style={{ '--power': String(chargePower) } as CSSProperties} />
              <span className="power-meter__label">Power {Math.round(chargePower * 100)}%</span>
            </div>
            <PowerButton
              canShoot={canShoot}
              charging={game.phase === 'charging'}
              onPowerStart={onPowerStart}
              onPowerRelease={onPowerRelease}
            />
          </div>
        </div>
        <div className="control-hint">
          Drag the fiery marker on the approach, drag the lane target at the arrows, set the hook,
          then press and hold until the power feels right.
        </div>
      </section>
    </aside>
  );
}

function getFrameRollCells(frame: FrameState): string[] {
  if (frame.index === 9) {
    return [0, 1, 2].map((rollIndex) => getTenthFrameMark(frame, rollIndex));
  }

  return [0, 1].map((rollIndex) => getStandardFrameMark(frame, rollIndex));
}

function getStandardFrameMark(frame: FrameState, rollIndex: number): string {
  const firstRoll = frame.rolls[0];
  const secondRoll = frame.rolls[1];

  if (rollIndex === 0) {
    if (firstRoll === undefined) {
      return '';
    }

    if (firstRoll === 10) {
      return 'X';
    }

    return formatCount(firstRoll);
  }

  if (firstRoll === 10) {
    return '';
  }

  if (secondRoll === undefined) {
    return '';
  }

  if (firstRoll + secondRoll === 10) {
    return '/';
  }

  return formatCount(secondRoll);
}

function getTenthFrameMark(frame: FrameState, rollIndex: number): string {
  const first = frame.rolls[0];
  const second = frame.rolls[1];
  const third = frame.rolls[2];

  if (rollIndex === 0) {
    return first === undefined ? '' : first === 10 ? 'X' : formatCount(first);
  }

  if (rollIndex === 1) {
    if (second === undefined) {
      return '';
    }

    if (first === 10 && second === 10) {
      return 'X';
    }

    if (first !== undefined && first < 10 && first + second === 10) {
      return '/';
    }

    return second === 10 ? 'X' : formatCount(second);
  }

  if (third === undefined) {
    return '';
  }

  if (second !== undefined && second < 10 && second + third === 10 && first === 10) {
    return '/';
  }

  if (second !== undefined && first !== undefined && first < 10 && first + second === 10 && third === 10) {
    return 'X';
  }

  if (third === 10) {
    return 'X';
  }

  if (second !== undefined && second < 10 && second + third === 10) {
    return '/';
  }

  return formatCount(third);
}

function formatCount(count: number): string {
  return count === 0 ? '-' : String(count);
}

function formatBoard(board: number): string {
  return board >= 0 ? `R${board}` : `L${Math.abs(board)}`;
}

function SpinDial({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled: boolean;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const knobLeft = 50 + value * 34;
  const knobTop = 58 - (1 - Math.abs(value)) * 16;

  const updateValue = (clientX: number) => {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const normalized = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    onChange(clamp(normalized, -1, 1));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }

    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateValue(event.clientX);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || pointerIdRef.current !== event.pointerId) {
      return;
    }

    updateValue(event.clientX);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerIdRef.current = null;
  };

  return (
    <div className={`spin-dial ${disabled ? 'spin-dial--disabled' : ''}`}>
      <span className="meta-label">Spin</span>
      <div
        className="spin-dial__surface"
        ref={surfaceRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="spin-dial__track" />
        <div className="spin-dial__center">Hook</div>
        <div
          className="spin-dial__knob"
          style={{
            left: `${knobLeft}%`,
            top: `${knobTop}%`,
          }}
        />
      </div>
      <div className="spin-dial__labels">
        <span>Left</span>
        <strong>{Math.abs(value) < 0.08 ? 'Straight' : `${value < 0 ? 'Left' : 'Right'} Hook`}</strong>
        <span>Right</span>
      </div>
    </div>
  );
}

function PowerButton({
  canShoot,
  charging,
  onPowerStart,
  onPowerRelease,
}: {
  canShoot: boolean;
  charging: boolean;
  onPowerStart: () => void;
  onPowerRelease: () => void;
}) {
  const pointerIdRef = useRef<number | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canShoot || charging) {
      return;
    }

    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    onPowerStart();
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerIdRef.current = null;
    onPowerRelease();
  };

  return (
    <button
      className={`power-button ${charging ? 'power-button--charging' : ''}`}
      type="button"
      disabled={!canShoot && !charging}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <span className="power-button__kicker">{charging ? 'Release' : 'Hold'}</span>
      <strong>{charging ? 'Let It Rip' : 'Power Up'}</strong>
    </button>
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
