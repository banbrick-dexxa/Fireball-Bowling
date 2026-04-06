import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LaneCanvas } from './components/LaneCanvas';
import { ScorePanel } from './components/ScorePanel';
import { FireballAudio } from './game/audio';
import {
  clearEventBanner,
  commitShot,
  createInitialGameState,
  getCurrentShotContext,
  getTeamTotal,
  setMuted,
  startGameState,
  updateShotSetup,
} from './game/state';
import { getAnimationDuration, simulateShot } from './game/simulation';
import type { Overlay } from './game/types';

function OverlayCard({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="overlay-backdrop" role="presentation" onClick={onClose}>
      <section
        className="overlay-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="overlay-header">
          <h2>{title}</h2>
          <button className="ghost-button ghost-button--small" type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="overlay-body">{children}</div>
      </section>
    </div>
  );
}

export default function App() {
  const [game, setGame] = useState(createInitialGameState);
  const [chargeStartedAt, setChargeStartedAt] = useState<number | null>(null);
  const [chargePower, setChargePower] = useState(0.62);
  const [portraitHint, setPortraitHint] = useState(() => window.innerHeight > window.innerWidth);
  const audioRef = useRef<FireballAudio | null>(null);
  const rollTimeoutRef = useRef<number | null>(null);

  if (!audioRef.current) {
    audioRef.current = new FireballAudio();
  }

  const teamTotal = useMemo(() => getTeamTotal(game), [game]);

  useEffect(() => {
    const handleResize = () => {
      setPortraitHint(window.innerHeight > window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!game.eventBanner) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setGame((current) => clearEventBanner(current));
    }, game.eventBanner.durationMs);

    return () => window.clearTimeout(timeoutId);
  }, [game.eventBanner]);

  useEffect(() => {
    audioRef.current?.setMuted(game.settings.muted);
  }, [game.settings.muted]);

  useEffect(() => {
    if (game.phase !== 'charging' || chargeStartedAt === null) {
      return;
    }

    let frameId = 0;

    const tick = (now: number) => {
      setChargePower(getChargePower(now - chargeStartedAt));
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frameId);
  }, [chargeStartedAt, game.phase]);

  useEffect(() => {
    return () => {
      if (rollTimeoutRef.current !== null) {
        window.clearTimeout(rollTimeoutRef.current);
      }
    };
  }, []);

  const updateOverlay = (overlay: Overlay) => {
    audioRef.current?.playUiTap();
    setGame((current) => ({
      ...current,
      overlay,
      phase: overlay === 'pause' || current.phase === 'paused' ? 'paused' : current.phase,
    }));
  };

  const closeOverlay = () => {
    audioRef.current?.playUiTap();
    setGame((current) => ({
      ...current,
      overlay: null,
      phase: current.phase === 'paused' ? 'idle' : current.phase,
    }));
  };

  const clearPendingRoll = () => {
    if (rollTimeoutRef.current !== null) {
      window.clearTimeout(rollTimeoutRef.current);
      rollTimeoutRef.current = null;
    }
  };

  const startFreshGame = () => {
    clearPendingRoll();
    audioRef.current?.stopRoll();
    audioRef.current?.playUiTap();
    setChargeStartedAt(null);
    setChargePower(0.62);
    setGame(startGameState());
  };

  const returnToTitle = () => {
    clearPendingRoll();
    audioRef.current?.stopRoll();
    audioRef.current?.playUiTap();
    setChargeStartedAt(null);
    setChargePower(0.62);
    setGame(createInitialGameState());
  };

  const beginCharge = () => {
    if (game.screen !== 'game' || game.phase !== 'idle' || game.overlay) {
      return;
    }

    const now = performance.now();
    audioRef.current?.playUiTap();
    setChargeStartedAt(now);
    setChargePower(getChargePower(0));
    setGame((current) => ({
      ...current,
      phase: 'charging',
      eventBanner: null,
      statusText: 'Charging power. Release to throw.',
      statusTone: 'neutral',
    }));
  };

  const releaseCharge = () => {
    if (game.screen !== 'game' || game.phase !== 'charging' || chargeStartedAt === null) {
      return;
    }

    const now = performance.now();
    const power = getChargePower(now - chargeStartedAt);
    const result = simulateShot(
      game.shotSetup,
      game.currentStandingPins,
      getCurrentShotContext(game),
      power,
      Date.now(),
    );

    clearPendingRoll();
    audioRef.current?.startRoll(power);
    setChargeStartedAt(null);
    setChargePower(power);
    setGame((current) => ({
      ...current,
      phase: 'rolling',
      activeAnimation: result.animation,
      animationStartedAt: now,
      lastPower: power,
      eventBanner: null,
      statusText: 'Ball away...',
      statusTone: 'neutral',
    }));

    rollTimeoutRef.current = window.setTimeout(() => {
      setGame((current) => {
        const next = commitShot({ ...current, lastPower: power }, result, performance.now());
        audioRef.current?.stopRoll();
        audioRef.current?.playPins(Math.max(0.24, result.knockedPins / 10));
        if (next.eventBanner?.kind === 'strike') {
          audioRef.current?.playCheer(1);
        } else if (next.eventBanner?.kind === 'spare') {
          audioRef.current?.playCheer(0.68);
        }
        return next;
      });
      rollTimeoutRef.current = null;
    }, Math.max(420, getAnimationDuration(result.animation) * 1000 + 60));
  };

  return (
    <div className="app-shell">
      <div className="fireball-backdrop" />
      <div className="app-frame">
        {game.screen === 'title' ? (
          <section className="title-hero">
            <div className="title-copy">
              <span className="kicker">Arcade Team Night Special</span>
              <h1>Fireball Bowling</h1>
              <p>
                A fiery four-bowler bowling showdown with real scoring, controlled hook, and a
                one-lane presentation built to feel like your team&apos;s own custom web game.
              </p>
              <div className="hero-actions">
                <button className="fire-button" type="button" onClick={startFreshGame}>
                  Start Game
                </button>
                <button className="ghost-button" type="button" onClick={() => updateOverlay('how-to')}>
                  How To Play
                </button>
                <button className="ghost-button" type="button" onClick={() => updateOverlay('settings')}>
                  Settings
                </button>
              </div>
              <div className="hero-meta">
                <div>
                  <span className="meta-label">Format</span>
                  <strong>1 lane, 4 bowlers, 10 frames</strong>
                </div>
                <div>
                  <span className="meta-label">Controls</span>
                  <strong>Approach, Aim, Spin, Hold, Release</strong>
                </div>
              </div>
            </div>
            <LaneCanvas game={game} />
          </section>
        ) : null}

        {game.screen === 'game' ? (
          <section className="game-shell">
            <ScorePanel
              game={game}
              chargePower={chargePower}
              onSpinChange={(spin) => setGame((current) => updateShotSetup(current, { spin }))}
              onPowerStart={beginCharge}
              onPowerRelease={releaseCharge}
              onPause={() => {
                if (game.phase === 'idle') {
                  updateOverlay('pause');
                }
              }}
              onOpenSettings={() => {
                if (game.phase !== 'rolling') {
                  updateOverlay('settings');
                }
              }}
            />
            <LaneCanvas
              game={game}
              onChangeStartBoard={(startBoard) =>
                setGame((current) => updateShotSetup(current, { startBoard }))
              }
              onChangeAimBoard={(aimBoard) => setGame((current) => updateShotSetup(current, { aimBoard }))}
            />
          </section>
        ) : null}

        {game.screen === 'results' ? (
          <section className="results-screen">
            <div className="results-card">
              <span className="kicker">Final Results</span>
              <h1>Fireball Bowling</h1>
              <p>
                Final frame complete. Lock in the scores, grab the screenshot, and run it back.
              </p>
              <div className="results-total">
                <span className="meta-label">Team Total</span>
                <strong>{teamTotal}</strong>
              </div>
              <div className="results-list">
                {game.bowlers.map((bowler) => (
                  <div className="results-row" key={bowler.id}>
                    <span>{bowler.name}</span>
                    <strong>{bowler.runningTotal}</strong>
                  </div>
                ))}
              </div>
              <div className="hero-actions">
                <button className="fire-button" type="button" onClick={startFreshGame}>
                  Bowl Again
                </button>
                <button className="ghost-button" type="button" onClick={returnToTitle}>
                  Title Screen
                </button>
              </div>
            </div>
            <LaneCanvas game={game} />
          </section>
        ) : null}
      </div>

      {portraitHint && game.screen !== 'title' ? (
        <div className="rotate-hint">
          <strong>Best in landscape.</strong>
          <span>Rotate your phone sideways for the full scoreboard and lane view.</span>
        </div>
      ) : null}

      {game.overlay === 'how-to' ? (
        <OverlayCard title="How To Play" onClose={closeOverlay}>
          <ol className="how-to-list">
            <li>Drag the start marker left or right on the approach to choose your board.</li>
            <li>Drag the target marker at the arrows to shape the line through the oil.</li>
            <li>Set spin in the dedicated hook control before the shot.</li>
            <li>Press and hold the power button, then release when the meter feels right.</li>
            <li>Finish all ten frames for all four bowlers and chase the team total.</li>
          </ol>
        </OverlayCard>
      ) : null}

      {game.overlay === 'settings' ? (
        <OverlayCard title="Settings" onClose={closeOverlay}>
          <div className="settings-list">
            <button
              className="fire-button fire-button--compact"
              type="button"
              onClick={() => {
                audioRef.current?.playUiTap();
                setGame((current) => setMuted(current, !current.settings.muted));
              }}
            >
              Audio: {game.settings.muted ? 'Muted' : 'Live'}
            </button>
            <button className="ghost-button" type="button" onClick={startFreshGame}>
              Restart Game
            </button>
            {game.screen !== 'title' ? (
              <button className="ghost-button" type="button" onClick={returnToTitle}>
                Back To Title
              </button>
            ) : null}
          </div>
        </OverlayCard>
      ) : null}

      {game.overlay === 'pause' ? (
        <OverlayCard title="Paused" onClose={closeOverlay}>
          <div className="settings-list">
            <button className="fire-button fire-button--compact" type="button" onClick={closeOverlay}>
              Resume Game
            </button>
            <button className="ghost-button" type="button" onClick={() => updateOverlay('how-to')}>
              How To Play
            </button>
            <button className="ghost-button" type="button" onClick={startFreshGame}>
              Restart Game
            </button>
            <button className="ghost-button" type="button" onClick={returnToTitle}>
              Title Screen
            </button>
          </div>
        </OverlayCard>
      ) : null}
    </div>
  );
}

function getChargePower(elapsedMs: number) {
  return clamp(0.34 + (elapsedMs / 1100) * 0.66, 0.34, 1);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
