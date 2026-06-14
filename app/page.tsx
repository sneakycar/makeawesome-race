"use client";

import { useCallback, useEffect, useState } from "react";
import type { GameStateResponse, Player, PlayerProfileResponse, TickerEvent } from "@/lib/types";
import {
  formatPips,
  formatProgressBar,
  formatRaceBegan,
  formatRemainingTime,
  formatNextRaceBegin,
  formatStreak,
  formatTickerAge,
  ordinal,
  padName,
} from "@/lib/format";

function ScrollingTicker({
  events,
  serverTime,
}: {
  events: TickerEvent[];
  serverTime: string;
}) {
  if (!events.length) return null;

  const now = new Date(serverTime);
  const chunks = events.map(
    (e) => `${e.message} (${formatTickerAge(e.created_at, now)})`
  );
  const line = chunks.join(" · ");

  return (
    <div className="ticker-wrap" aria-live="polite">
      <div className="ticker-label">TICKER</div>
      <div className="ticker-viewport">
        <div className="ticker-track">
          <span className="ticker-chunk">{line}</span>
          <span className="ticker-chunk">{line}</span>
        </div>
      </div>
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
      <div className="overlay-panel" onClick={(e) => e.stopPropagation()}>
        {error && <p className="error">{error}</p>}
        {!profile && !error && <p className="loading">LOADING...</p>}
        {p && (
          <>
            <div className="overlay-panel-name">{p.name}</div>

            <div className="overlay-section">
              <div className="overlay-section-title">STATUS</div>
              <span className="overlay-stat">STATUS: {p.status.toUpperCase()}</span>
              <span className="overlay-stat">AGE: {p.age_days} DAYS</span>
              {profile.currentRank != null && (
                <span className="overlay-stat">
                  CURRENT RACE: {ordinal(profile.currentRank)}
                </span>
              )}
              {profile.currentProgress != null && (
                <span className="overlay-stat">
                  CURRENT PROGRESS: {profile.currentProgress}%
                </span>
              )}
            </div>

            <div className="overlay-section">
              <div className="overlay-section-title">ABILITIES</div>
              <span className="overlay-ability">GRIT      {formatPips(p.grit)}</span>
              <span className="overlay-ability">CHAOS     {formatPips(p.chaos)}</span>
              <span className="overlay-ability">NERVE     {formatPips(p.nerve)}</span>
              <span className="overlay-ability">LUCK      {formatPips(p.luck)}</span>
              <span className="overlay-ability">BURST     {formatPips(p.burst)}</span>
              <span className="overlay-ability">DRAG      {formatPips(p.drag)}</span>
            </div>

            <div className="overlay-section">
              <div className="overlay-section-title">CAREER</div>
              <span className="overlay-stat">RACES: {p.races}</span>
              <span className="overlay-stat">WINS: {p.wins}</span>
              <span className="overlay-stat">ELIMINATIONS: {p.eliminations}</span>
              <span className="overlay-stat">RETURNS: {p.returns}</span>
              <span className="overlay-stat">
                BEST FINISH: {p.best_finish != null ? ordinal(p.best_finish) : "—"}
              </span>
              <span className="overlay-stat">
                WORST FINISH: {p.worst_finish != null ? ordinal(p.worst_finish) : "—"}
              </span>
              <span className="overlay-stat">
                CURRENT STREAK: {formatStreak(p.current_streak_type, p.current_streak_count)}
              </span>
              <span className="overlay-stat">LONGEST WIN STREAK: {p.longest_win_streak}</span>
              <span className="overlay-stat">TOTAL DAYS IN HOLDING: {p.total_holding_days}</span>
              <span className="overlay-stat">
                TOTAL SUPPORT RECEIVED: {p.total_support_received ?? 0}
              </span>
            </div>

            <div className="overlay-section">
              <div className="overlay-section-title">HISTORY</div>
              {profile.history.length === 0 ? (
                <span className="overlay-stat">NO HISTORY YET</span>
              ) : (
                profile.history.map((h) => (
                  <span key={h.id} className="overlay-history-item">
                    DAY {h.day_number} — {h.event_text}
                  </span>
                ))
              )}
            </div>

            <button type="button" className="overlay-close" onClick={onClose}>
              [CLOSE]
            </button>
          </>
        )}
      </div>
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
    const interval = setInterval(loadState, 60000);
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
      {state?.ticker && state.ticker.length > 0 && (
        <ScrollingTicker events={state.ticker} serverTime={state.serverTime} />
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
          <div className="race-meta">
            {betweenRaces ? (
              <>
                BETWEEN RACES
                {"\n"}
                FINAL RESULTS — RACE {state.race.race_number}
              </>
            ) : (
              <>
                {`RACE ${state.race.race_number}\n`}
                {`BEGAN: ${formatRaceBegan(new Date(state.race.started_at))}\n`}
                {`PROGRESS: ${state.percentComplete}%\n`}
                {raceActive
                  ? `TIME REMAINING: ${formatRemainingTime(state.remainingMs)}`
                  : "RACE FINALIZED"}
              </>
            )}
          </div>

          <p className="tap-hint">tap to see player&apos;s stats</p>

          {state.entries.map((entry) => {
            const bar = formatProgressBar(entry.displayed_progress);
            const line = `LANE ${entry.lane}] ${padName(entry.player.name)} ${bar} ${entry.displayed_progress}%`;
            const isLeader = entry.current_rank === 1;
            const isComeback = entry.last_rank_change >= 2;
            const rowClasses = [
              "row-line",
              isLeader ? "row-leader" : "",
              isComeback ? "row-comeback" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const isSupported = supportedId === entry.player_id;
            const hasSupported = supportedId != null;

            let buttonLabel = "[+1]";
            let buttonDisabled = !raceActive || encouraging;

            if (isSupported) {
              buttonLabel = "[SUPPORTED]";
              buttonDisabled = true;
            } else if (hasSupported) {
              buttonLabel = "[+1]";
              buttonDisabled = true;
            }

            return (
              <div key={entry.id} className={rowClasses}>
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
                  {line}
                </div>
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
                    {buttonLabel}
                  </button>
                )}
              </div>
            );
          })}

          <div className="race-legend">
            <span className="legend-key legend-leader">
              <span className="legend-swatch legend-swatch-leader" aria-hidden="true" />
              LEADER
            </span>
            <span className="legend-key legend-comeback">
              <span className="legend-swatch legend-swatch-comeback" aria-hidden="true" />
              COMEBACK (+2 SPOTS)
            </span>
          </div>

          <div className="divider">{"────────────────────────"}</div>

          <div className="section-label">ALL-TIME</div>
          {state.allTime.length === 0 ? (
            <div>NO WINS YET</div>
          ) : (
            state.allTime.map((p, i) => (
              <div key={p.id} className="all-time-row">
                {i + 1}] {p.name} — {p.wins} WIN{p.wins === 1 ? "" : "S"}
              </div>
            ))
          )}

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
