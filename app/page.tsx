"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRaceClock, type RaceClock } from "@/lib/race-clock";
import { useCronUpdate } from "@/lib/use-cron-update";
import { TickBurstOverlay } from "@/app/components/tick-burst-overlay";
import type { GameStateResponse, Player, TickerEvent } from "@/lib/types";
import Link from "next/link";
import {
  formatRaceBegan,
  formatRemainingTime,
  formatCompactDuration,
  formatNextRaceBegin,
  formatStreak,
  formatRacerName,
  formatTickerForDisplay,
  formatTickerAge,
  ordinal,
} from "@/lib/format";
import { formatRaceScore, getScorePipBackground, HARD_SCORE_CAP, SCORE_PIP_SLOTS } from "@/lib/score";
import { getRaceProgressPipSurfaceStyle } from "@/lib/race-progress-art";
import { useLiveRace } from "@/lib/use-live-race";
import { useDayNight, useHomeDayNightTheme } from "@/lib/use-day-night";
import { useRaceWeather } from "@/lib/use-race-weather";
import { formatRankDelta, useLiveRankDelta } from "@/lib/use-live-rank-delta";
import { RaceWeatherOverlay } from "@/app/components/race-weather-overlay";
import { canEncourageVote, vibrateNope } from "@/lib/nope-feedback";
import { calculateLiveOdds } from "@/lib/live-odds";
import { buildLiveScoreMap, computeLiveRanks } from "@/lib/live-standings";
import { PlayerCardOverlay } from "@/app/components/player-card-overlay";
import { FlatIcon, type RaceIconId } from "@/app/components/flat-icons";

