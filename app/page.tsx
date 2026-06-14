"use client";

import { useCallback, useEffect, useState } from "react";
import { getRaceClock, getMsUntilNextUpdate, type RaceClock } from "@/lib/race-clock";
import type { GameStateResponse, Player, PlayerProfileResponse, TickerEvent } from "@/lib/types";
import {
  formatRaceBegan,
  formatRemainingTime,
  formatCompactDuration,
  formatNextRaceBegin,
  pipCount20,
  formatStreak,
  formatTickerAge,
  formatCurrentRaceLabel,
  formatRacerName,
  formatTickerForDisplay,
  ordinal,
} from "@/lib/format";
import { formatLivePercent } from "@/lib/live-progress";
import { useLiveRace } from "@/lib/use-live-race";

function RaceMetaPanel({
  state,
  betweenRaces,
  raceActive,
  liveRaceProgress,
}: {
  state: GameStateResponse;
  betweenRaces: boolean;
  raceActive: boolean;
  liveRaceProgress: number | null;
}) {
  const [clock, setClock] = useState<RaceClock>(() =>
    getRaceClock(new Date(state.race.started_at), new Date(state.race.ends_at))
  );
  const [nextUpdateMs, setNextUpdateMs] = useState(() => getMsUntilNextUpdate());

  useEffect(() => {
    const startedAt = new Date(state.race.started_at);
    const endsAt = new Date(state.race.ends_at);

    const tick = () => {
      setClock(getRaceClock(startedAt, endsAt, new Date()));
      setNextUpdateMs(getMsUntilNextUpdate());
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.race.started_at, state.race.ends_at, state.race.status]);

  if (betweenRaces) {
    return (
      <div className="race-meta">
        BETWEEN RACES
        {"\n"}
        FINAL RESULTS — RACE {state.race.race_number}
      </div>
    );
  }

  const beganWhen =
    clock.phase === "upcoming"
      ? `BEGINS: ${formatRaceBegan(new Date(state.race.started_at))}`
      : `BEGAN: ${formatRaceBegan(new Date(state.race.started_at))}`;

  let timerLine = "";
  if (clock.phase === "upcoming") {
    timerLine = `STARTS IN: ${formatRemainingTime(clock.startsInMs)}`;
  } else if (raceActive && clock.phase === "live") {
    timerLine = `TIME REMAINING: ${formatRemainingTime(clock.remainingMs)}`;
  } else {
    timerLine = "RACE FINALIZED";
  }

  const progressDisplay =
    liveRaceProgress != null
      ? formatLivePercent(liveRaceProgress)
      : `${clock.percentComplete}.000`;
  const progressBarWidth =
    liveRaceProgress != null ? liveRaceProgress : clock.percentComplete;

  return (
    <div className="race-meta-block">
      <div className="race-meta">
        <div className="race-meta-line">{`RACE ${state.race.race_number} ${beganWhen}`}</div>
        <div className="race-meta-line">{`PROGRESS: ${progressDisplay}%`}</div>
        <div className="race-meta-line">{timerLine}</div>
        <div className="race-meta-line">{`NEXT UPDATE IN: ${formatCompactDuration(nextUpdateMs)}`}</div>
      </div>
      <div className="race-progress-track" aria-hidden="true">
        <div
          className="race-progress-fill"
          style={{ width: `${progressBarWidth}%` }}
        />
      </div>
    </div>
  );
}

function ScrollingTicker({
  events,
  serverTime,
  fallback,
}: {
  events: TickerEvent[];
  serverTime: string;
  fallback: string;
}) {
  const now = new Date(serverTime);
  const line = events.length
    ? events
        .map(
          (e) =>
            `${formatTickerForDisplay(e.message)} (${formatTickerAge(e.created_at, now)})`
        )
        .join(" · ")
    : formatTickerForDisplay(fallback);

  return (
    <div className="ticker-wrap" aria-live="polite">
      <div className="ticker-label">Ticker</div>
      <div className="ticker-viewport">
        <div className="ticker-track">
          <span className="ticker-chunk">{line}</span>
          <span className="ticker-chunk">{line}</span>
        </div>
      </div>
    </div>
  );
}

function RetroStatBar({ label, value }: { label: string; value: number }) {
  const filled = pipCount20(value);
  return (
    <div className="retro-stat-row">
      <span className="retro-stat-label">{label}</span>
      <div className="retro-pip-track" aria-label={`${label} ${value} out of 100`}>
        {Array.from({ length: 20 }, (_, i) => (
          <span
            key={i}
            className={i < filled ? "retro-pip retro-pip-on" : "retro-pip retro-pip-off"}
          />
        ))}
      </div>
      <span className="retro-stat-num">{value}</span>
    </div>
  );
}

function PlayerOverlay({
  slug,
  onClose,
}: {
  slug: string;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<PlayerProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/player/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          if (data.error) setError(data.error);
          else setProfile(data);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load player");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "x" || e.key === "X") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const p = profile?.player;

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="overlay-scanlines" aria-hidden="true" />
      <div className="retro-screen" onClick={(e) => e.stopPropagation()}>
        {error && <p className="retro-error">{error}</p>}
        {!profile && !error && <p className="retro-loading">LOADING...</p>}
        {p && (
          <>
            <div className="retro-header">
              <span className="retro-header-tag">RACER FILE</span>
              <h2 className="retro-name">{p.name}</h2>
              <span className="retro-header-badge">{p.status}</span>
            </div>

            <div className="retro-box">
              <div className="retro-box-title">▶ STATUS</div>
              <div className="retro-status-grid">
                <div className="retro-kv">
                  <span className="retro-k">AGE</span>
                  <span className="retro-v">{p.age_days} DAYS</span>
                </div>
                {profile.currentRaceNumber != null && (
                  <div className="retro-kv">
                    <span className="retro-k">RACE</span>
                    <span className="retro-v">
                      {formatCurrentRaceLabel(profile.currentRaceNumber, profile.currentRank)}
                    </span>
                  </div>
                )}
                {profile.currentProgress != null && (
                  <div className="retro-kv retro-kv-wide">
                    <span className="retro-k">PROGRESS</span>
                    <span className="retro-v">{profile.currentProgress.toFixed(2)}%</span>
                  </div>
                )}
              </div>
            </div>

            <div className="retro-box">
              <div className="retro-box-title">▶ ATTRIBUTES</div>
              <RetroStatBar label="GRIT" value={p.grit} />
              <RetroStatBar label="CHAOS" value={p.chaos} />
              <RetroStatBar label="NERVE" value={p.nerve} />
              <RetroStatBar label="LUCK" value={p.luck} />
              <RetroStatBar label="BURST" value={p.burst} />
              <RetroStatBar label="DRAG" value={p.drag} />
            </div>

            <div className="retro-box">
              <div className="retro-box-title">▶ CAREER</div>
              <div className="retro-career-grid">
                <div className="retro-kv">
                  <span className="retro-k">RACES</span>
                  <span className="retro-v">{p.races}</span>
                </div>
                <div className="retro-kv">
                  <span className="retro-k">WINS</span>
                  <span className="retro-v">{p.wins}</span>
                </div>
                <div className="retro-kv">
                  <span className="retro-k">OUTS</span>
                  <span className="retro-v">{p.eliminations}</span>
                </div>
                <div className="retro-kv">
                  <span className="retro-k">RETURNS</span>
                  <span className="retro-v">{p.returns}</span>
                </div>
                <div className="retro-kv">
                  <span className="retro-k">BEST</span>
                  <span className="retro-v">
                    {p.best_finish != null ? ordinal(p.best_finish) : "—"}
                  </span>
                </div>
                <div className="retro-kv">
                  <span className="retro-k">WORST</span>
                  <span className="retro-v">
                    {p.worst_finish != null ? ordinal(p.worst_finish) : "—"}
                  </span>
                </div>
                <div className="retro-kv">
                  <span className="retro-k">STREAK</span>
                  <span className="retro-v">
                    {formatStreak(p.current_streak_type, p.current_streak_count)}
                  </span>
                </div>
                <div className="retro-kv">
                  <span className="retro-k">WIN STK</span>
                  <span className="retro-v">{p.longest_win_streak}</span>
                </div>
                <div className="retro-kv">
                  <span className="retro-k">HOLDING</span>
                  <span className="retro-v">{p.total_holding_days}D</span>
                </div>
                <div className="retro-kv">
                  <span className="retro-k">SUPPORT</span>
                  <span className="retro-v">{p.total_support_received ?? 0}</span>
                </div>
              </div>
            </div>

            <div className="retro-box">
              <div className="retro-box-title">▶ GAME LOG</div>
              <div className="retro-log">
                {profile.history.length === 0 ? (
                  <div className="retro-log-line retro-log-empty">— NO ENTRIES —</div>
                ) : (
                  profile.history.map((h) => (
                    <div key={h.id} className="retro-log-line">
                      ► DAY {h.day_number} · {h.event_text}
                    </div>
                  ))
                )}
              </div>
            </div>

            <button type="button" className="retro-close" onClick={onClose}>
              ◄ PRESS [X] TO CLOSE ►
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StreakSection({ streaks }: { streaks: GameStateResponse["streaks"] }) {
  if (streaks.length === 0) {
    return <p className="streak-empty">No active streaks yet</p>;
  }

  return (
    <div className="streak-list">
      {streaks.map((entry) => {
        const isWin = entry.current_streak_type === "win";
        return (
          <div key={entry.slug} className="streak-row">
            <span className={isWin ? "streak-badge streak-win" : "streak-badge streak-lose"}>
              {formatStreak(entry.current_streak_type, entry.current_streak_count)}
            </span>
            <span className="streak-name">{formatRacerName(entry.name)}</span>
          </div>
        );
      })}
    </div>
  );
}

function HoldingSection({ players }: { players: Player[] }) {
  if (players.length === 0) {
    return (
      <p className="holding-empty">
        Racers who have lost a race appear here and remain in the pool for future races.
      </p>
    );
  }

  const shown = players.slice(0, 20);
  const list = shown.map((p) => `${p.name} (AGE ${p.age_days})`).join(", ");
  const text =
    players.length > 20 ? `${list}, ...AND ${players.length - 20} MORE` : list;

  return <div className="holding-list">{text}</div>;
}

function AboutSection() {
  return (
    <details className="about-details">
      <summary className="about-summary">ABOUT</summary>
      <div className="about">
        <p>
          HOLES RACE is an eternal automatic daily race between generated names.
          Every race runs 9:00 AM – 9:00 PM EST. Last place is sent to holding.
          A new racer or returning loser enters tomorrow. Every racer keeps their
          history forever.
        </p>
        <p>
          Once per race, visitors may encourage a single racer. Encouragement does
          not affect the current race. Instead, it creates a small chance for
          permanent growth after the race is complete. Strong racers improve
          slowly, while struggling racers benefit more. The race itself remains
          fully automatic.
        </p>
      </div>
    </details>
  );
}

export default function HomePage() {
  const [state, setState] = useState<GameStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [encourageError, setEncourageError] = useState<string | null>(null);
  const [encouraging, setEncouraging] = useState(false);
  const [devBusy, setDevBusy] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load");
        return;
      }
      setError(null);
      setState(data);
    } catch {
      setError("Failed to load game state");
    }
  }, []);

  useEffect(() => {
    loadState();
    const interval = setInterval(loadState, 30000);
    return () => clearInterval(interval);
  }, [loadState]);

  const handleEncourage = async (playerId: string) => {
    if (encouraging || state?.encouragement.supportedPlayerId) return;
    setEncouraging(true);
    setEncourageError(null);
    try {
      const res = await fetch("/api/encourage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEncourageError(data.error || "Could not encourage");
        return;
      }
      setState((prev) =>
        prev
          ? {
              ...prev,
              encouragement: { supportedPlayerId: playerId },
            }
          : prev
      );
    } catch {
      setEncourageError("Could not encourage");
    } finally {
      setEncouraging(false);
    }
  };

  const supportedId = state?.encouragement.supportedPlayerId ?? null;
  const raceActive = state?.race.status === "active";
  const betweenRaces = state?.betweenRaces ?? false;
  const liveRace = useLiveRace(state, raceActive);

  const winner = state?.entries.find((e) => e.final_rank === 1 || e.current_rank === 1);
  const eliminated = state?.entries.find((e) => e.final_rank === 8 || e.current_rank === 8);

  const handleDevAction = async (path: string) => {
    setDevBusy(true);
    setDevError(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setDevError(data.error || "Dev action failed");
        return;
      }
      await loadState();
    } catch {
      setDevError("Dev action failed");
    } finally {
      setDevBusy(false);
    }
  };

  return (
    <main>
      {state && (
        <ScrollingTicker
          events={state.ticker}
          serverTime={state.serverTime}
          fallback={
            state.race.status === "active"
              ? "Race in progress — awaiting first broadcast"
              : "Awaiting race updates"
          }
        />
      )}

      <h1 className="title">HOLES RACE</h1>

      {error && <p className="error">{error}</p>}
      {encourageError && <p className="error">{encourageError}</p>}
      {devError && <p className="error">{devError}</p>}
      {!state && !error && <p className="loading">LOADING...</p>}

      {state && betweenRaces && (
        <div className="between-races">
          {`RACE ${state.race.race_number} COMPLETE\n\n`}
          {winner && `WINNER: ${winner.player.name}\n`}
          {eliminated && `ELIMINATED: ${eliminated.player.name} → HOLDING\n\n`}
          {state.nextRaceNumber != null &&
            state.nextRaceStartsAt != null &&
            `NEXT RACE: ${state.nextRaceNumber} BEGINS ${formatNextRaceBegin(new Date(state.nextRaceStartsAt))}`}
        </div>
      )}

      {state && (
        <>
          <RaceMetaPanel
            state={state}
            betweenRaces={betweenRaces}
            raceActive={raceActive}
            liveRaceProgress={liveRace?.raceProgress ?? null}
          />

          <p className="tap-hint">tap to see player&apos;s stats</p>

          <div className="race-standings">
          {[...state.entries]
            .sort((a, b) => a.lane - b.lane)
            .map((entry) => {
            const live = liveRace?.entries.get(entry.player_id);
            const rank = live?.current_rank ?? entry.current_rank;
            const progress = live?.progress ?? entry.displayed_progress;
            const isComeback = entry.last_rank_change >= 2;
            const isLeader = rank === 1;
            const isLast = rank === 8;
            const barMark = isLeader ? "🏆" : isLast ? "💀" : isComeback ? "👀" : null;
            const filled = Math.min(18, Math.max(0, Math.round((progress / 100) * 18)));
            const isSupported = supportedId === entry.player_id;
            const hasSupported = supportedId != null;

            let buttonDisabled = !raceActive || encouraging || hasSupported;

            return (
              <div key={entry.id} className="row-line">
                <div
                  className="row-main"
                  onClick={() => setSelectedSlug(entry.player.slug)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setSelectedSlug(entry.player.slug);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="row-head">
                    <span className="row-lane">Lane {entry.lane}</span>
                    <span className="row-name">{formatRacerName(entry.player.name)}</span>
                  </div>
                  <div className="row-track">
                    <div className="row-bar-cell">
                      <span className="row-bar">
                        <span className="row-bar-fill">{"█".repeat(filled)}</span>
                        <span className="row-bar-empty">{"░".repeat(18 - filled)}</span>
                      </span>
                      {barMark && (
                        <span
                          className="row-bar-mark"
                          title={
                            isLeader
                              ? "Race leader"
                              : isLast
                                ? "Last place"
                                : `Up ${entry.last_rank_change} spots since last update`
                          }
                        >
                          {barMark}
                        </span>
                      )}
                    </div>
                    <span className="row-pct">{formatLivePercent(progress)}%</span>
                    {raceActive && (
                      <button
                        type="button"
                        className={`encourage-btn${isSupported ? " supported" : ""}`}
                        disabled={buttonDisabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEncourage(entry.player_id);
                        }}
                      >
                        +1
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          </div>

          <div className="race-legend">
            <span className="legend-key">
              <span className="row-bar-mark" aria-hidden="true">🏆</span>
              LEAD
            </span>
            <span className="legend-key">
              <span className="row-bar-mark" aria-hidden="true">👀</span>
              COMEBACK
            </span>
            <span className="legend-key">
              <span className="row-bar-mark" aria-hidden="true">💀</span>
              LAST
            </span>
          </div>

          <div className="divider">{"────────────────────────"}</div>

          <div className="section-label">ALL-TIME</div>
          {state.allTime.length === 0 ? (
            <p className="all-time-empty">Awaiting first race results</p>
          ) : (
            state.allTime.map((p, i) => (
              <div key={p.id} className="all-time-row">
                {i + 1}] {p.name} — {p.wins} WIN{p.wins === 1 ? "" : "S"}
              </div>
            ))
          )}

          <div className="section-label">STREAK</div>
          <StreakSection streaks={state.streaks} />

          <div className="section-label">HOLDING</div>
          <HoldingSection players={state.holding} />

          <div className="divider">{"────────────────────────"}</div>

          <AboutSection />

          {state.devTools && (
            <div className="dev-tools">
              DEV
              {"\n"}
              {raceActive && (
                <button
                  type="button"
                  className="dev-btn"
                  disabled={devBusy}
                  onClick={() => handleDevAction("/api/dev/finalize-race")}
                >
                  [END RACE]
                </button>
              )}
              {betweenRaces && (
                <button
                  type="button"
                  className="dev-btn"
                  disabled={devBusy}
                  onClick={() => handleDevAction("/api/dev/start-next-race")}
                >
                  [START NEXT RACE]
                </button>
              )}
            </div>
          )}
        </>
      )}

      {selectedSlug && (
        <PlayerOverlay slug={selectedSlug} onClose={() => setSelectedSlug(null)} />
      )}
    </main>
  );
}
