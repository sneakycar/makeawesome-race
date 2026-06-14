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
import { formatLiveScore, formatStoredScore } from "@/lib/score";
import { formatOvrRank } from "@/lib/ovr";
import { formatTraitsDisplay, getIdentityText } from "@/lib/identity";
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
      ? formatLiveScore(liveRaceProgress)
      : formatLiveScore(clock.percentComplete);
  const progressBarWidth =
    liveRaceProgress != null ? liveRaceProgress : clock.percentComplete;

  return (
    <div className="race-meta-block">
      <div className="race-meta">
        <div className="race-meta-line">{`RACE ${state.race.race_number} ${beganWhen}`}</div>
        <div className="race-meta-line">{`PROGRESS: ${progressDisplay}`}</div>
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

function RetroStatBar({
  label,
  value,
  signature,
}: {
  label: string;
  value: number;
  signature?: boolean;
}) {
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
      <span className="retro-stat-num">
        {value}
        {signature ? " ★" : ""}
      </span>
    </div>
  );
}

function PlayerOverlay({
  slug,
  liveProgress,
  ovrInfo,
  onClose,
}: {
  slug: string;
  liveProgress?: number;
  ovrInfo?: { ovr: number; rank: number; total: number };
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
  const ovr = ovrInfo?.ovr ?? profile?.ovr;
  const ovrRank = ovrInfo?.rank ?? profile?.ovrRank;
  const ovrTotal = ovrInfo?.total ?? profile?.ovrTotal;
  const scoreDisplay =
    liveProgress != null
      ? formatLiveScore(liveProgress)
      : profile?.currentScore != null
        ? formatStoredScore(profile.currentScore)
        : null;

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
              {ovr != null && ovrRank != null && ovrTotal != null && (
                <div className="retro-ovr">
                  <span className="retro-ovr-num">{ovr}</span>
                  <span className="retro-ovr-label">OVR</span>
                  <span className="retro-ovr-rank">
                    {formatOvrRank({ ovr, rank: ovrRank, total: ovrTotal })}
                  </span>
                </div>
              )}
              <h2 className="retro-name">{p.name}</h2>
              <span className="retro-header-badge">{p.status}</span>
            </div>

            <div className="retro-box">
              <div className="retro-box-title">▶ STATUS</div>
              <div className="retro-status-grid">
                {profile.raceInjury?.is_injured && (
                  <>
                    <div className="retro-kv retro-kv-wide">
                      <span className="retro-k">RACE STATUS</span>
                      <span className="retro-v">🏥 INJURED</span>
                    </div>
                    {profile.raceInjury.injury_name && (
                      <div className="retro-kv retro-kv-wide">
                        <span className="retro-k">INJURY</span>
                        <span className="retro-v">{profile.raceInjury.injury_name}</span>
                      </div>
                    )}
                  </>
                )}
                {p.status === "injured" && (
                  <>
                    <div className="retro-kv retro-kv-wide">
                      <span className="retro-k">STATUS</span>
                      <span className="retro-v">INJURED</span>
                    </div>
                    {p.current_injury_name && (
                      <div className="retro-kv retro-kv-wide">
                        <span className="retro-k">INJURY</span>
                        <span className="retro-v">{p.current_injury_name}</span>
                      </div>
                    )}
                    <div className="retro-kv">
                      <span className="retro-k">OUT</span>
                      <span className="retro-v">{p.injury_races_remaining} RACES REMAINING</span>
                    </div>
                    <div className="retro-kv">
                      <span className="retro-k">RETURN</span>
                      <span className="retro-v">HOLDING</span>
                    </div>
                  </>
                )}
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
                {scoreDisplay != null && (
                  <div className="retro-kv retro-kv-wide">
                    <span className="retro-k">SCORE</span>
                    <span className="retro-v retro-score">{scoreDisplay}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="retro-box">
              <div className="retro-box-title">▶ IDENTITY</div>
              <div className="retro-identity-text">{getIdentityText(p)}</div>
              <div className="retro-status-grid">
                <div className="retro-kv retro-kv-wide">
                  <span className="retro-k">ARCHETYPE</span>
                  <span className="retro-v">{p.archetype ?? "UNKNOWN"}</span>
                </div>
                <div className="retro-kv retro-kv-wide">
                  <span className="retro-k">TRAITS</span>
                  <span className="retro-v">{formatTraitsDisplay(p.traits ?? [])}</span>
                </div>
                <div className="retro-kv">
                  <span className="retro-k">SIGNATURE</span>
                  <span className="retro-v">{(p.signature_stat ?? "grit").toUpperCase()} ★</span>
                </div>
              </div>
            </div>

            <div className="retro-box">
              <div className="retro-box-title">▶ STATS</div>
              <div className="retro-status-grid">
                <div className="retro-kv">
                  <span className="retro-k">HIGH RACE</span>
                  <span className="retro-v">{formatStoredScore(p.highest_race_score ?? 0)}</span>
                </div>
                <div className="retro-kv">
                  <span className="retro-k">HIGH CAREER</span>
                  <span className="retro-v">{formatStoredScore(p.highest_career_score ?? 0)}</span>
                </div>
                <div className="retro-kv">
                  <span className="retro-k">COMEBACK</span>
                  <span className="retro-v">
                    {p.biggest_comeback > 0 ? `+${p.biggest_comeback} SPOTS` : "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="retro-box">
              <div className="retro-box-title">▶ ABILITIES</div>
              <RetroStatBar label="GRIT" value={p.grit} signature={p.signature_stat === "grit"} />
              <RetroStatBar label="CHAOS" value={p.chaos} signature={p.signature_stat === "chaos"} />
              <RetroStatBar label="NERVE" value={p.nerve} signature={p.signature_stat === "nerve"} />
              <RetroStatBar label="LUCK" value={p.luck} signature={p.signature_stat === "luck"} />
              <RetroStatBar label="BURST" value={p.burst} signature={p.signature_stat === "burst"} />
              <RetroStatBar label="DRAG" value={p.drag} signature={p.signature_stat === "drag"} />
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

function InjuredSection({ players }: { players: Player[] }) {
  if (players.length === 0) {
    return <div className="holding-list">NONE</div>;
  }

  const list = players
    .map(
      (p) =>
        `${p.name} (${p.current_injury_name ?? "UNKNOWN"}, OUT ${p.injury_races_remaining})`
    )
    .join(", ");

  return <div className="holding-list">{list}</div>;
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
          RACERS
          {"\n\n"}
          Every racer is born with an archetype, traits, and a signature ability.
          These do not give the user control, but they shape how each racer behaves
          over time. Some are steady workhorses, some are unstable gamblers, some
          bloom late, some collapse under pressure, and some come back stronger
          after holding. The race is still automatic, but the racers are not
          identical.
        </p>
        <p>
          SUPPORT
          {"\n\n"}
          Once per race, visitors may give +1 support to a single racer. Support
          does not affect the current race. After the race ends, support creates
          a small chance for permanent growth. Strong racers improve slowly,
          while struggling racers benefit more. The machine remains in charge.
        </p>
        <p>
          INJURIES
          {"\n\n"}
          During a race, a racer can rarely suffer an injury. Injured racers freeze in place,
          stop gaining progress, and leave the active roster after the race. They miss one or
          more future races, then recover into Holding instead of returning directly to the
          track. Injuries do not happen often, but they can interrupt dynasties, create comeback
          arcs, and permanently mark a racer&apos;s history.
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

  const selectedEntry = selectedSlug
    ? state?.entries.find((e) => e.player.slug === selectedSlug)
    : undefined;
  const selectedLiveProgress =
    selectedEntry && liveRace
      ? liveRace.entries.get(selectedEntry.player_id)?.progress
      : undefined;

  const winner = state?.entries.find(
    (e) => (e.final_rank === 1 || e.current_rank === 1) && !e.is_injured
  );
  const raceInjured = state?.entries.filter((e) => e.is_injured) ?? [];
  const hadRaceInjuries = raceInjured.length > 0;
  const eliminated =
    !hadRaceInjuries &&
    state?.entries.find((e) => e.final_rank === 8 || e.current_rank === 8);

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
          {hadRaceInjuries &&
            raceInjured
              .map((e) => `INJURED: ${e.player.name} → ${e.injury_name ?? "UNKNOWN"}\n`)
              .join("")}
          {eliminated && `ELIMINATED: ${eliminated.player.name} → HOLDING\n\n`}
          {!hadRaceInjuries && !eliminated && winner && "\n"}
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
            const progress = entry.is_injured
              ? Number(entry.progress)
              : (live?.progress ?? entry.displayed_progress);
            const isInjured = entry.is_injured;
            const isComeback = !isInjured && entry.last_rank_change >= 2;
            const isLeader = !isInjured && rank === 1;
            const isLast = !isInjured && rank === 8;
            const barMark = isInjured
              ? null
              : isLeader
                ? "🏆"
                : isLast
                  ? "💀"
                  : isComeback
                    ? "👀"
                    : null;
            const filled = Math.min(18, Math.max(0, Math.round((progress / 100) * 18)));
            const isSupported = supportedId === entry.player_id;
            const hasSupported = supportedId != null;
            const ovrInfo = state.ovrByPlayerId[entry.player_id];

            let buttonDisabled =
              !raceActive || encouraging || hasSupported || isInjured;

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
                  <div className="row-ovr-strip">
                    {ovrInfo && (
                      <>
                        <span className="row-ovr">{ovrInfo.ovr} OVR</span>
                        <span className="row-ovr-rank">{formatOvrRank(ovrInfo)}</span>
                      </>
                    )}
                  </div>
                  <div className="row-head">
                    <span className="row-lane">Lane {entry.lane}</span>
                    <span className="row-name">{formatRacerName(entry.player.name)}</span>
                    {entry.player.archetype && entry.player.archetype !== "UNKNOWN" && (
                      <span className="row-archetype">{entry.player.archetype}</span>
                    )}
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
                    <span className="row-score">{formatLiveScore(progress)}</span>
                    {isInjured && (
                      <span className="row-injured">🏥 INJURED</span>
                    )}
                    {raceActive && !isInjured && (
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

          <div className="section-label">INJURED</div>
          <InjuredSection players={state.injured ?? []} />

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
        <PlayerOverlay
          slug={selectedSlug}
          liveProgress={selectedLiveProgress}
          ovrInfo={
            selectedEntry
              ? state?.ovrByPlayerId[selectedEntry.player_id]
              : undefined
          }
          onClose={() => setSelectedSlug(null)}
        />
      )}
    </main>
  );
}