function RaceDelayOverlay({
  delay,
}: {
  delay: NonNullable<GameStateResponse["raceDelay"]>;
}) {
  const [resumesInMs, setResumesInMs] = useState(delay.resumesInMs ?? 0);

  useEffect(() => {
    if (!delay.until) return;
    const tick = () => {
      setResumesInMs(Math.max(0, new Date(delay.until!).getTime() - Date.now()));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [delay.until]);

  return (
    <div
      className="delay-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delay-title"
    >
      <div className="delay-overlay-scanlines" aria-hidden="true" />
      <div className="retro-screen delay-screen">
        <div className="retro-header retro-header--brand">
          <span className="retro-header-tag">OFFICIAL NOTICE</span>
          <h2 id="delay-title" className="retro-name">
            {delay.title}
          </h2>
          <span className="retro-header-badge delay-badge">DELAYED</span>
        </div>
        <div className="retro-box">
          <div className="retro-box-title">▶ REASON</div>
          <p className="delay-body">{delay.body}</p>
        </div>
        <div className="retro-box">
          <div className="retro-box-title">▶ STATUS</div>
          <div className="retro-status-grid">
            <div className="retro-kv retro-kv-wide">
              <span className="retro-k">RESUMES IN</span>
              <span className="retro-v">{formatRemainingTime(resumesInMs)}</span>
            </div>
            {delay.frozenPercent != null && (
              <div className="retro-kv">
                <span className="retro-k">PROGRESS</span>
                <span className="retro-v">{`${delay.frozenPercent}%`}</span>
              </div>
            )}
          </div>
        </div>
        <p className="delay-wait">◄ STAND BY ►</p>
      </div>
    </div>
  );
}

function RaceMetaPanel({
  state,
  betweenRaces,
  raceActive,
  liveRaceProgress,
  nextUpdateMs,
  raceDelay,
  isNight,
}: {
  state: GameStateResponse;
  betweenRaces: boolean;
  raceActive: boolean;
  liveRaceProgress: number | null;
  nextUpdateMs: number;
  raceDelay: GameStateResponse["raceDelay"];
  isNight: boolean;
}) {
  const delayOpts =
    raceDelay?.active && raceDelay.until && raceDelay.frozenPercent != null
      ? { delayUntil: raceDelay.until, frozenPercent: raceDelay.frozenPercent }
      : null;

  const [clock, setClock] = useState<RaceClock>(() =>
    getRaceClock(
      new Date(state.race.started_at),
      new Date(state.race.ends_at),
      new Date(),
      delayOpts
    )
  );

  useEffect(() => {
    const startedAt = new Date(state.race.started_at);
    const endsAt = new Date(state.race.ends_at);

    const tick = () => {
      setClock(getRaceClock(startedAt, endsAt, new Date(), delayOpts));
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [
    state.race.started_at,
    state.race.ends_at,
    state.race.status,
    raceDelay?.until,
    raceDelay?.frozenPercent,
    raceDelay?.active,
  ]);

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
  if (clock.phase === "delayed") {
    timerLine = `RESUMES IN: ${formatRemainingTime(clock.remainingMs)}`;
  } else if (clock.phase === "upcoming") {
    timerLine = `STARTS IN: ${formatRemainingTime(clock.startsInMs)}`;
  } else if (raceActive && clock.phase === "live") {
    timerLine = `TIME REMAINING: ${formatRemainingTime(clock.remainingMs)}`;
  } else {
    timerLine = "RACE FINALIZED";
  }

  const progressBarWidth =
    clock.phase === "delayed" && raceDelay?.frozenPercent != null
      ? raceDelay.frozenPercent
      : liveRaceProgress != null
        ? liveRaceProgress
        : clock.percentComplete;

  return (
    <div className="race-meta-block">
      <div className="race-meta">
        <div className="race-meta-line">{`RACE ${state.race.race_number} ${beganWhen}`}</div>
        <div className="race-meta-line race-meta-progress-row">
          <RaceProgressPipBar percent={progressBarWidth} isNight={isNight} />
        </div>
        <div className="race-meta-gap" aria-hidden="true" />
        <div className="race-meta-line">{timerLine}</div>
        <div className="race-meta-line">
          NEXT UPDATE IN:{" "}
          <span
            className={
              nextUpdateMs < 3 * 60 * 1000 ? "race-meta-next-soon" : undefined
            }
          >
            {formatCompactDuration(nextUpdateMs)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ScrollingTicker({
  events,
  serverTime,
  raceNumber,
  fallback,
}: {
  events: TickerEvent[];
  serverTime: string;
  raceNumber: number;
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
      <div className="ticker-badge">RACE {raceNumber}</div>
      <div className="ticker-viewport">
        <div className="ticker-track">
          <span className="ticker-chunk">{line}</span>
          <span className="ticker-chunk">{line}</span>
        </div>
      </div>
    </div>
  );
}

function RaceProgressPipBar({
  percent,
  isNight,
}: {
  percent: number;
  isNight: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const displayPct = Math.round(clamped);
  const filled = Math.max(
    0,
    Math.min(SCORE_PIP_SLOTS, Math.floor((clamped / 100) * SCORE_PIP_SLOTS))
  );
  const fillEdgePct = (filled / SCORE_PIP_SLOTS) * 100;
  const markerLeft =
    filled <= 0 ? 3 : Math.max(3, Math.min(97, fillEdgePct));

  return (
    <div
      className={`race-progress-wrap${isNight ? " is-night" : ""}`}
      role="progressbar"
      aria-valuenow={displayPct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Race ${displayPct}% complete`}
    >
      <div
        className="race-progress-marker"
        style={{ left: `${markerLeft}%` }}
        aria-hidden="true"
      >
        <span className="race-progress-marker-label">{displayPct}% DONE</span>
        <span className="race-progress-marker-point" />
      </div>
      <div className="race-progress-pip-viewport">
        <div className={`race-progress-pip-pill${isNight ? " is-night" : ""}`}>
          <div className="race-progress-pip-track">
            {Array.from({ length: SCORE_PIP_SLOTS }, (_, i) => {
              const isOn = i < filled;
              return (
                <span
                  key={i}
                  className={`race-progress-pip${isOn ? " race-progress-pip-on" : " race-progress-pip-dim"}`}
                  style={
                    isOn
                      ? getRaceProgressPipSurfaceStyle(
                          i,
                          Math.max(1, filled - 1),
                          isNight
                        )
                      : undefined
                  }
                />
              );
            })}
          </div>
          <div className="race-progress-pip-bezel" />
        </div>
      </div>
    </div>
  );
}

function ScorePipTrack({
  score,
  animatingDelta,
  leaderScore,
  isLeader,
  isNight,
  statusOverlay,
}: {
  score: number;
  animatingDelta: number;
  leaderScore: number;
  isLeader: boolean;
  isNight: boolean;
  statusOverlay?: { icon: RaceIconId; label: string };
}) {
  const leader = Math.max(1, Math.min(HARD_SCORE_CAP, Math.round(leaderScore)));
  const slots = leader;
  const livePoints = Math.max(0, Math.min(HARD_SCORE_CAP, score));
  const pipBright = Math.floor(livePoints);
  const pipPartial = livePoints - pipBright;
  const displayPoints = Math.round(livePoints);
  const behind = leader - displayPoints;
  const colorSpan = Math.max(1, leader);

  return (
    <div
      className={`score-pip-viewport${
        statusOverlay ? " score-pip-viewport-paused" : ""
      }${isNight ? " is-night" : ""}`}
      aria-label={
        statusOverlay
          ? `${statusOverlay.label} — ${displayPoints} points`
          : isLeader
            ? `${displayPoints} points, race leader`
            : `${displayPoints} points, ${behind} behind leader`
      }
      title={
        statusOverlay
          ? `${statusOverlay.label} — ${displayPoints} pts`
          : isLeader
            ? `${displayPoints} points`
            : `${displayPoints} pts · ${behind} behind lead`
      }
    >
      <div className={`score-pip-track${isLeader ? " score-pip-track-leader" : ""}`}>
        {Array.from({ length: slots }, (_, i) => {
          if (i < pipBright) {
            return (
              <span
                key={i}
                className="score-pip score-pip-on"
                style={{
                  background: getScorePipBackground(i, colorSpan, isNight),
                }}
                aria-hidden="true"
              />
            );
          }
          if (i === pipBright && pipPartial > 0.001) {
            return (
              <span
                key={i}
                className="score-pip score-pip-on score-pip-partial"
                style={{
                  background: getScorePipBackground(i, colorSpan, isNight),
                  opacity: Math.max(0.15, pipPartial),
                }}
                aria-hidden="true"
              />
            );
          }
          return <span key={i} className="score-pip score-pip-dim" aria-hidden="true" />;
        })}
      </div>
      <span className="row-score-pip-num">{formatRaceScore(displayPoints)}</span>
      {animatingDelta !== 0 && (
        <span
          className={`row-score-pip-delta${
            animatingDelta < 0 ? " row-score-pip-delta-loss" : ""
          }`}
          aria-hidden="true"
        >
          {animatingDelta > 0 ? "+" : ""}
          {formatRaceScore(animatingDelta)}
        </span>
      )}
      {statusOverlay && (
        <div className="row-scoreboard-overlay" aria-hidden="true">
          <FlatIcon id={statusOverlay.icon} className="race-emoji race-emoji-overlay" />
          <span className="row-scoreboard-overlay-label">{statusOverlay.label}</span>
        </div>
      )}
    </div>
  );
}

function LiveOddsBoard({
  state,
  liveRace,
  raceActive,
}: {
  state: GameStateResponse;
  liveRace: ReturnType<typeof useLiveRace>;
  raceActive: boolean;
}) {
  const oddsAsOf = state.gameState.last_tick_at ?? state.serverTime;
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const oddsAge = formatTickerAge(oddsAsOf, now);

  const lines = useMemo(() => {
    if (!raceActive || state.race.status !== "active") return [];

    const scores = buildLiveScoreMap(state.entries, liveRace?.entries);
    const ranks = computeLiveRanks(state.entries, scores);

    return calculateLiveOdds(
      state.race.id,
      state.race.day_number,
      state.race.percent_complete,
      state.entries,
      scores,
      ranks,
      state.ovrByPlayerId,
      state.gameState.last_tick_at ?? state.serverTime
    );
  }, [state, liveRace, raceActive]);

  if (lines.length === 0) return null;

  return (
    <div
      className="live-odds"
      aria-label={`Live betting odds, updated ${oddsAge}`}
    >
      <div className="live-odds-title">
        LIVE ODDS <span className="live-odds-asof">({oddsAge})</span>
      </div>
      <div className="live-odds-list">
        {lines.map((line) => (
          <div
            key={line.playerId}
            className={`live-odds-row${line.isFavorite ? " live-odds-row-fav" : ""}`}
          >
            <span className="live-odds-name">{formatRacerName(line.name)}</span>
            <span className="live-odds-american">{line.american}</span>
          </div>
        ))}
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
  const [nopeShakeId, setNopeShakeId] = useState<string | null>(null);
  const [encourageError, setEncourageError] = useState<string | null>(null);
  const [encouraging, setEncouraging] = useState(false);
  const [devBusy, setDevBusy] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);
  const stateRef = useRef<GameStateResponse | null>(null);

  const fetchState = useCallback(async (): Promise<GameStateResponse | null> => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load");
        return null;
      }
      setError(null);
      return data as GameStateResponse;
    } catch {
      setError("Failed to load game state");
      return null;
    }
  }, []);

  const loadState = useCallback(async () => {
    const data = await fetchState();
    if (data) setState(data);
  }, [fetchState]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const { nextUpdateMs, tickBurst } = useCronUpdate(fetchState, {
    getPrevState: () => stateRef.current,
    onApplyState: setState,
  });

  useEffect(() => {
    loadState();
  }, [loadState]);

  const handleEncourageClick = (playerId: string) => {
    if (
      canEncourageVote({
        raceActive: state?.race.status === "active",
        raceDelayed: Boolean(state?.raceDelay?.active),
        encouraging,
        supportedPlayerId: state?.encouragement.supportedPlayerId ?? null,
      })
    ) {
      handleEncourage(playerId);
      return;
    }
    vibrateNope();
    setNopeShakeId(playerId);
  };

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
        vibrateNope();
        setNopeShakeId(playerId);
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
  const raceDelayed = Boolean(state?.raceDelay?.active);
  const betweenRaces = state?.betweenRaces ?? false;
  const liveRace = useLiveRace(state, raceActive && !raceDelayed);
  const isNight = useDayNight();
  useHomeDayNightTheme(isNight);
  const raceWeather = useRaceWeather(state?.race.id, raceActive && !raceDelayed);
  const rankDeltaById = useLiveRankDelta(state, raceActive && !raceDelayed, liveRace);

  const liveScoreMap = useMemo(
    () => (state ? buildLiveScoreMap(state.entries, liveRace?.entries) : new Map()),
    [state, liveRace]
  );

  const liveRankMap = useMemo(
    () => (state ? computeLiveRanks(state.entries, liveScoreMap) : new Map()),
    [state, liveScoreMap]
  );

  const entryScorePoints =
    state?.entries.map((e) => liveScoreMap.get(e.player_id) ?? 0) ?? [];

  const leaderScorePoints = entryScorePoints.length
    ? Math.max(...entryScorePoints)
    : 1;

  const selectedEntry = selectedSlug
    ? state?.entries.find((e) => e.player.slug === selectedSlug)
    : undefined;

  const healthyEntryCount =
    state?.entries.filter((e) => !e.is_injured).length ?? 0;

  const winner = state?.entries.find((e) => {
    if (e.is_injured) return false;
    const rank = liveRankMap.get(e.player_id) ?? e.current_rank;
    return e.final_rank === 1 || rank === 1;
  });
  const raceInjured = state?.entries.filter((e) => e.is_injured) ?? [];
  const hadRaceInjuries = raceInjured.length > 0;
  const eliminated =
    !hadRaceInjuries &&
    state?.entries.find((e) => {
      if (e.is_injured || e.is_fighting) return false;
      const rank = liveRankMap.get(e.player_id) ?? e.current_rank;
      return e.final_rank === healthyEntryCount || rank === healthyEntryCount;
    });

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
    <main data-theme={isNight ? "night" : "day"}>
      {tickBurst && (
        <TickBurstOverlay
          phase={tickBurst.phase}
          headline={tickBurst.headline}
          isNight={isNight}
        />
      )}
      <div
        className={`race-update-shell${tickBurst ? " is-tick-bursting" : ""}${
          tickBurst?.phase === "explode" ? " is-tick-burst-reveal" : ""
        }`}
        aria-busy={Boolean(tickBurst)}
      >
      <div className="home-content">
      {state && (
        <ScrollingTicker
          events={state.ticker}
          serverTime={state.serverTime}
          raceNumber={state.race.race_number}
          fallback={
            state.race.status === "active"
              ? "Race in progress — awaiting first broadcast"
              : "Awaiting race updates"
          }
        />
      )}

      <div className="home-header">
        <h1 className="title">HOLES RACE</h1>
        <Link href="/stats" className="stats-nav-link">
          LEAGUE STATS ▶
        </Link>
      </div>

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
            nextUpdateMs={nextUpdateMs}
            raceDelay={state.raceDelay}
            isNight={isNight}
          />

          <p className="tap-hint">click a racer to see stats</p>

          <div className={`race-standings-wrap${raceDelayed ? " race-standings-frozen" : ""}`}>
            {raceWeather && raceActive && !raceDelayed && (
              <RaceWeatherOverlay weather={raceWeather} isNight={isNight} />
            )}
            <div className="race-standings" key={state.serverTime}>
          {[...state.entries]
            .sort((a, b) => a.lane - b.lane)
            .map((entry) => {
            const live = liveRace?.entries.get(entry.player_id);
            const rank = liveRankMap.get(entry.player_id) ?? entry.current_rank;
            const pipConfirmedScore =
              live?.confirmedScore ?? Math.round(Number(entry.race_score));
            const pipAnimatingDelta = live?.animatingDelta ?? 0;
            const isInjured = entry.is_injured;
            const isFighting = entry.is_fighting;
            const rankDelta = rankDeltaById.get(entry.player_id) ?? 0;
            const isComeback = !isInjured && !isFighting && rankDelta >= 2;
            const isLeader = !isInjured && !isFighting && rank === 1;
            const isLast =
              !isInjured && !isFighting && rank === healthyEntryCount;
            const pipOverlay = isInjured
              ? { icon: "injured" as const, label: "INJURED" }
              : isFighting
                ? { icon: "fight" as const, label: "FIGHT" }
                : undefined;
            const barMark: RaceIconId | null = isInjured
              ? null
              : isLeader
                ? "lead"
                : isLast
                  ? "last"
                  : isComeback
                    ? "comeback"
                    : null;
            const rankDeltaLabel = formatRankDelta(rankDelta);
            const isSupported = supportedId === entry.player_id;
            const canEncourage = canEncourageVote({
              raceActive,
              raceDelayed,
              encouraging,
              supportedPlayerId: supportedId,
            });

            return (
              <div key={entry.id} className={`row-line${isLeader ? " row-line-leader" : ""}`}>
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
                    <span className="row-archetype">L{entry.lane}</span>
                    <span className="row-name">{formatRacerName(entry.player.name)}</span>
                    {rankDeltaLabel && (
                      <span
                        className={`row-rank-delta${
                          rankDelta > 0 ? " row-rank-delta-up" : " row-rank-delta-down"
                        }`}
                      >
                        {rankDeltaLabel}
                      </span>
                    )}
                    {entry.player.archetype && entry.player.archetype !== "UNKNOWN" && (
                      <span className="row-archetype">{entry.player.archetype}</span>
                    )}
                  </div>
                  <div className="row-track">
                    <span
                      className="row-mark-slot"
                      title={
                        isInjured
                          ? "Injured"
                          : isFighting
                            ? "Fighting"
                            : isLeader
                              ? "Race leader"
                              : isLast
                                ? "Last place"
                                : isComeback
                                  ? `Up ${rankDelta} spots since last update`
                                  : undefined
                      }
                    >
                      {barMark ? <FlatIcon id={barMark} className="race-emoji" /> : null}
                    </span>
                    <ScorePipTrack
                      score={pipConfirmedScore}
                      animatingDelta={pipAnimatingDelta}
                      leaderScore={leaderScorePoints}
                      isLeader={isLeader}
                      isNight={isNight}
                      statusOverlay={pipOverlay}
                    />
                    {raceActive && !isInjured && !isFighting ? (
                      <button
                        type="button"
                        className={`encourage-btn${isSupported ? " supported" : ""}${
                          !canEncourage ? " encourage-btn-blocked" : ""
                        }${nopeShakeId === entry.player_id ? " encourage-btn-nope" : ""}`}
                        aria-disabled={!canEncourage}
                        aria-label={isSupported ? "Supported" : "Encourage +1"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEncourageClick(entry.player_id);
                        }}
                        onAnimationEnd={() => {
                          if (nopeShakeId === entry.player_id) setNopeShakeId(null);
                        }}
                      >
                        {isSupported ? (
                          <FlatIcon id="check" className="race-emoji race-emoji-btn" />
                        ) : (
                          "+1"
                        )}
                      </button>
                    ) : raceActive && (isFighting || isInjured) ? (
                      <span className="encourage-btn-spacer" aria-hidden="true" />
                    ) : null}
                    <span
                      className={`row-archetype row-place${
                        rank === 1
                          ? " row-place-1"
                          : rank === 2
                            ? " row-place-2"
                            : rank === 3
                              ? " row-place-3"
                              : " row-place-rest"
                      }${isFighting ? " row-place-fighting" : ""}`}
                    >
                      {ordinal(rank).toLowerCase()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
          </div>

          <div className="race-legend">
            <span className="legend-key">
              <span className="row-mark-slot" aria-hidden="true">
                <FlatIcon id="lead" className="race-emoji" />
              </span>
              LEAD
            </span>
            <span className="legend-key">
              <span className="row-mark-slot" aria-hidden="true">
                <FlatIcon id="comeback" className="race-emoji" />
              </span>
              COMEBACK
            </span>
            <span className="legend-key">
              <span className="row-mark-slot" aria-hidden="true">
                <FlatIcon id="last" className="race-emoji" />
              </span>
              LAST
            </span>
            <span className="legend-key">
              <span className="row-mark-slot" aria-hidden="true">
                <FlatIcon id="fight" className="race-emoji" />
              </span>
              FIGHT
            </span>
          </div>

          {raceActive && !raceDelayed && (
            <LiveOddsBoard state={state} liveRace={liveRace} raceActive={raceActive} />
          )}

          <div className="divider">{"────────────────────────"}</div>

          <div className="home-sections-grid">
            <div className="home-section-block">
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
            </div>

            <div className="home-section-block">
              <div className="section-label">STREAK</div>
              <StreakSection streaks={state.streaks} />
            </div>

            <div className="home-section-block">
              <div className="section-label">HOLDING</div>
              <HoldingSection players={state.holding} />
            </div>

            <div className="home-section-block">
              <div className="section-label">INJURED</div>
              <InjuredSection players={state.injured ?? []} />
            </div>
          </div>

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
      </div>
      </div>

      {state?.raceDelay?.active && <RaceDelayOverlay delay={state.raceDelay} />}

      {selectedSlug && selectedEntry && (
        <PlayerCardOverlay
          slug={selectedSlug}
          liveScore={
            liveScoreMap.get(selectedEntry.player_id) ??
            Math.round(Number(selectedEntry.race_score))
          }
          liveRank={
            liveRankMap.get(selectedEntry.player_id) ?? selectedEntry.current_rank
          }
          animatingDelta={
            liveRace?.entries.get(selectedEntry.player_id)?.animatingDelta ?? 0
          }
          leaderScore={leaderScorePoints}
          lane={selectedEntry.lane}
          isFighting={selectedEntry.is_fighting}
          isInjured={selectedEntry.is_injured}
          isLeader={
            !selectedEntry.is_injured &&
            !selectedEntry.is_fighting &&
            (liveRankMap.get(selectedEntry.player_id) ?? selectedEntry.current_rank) === 1
          }
          ovrInfo={state?.ovrByPlayerId[selectedEntry.player_id]}
          isNight={isNight}
          onClose={() => setSelectedSlug(null)}
        />
      )}
    </main>
  );
}
