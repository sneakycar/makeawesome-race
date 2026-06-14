"use client";

import { useCallback, useEffect, useState } from "react";
import type { GameStateResponse, Player, PlayerProfileResponse } from "@/lib/types";
import {
  formatPips,
  formatProgressBar,
  formatRemainingTime,
  formatStreak,
  formatTimeHMS,
  formatTickerLine,
  ordinal,
  padName,
} from "@/lib/format";

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
      <div className="overlay-inner" onClick={(e) => e.stopPropagation()}>
        {error && <p className="error">{error}</p>}
        {!profile && !error && <p className="loading">LOADING...</p>}
        {p && (
          <>
            {p.name}

            {"\n\n"}STATUS: {p.status.toUpperCase()}
            {"\n"}AGE: {p.age_days} DAYS
            {profile.currentRank != null && (
              <>
                {"\n"}CURRENT RACE: {ordinal(profile.currentRank)}
              </>
            )}
            {profile.currentProgress != null && (
              <>
                {"\n"}CURRENT PROGRESS: {profile.currentProgress}%
              </>
            )}

            {"\n\n"}ABILITIES

            {"\n\n"}GRIT      {formatPips(p.grit)}
            {"\n"}CHAOS     {formatPips(p.chaos)}
            {"\n"}NERVE     {formatPips(p.nerve)}
            {"\n"}LUCK      {formatPips(p.luck)}
            {"\n"}BURST     {formatPips(p.burst)}
            {"\n"}DRAG      {formatPips(p.drag)}

            {"\n\n"}CAREER

            {"\n\n"}RACES: {p.races}
            {"\n"}WINS: {p.wins}
            {"\n"}ELIMINATIONS: {p.eliminations}
            {"\n"}RETURNS: {p.returns}
            {"\n"}BEST FINISH: {p.best_finish != null ? ordinal(p.best_finish) : "—"}
            {"\n"}WORST FINISH: {p.worst_finish != null ? ordinal(p.worst_finish) : "—"}
            {"\n"}CURRENT STREAK: {formatStreak(p.current_streak_type, p.current_streak_count)}
            {"\n"}LONGEST WIN STREAK: {p.longest_win_streak}
            {"\n"}TOTAL DAYS IN HOLDING: {p.total_holding_days}
            {"\n"}TOTAL SUPPORT RECEIVED: {p.total_support_received ?? 0}

            {"\n\n"}HISTORY

            {"\n\n"}
            {profile.history.length === 0
              ? "NO HISTORY YET"
              : profile.history
                  .map((h) => `DAY ${h.day_number} — ${h.event_text}`)
                  .join("\n")}

            {"\n\n"}
            <button type="button" className="overlay-close" onClick={onClose}>
              [CLOSE]
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function formatHolding(players: Player[]): string {
  if (players.length === 0) return "EMPTY";
  const shown = players.slice(0, 20);
  const list = shown.map((p) => `${p.name} (AGE ${p.age_days})`).join(", ");
  if (players.length > 20) {
    return `${list}, ...AND ${players.length - 20} MORE`;
  }
  return list;
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
        <div className="ticker" aria-live="polite">
          <span className="ticker-label">TICKER</span>
          {formatTickerLine(state.ticker, new Date(state.serverTime))}
        </div>
      )}

      <h1 className="title">MAKEAWESOME RACE</h1>

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
            `NEXT RACE: ${state.nextRaceNumber} BEGINS AT 12:00:00 AM`}
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
                RACE {state.race.race_number}
                {"\n"}
                {state.percentComplete}% COMPLETE
                {"\n"}
                BEGAN {formatTimeHMS(new Date(state.race.started_at))}
                {"\n"}
                {raceActive
                  ? formatRemainingTime(state.remainingMs)
                  : "RACE FINALIZED"}
              </>
            )}
          </div>

          {state.entries.map((entry) => {
            const bar = formatProgressBar(entry.displayed_progress);
            const line = `${entry.current_rank}] ${padName(entry.player.name)} ${bar} ${entry.displayed_progress}%`;
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

          <div className="divider">{"────────────────────────"}</div>

          <div className="section-label">ALL-TIME</div>
          {state.allTime.length === 0 ? (
            <div>NO WINS YET</div>
          ) : (
            state.allTime.map((p, i) => (
              <div key={p.id}>
                {i + 1}] {p.name} — {p.wins} WIN{p.wins === 1 ? "" : "S"}
              </div>
            ))
          )}

          <div className="section-label">HOLDING</div>
          <div className="holding-list">{formatHolding(state.holding)}</div>

          <div className="divider">{"────────────────────────"}</div>

          <div className="section-label">ABOUT</div>
          <div className="about">
            MAKEAWESOME RACE is an eternal automatic daily race between generated names.
            Every day has 8 racers. Last place is sent to holding. A new racer or returning
            loser enters tomorrow. Every racer keeps their history forever.
            {"\n\n"}
            SUPPORT
            {"\n\n"}
            Once per race, visitors may encourage a single racer. Encouragement does not
            affect the current race. Instead, it creates a small chance for permanent growth
            after the race is complete. Strong racers improve slowly, while struggling racers
            benefit more. The race itself remains fully automatic.
          </div>

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
