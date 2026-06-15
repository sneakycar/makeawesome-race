"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRaceClock, type RaceClock } from "@/lib/race-clock";
import { useCronUpdate } from "@/lib/use-cron-update";
import { TickBurstOverlay } from "@/app/components/tick-burst-overlay";
import type { GameStateResponse, LastRaceRecap, RaceTickLogEntry, Player, TickerEvent } from "@/lib/types";
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
  formatTickAge,
  ordinal,
} from "@/lib/format";
import { formatRaceScore, getScorePipBackground, roundRaceScore, SCORE_PIP_SLOTS } from "@/lib/score";
import { getRaceProgressPipSurfaceStyle } from "@/lib/race-progress-art";
import { useLiveRace } from "@/lib/use-live-race";
import { useDayNight, useHomeDayNightTheme } from "@/lib/use-day-night";
import { useRaceWeather } from "@/lib/use-race-weather";
import { formatRankDelta, useLiveRankDelta } from "@/lib/use-live-rank-delta";
import {
  RaceWeatherBadge,
  RaceWeatherOverlay,
} from "@/app/components/race-weather-overlay";
import { canEncourageVote, getEncourageButtonPhase, vibrateNope } from "@/lib/nope-feedback";
import { getOrCreateDeviceId } from "@/lib/client-device-id";
import { useEncourageCooldown } from "@/lib/use-encourage-cooldown";
import { calculateLiveOdds } from "@/lib/live-odds";
import { buildOvrRankings, ovrRankingsToRecord } from "@/lib/ovr";
import { buildLiveScoreMap, computeLiveRanks } from "@/lib/live-standings";
import { computeRaceBarMarks, isEarlyRaceWindow } from "@/lib/race-bar-marks";
import { PlayerCardOverlay } from "@/app/components/player-card-overlay";
import { BadMoneyModal } from "@/app/components/bad-money-modal";
import { RacerFactReveal } from "@/app/components/racer-fact-reveal";
import { ScorePipTrack } from "@/app/components/score-pip-track";
import { FlatIcon, type RaceIconId } from "@/app/components/flat-icons";
import { fetchWithRetry } from "@/lib/server-resilience";

function useRelativeAgeNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

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
  weatherBadge,
}: {
  state: GameStateResponse;
  betweenRaces: boolean;
  raceActive: boolean;
  liveRaceProgress: number | null;
  nextUpdateMs: number;
  raceDelay: GameStateResponse["raceDelay"];
  isNight: boolean;
  weatherBadge?: React.ReactNode;
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
          <div className="race-meta-progress-section">
            <RaceProgressPipBar percent={progressBarWidth} isNight={isNight} />
            {weatherBadge}
          </div>
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
  raceStartedAt,
  raceNumber,
  fallback,
  now,
}: {
  events: TickerEvent[];
  raceStartedAt: string;
  raceNumber: number;
  fallback: string;
  now: Date;
}) {
  const line = events.length
    ? events
        .map(
          (e) =>
            `${formatTickerForDisplay(e.message)} (${formatTickAge(raceStartedAt, e.tick_number, now)})`
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

function LiveOddsBoard({
  lines,
  oddsAge,
}: {
  lines: ReturnType<typeof calculateLiveOdds>;
  oddsAge: string;
}) {
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

  const sorted = [...streaks].sort((a, b) => {
    if (a.current_streak_type !== b.current_streak_type) {
      return a.current_streak_type === "win" ? -1 : 1;
    }
    return b.current_streak_count - a.current_streak_count;
  });

  return (
    <div className="streak-list">
      {sorted.map((entry) => {
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

function InjuredSection({
  players,
}: {
  players: Array<
    Pick<Player, "name" | "current_injury_name" | "injury_races_remaining">
  >;
}) {
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

function HoldingSection({
  players,
}: {
  players: Array<Pick<Player, "name" | "age_days">>;
}) {
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
          Up to six times per race, you can tap +1 for one racer. Each tap adds a
          tiny bump to today&apos;s score (capped so fans can never buy the race)
          and rolls for permanent growth after the finish. Strong racers grow
          slowly; struggling racers get better odds. Age, decay, holding, and
          injuries still pull everyone back — there is no finish line.
          {"\n\n"}
          After each tap the button shows a check until the cooldown clears, then
          +1 lights up again.
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
        <p>
          BAD MONEY
          {"\n\n"}
          Once per race, a visitor may place bad money on one racer. Bad money is not
          real currency and has no payout. It is a superstition. It may slightly
          disturb a racer&apos;s current race and can rarely affect long-term growth or
          regression. The effect is tiny, capped, and unreliable. The machine remains
          in charge.
        </p>
        <p>
          RACER FACTS
          {"\n\n"}
          Sometimes the machine reveals small facts about racers while you watch. These
          facts do not require action. They are just observations.
        </p>
      </div>
    </details>
  );
}

function RaceTickLogRow({
  entry,
  raceStartedAt,
  now,
}: {
  entry: RaceTickLogEntry;
  raceStartedAt: string;
  now: Date;
}) {
  return (
    <div className="race-log-row">
      <span className="race-log-tag">
        [tick {entry.tickNumber + 1}] ({formatTickAge(raceStartedAt, entry.tickNumber, now)})
      </span>
      <span className="race-log-msg">{formatTickerForDisplay(entry.message)}</span>
    </div>
  );
}

function RaceTickLogPanel({
  entries,
  raceStartedAt,
  now,
}: {
  entries: RaceTickLogEntry[];
  raceStartedAt: string;
  now: Date;
}) {
  const latest = entries.at(-1) ?? null;
  const older = entries.length > 1 ? entries.slice(0, -1) : [];

  if (!latest) {
    return <p className="race-log-empty">no ticks yet</p>;
  }

  return (
    <div className="race-log-panel">
      <RaceTickLogRow entry={latest} raceStartedAt={raceStartedAt} now={now} />
      {older.length > 0 && (
        <details className="race-log-details">
          <summary className="race-log-summary">&gt;SHOW ALL</summary>
          <ul className="race-log-list">
            {older.map((entry) => (
              <li key={entry.tickNumber}>
                <RaceTickLogRow entry={entry} raceStartedAt={raceStartedAt} now={now} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default function HomePage() {
  const [state, setState] = useState<GameStateResponse | null>(null);
  const [lastRaceRecap, setLastRaceRecap] = useState<LastRaceRecap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [nopeShakeId, setNopeShakeId] = useState<string | null>(null);
  const [encourageError, setEncourageError] = useState<string | null>(null);
  const [encouraging, setEncouraging] = useState(false);
  const [encouragingPlayerId, setEncouragingPlayerId] = useState<string | null>(null);
  const [badMoneyModal, setBadMoneyModal] = useState<{
    playerId: string;
    name: string;
  } | null>(null);
  const [badMoneySuccess, setBadMoneySuccess] = useState(false);
  const [betting, setBetting] = useState(false);
  const [betError, setBetError] = useState<string | null>(null);
  const [devBusy, setDevBusy] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);
  const stateRef = useRef<GameStateResponse | null>(null);

  const fetchState = useCallback(async (): Promise<GameStateResponse | null> => {
    try {
      const deviceId = getOrCreateDeviceId();
      const qs = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
      const res = await fetchWithRetry(`/api/state${qs}`, { cache: "no-store" });
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
    if (data) {
      setState(data);
      fetch("/api/recap")
        .then((res) => res.json())
        .then((recapData) => {
          if (recapData.lastRaceRecap) {
            setLastRaceRecap(recapData.lastRaceRecap as LastRaceRecap);
          }
        })
        .catch(() => {});
    }
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

  useEffect(() => {
    if (!error) return;
    const id = setInterval(() => {
      loadState();
    }, 5000);
    return () => clearInterval(id);
  }, [error, loadState]);

  const ovrByPlayerId = useMemo(() => {
    if (!state?.entries.length) return {};
    const players = state.entries
      .map((entry) => entry.player)
      .filter((player): player is Player => Boolean(player));
    return ovrRankingsToRecord(buildOvrRankings(players));
  }, [state?.entries]);

  const encouragement = state?.encouragement;
  const cooldownReady = useEncourageCooldown(encouragement);

  const handleEncourageClick = (playerId: string) => {
    const encouragement = state?.encouragement;
    if (!encouragement) return;

    if (
      canEncourageVote({
        raceActive: state?.race.status === "active",
        raceDelayed: Boolean(state?.raceDelay?.active),
        encouraging,
        encouragement,
        playerId,
        cooldownReady,
      })
    ) {
      handleEncourage(playerId);
      return;
    }
    vibrateNope();
    setNopeShakeId(playerId);
  };

  const handleEncourage = async (playerId: string) => {
    const encouragement = state?.encouragement;
    if (
      encouraging ||
      !encouragement ||
      !canEncourageVote({
        raceActive: state?.race.status === "active",
        raceDelayed: Boolean(state?.raceDelay?.active),
        encouraging,
        encouragement,
        playerId,
        cooldownReady,
      })
    ) {
      return;
    }

    setEncouraging(true);
    setEncouragingPlayerId(playerId);
    setEncourageError(null);
    try {
      const deviceId = getOrCreateDeviceId();
      const res = await fetch("/api/encourage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, deviceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEncourageError(data.error || "Could not encourage");
        vibrateNope();
        setNopeShakeId(playerId);
        return;
      }
      setState((prev) => {
        if (!prev) return prev;
        const granted = Number(data.liveScoreGranted ?? 0);
        return {
          ...prev,
          encouragement: data.encouragement ?? prev.encouragement,
          entries:
            granted > 0
              ? prev.entries.map((e) => {
                  if (e.player_id !== playerId) return e;
                  const nextScore = roundRaceScore(Number(e.race_score) + granted);
                  const recentDeltas = [
                    ...(e.recent_deltas ?? []),
                    granted,
                  ].slice(-3);
                  return {
                    ...e,
                    race_score: nextScore,
                    progress: nextScore,
                    displayed_progress: Math.round(nextScore),
                    fan_live_bonus: Number(e.fan_live_bonus ?? 0) + granted,
                    recent_deltas: recentDeltas,
                    last_delta: granted,
                  };
                })
              : prev.entries,
        };
      });
    } catch {
      setEncourageError("Could not encourage");
    } finally {
      setEncouraging(false);
      setEncouragingPlayerId(null);
    }
  };

  const handleBadMoneyOpen = (playerId: string, name: string) => {
    const badMoney = state?.badMoney;
    if (
      betting ||
      !badMoney?.canBet ||
      badMoney.hasBet ||
      state?.race.status !== "active" ||
      state?.raceDelay?.active
    ) {
      return;
    }
    setBetError(null);
    setBadMoneySuccess(false);
    setBadMoneyModal({ playerId, name });
  };

  const handleBadMoneyConfirm = async () => {
    if (!badMoneyModal || !state || betting) return;
    setBetting(true);
    setBetError(null);
    try {
      const res = await fetch("/api/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raceId: state.race.id,
          playerId: badMoneyModal.playerId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBetError(data.error || "Could not place bad money");
        if (res.status === 409) {
          setState((prev) =>
            prev
              ? {
                  ...prev,
                  badMoney: {
                    betPlayerId: prev.badMoney.betPlayerId,
                    hasBet: true,
                    canBet: false,
                  },
                }
              : prev
          );
        }
        return;
      }
      setBadMoneySuccess(true);
      setState((prev) =>
        prev
          ? {
              ...prev,
              badMoney: {
                betPlayerId: badMoneyModal.playerId,
                hasBet: true,
                canBet: false,
              },
            }
          : prev
      );
      window.setTimeout(() => {
        setBadMoneyModal(null);
        setBadMoneySuccess(false);
      }, 1400);
    } catch {
      setBetError("Could not place bad money");
    } finally {
      setBetting(false);
    }
  };

  const raceActive =
    state?.race.status === "active" &&
    (state.racePhase === "live" || state.racePhase === "delayed");
  const raceDelayed = Boolean(state?.raceDelay?.active);
  const betweenRaces = state?.betweenRaces ?? false;
  const liveRace = useLiveRace(state, raceActive && !raceDelayed);
  const isNight = useDayNight();
  useHomeDayNightTheme(isNight);
  const raceWeather = useRaceWeather(
    state?.race.id,
    state?.race.started_at,
    state?.race.ends_at,
    raceActive && !raceDelayed
  );
  const rankDeltaById = useLiveRankDelta(state, raceActive && !raceDelayed, liveRace);

  const [barMarkNow, setBarMarkNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setBarMarkNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const liveScoreMap = useMemo(
    () => (state ? buildLiveScoreMap(state.entries, liveRace?.entries) : new Map()),
    [state, liveRace]
  );

  const liveRankMap = useMemo(
    () => (state ? computeLiveRanks(state.entries, liveScoreMap) : new Map()),
    [state, liveScoreMap]
  );

  const barMarksById = useMemo(() => {
    if (!state || !raceActive) return new Map<string, RaceIconId>();

    const startedAt = new Date(state.race.started_at);
    const earlyRace =
      state.racePhase === "live" && isEarlyRaceWindow(startedAt, barMarkNow);

    const inputs = state.entries.map((entry) => ({
      playerId: entry.player_id,
      rank: liveRankMap.get(entry.player_id) ?? entry.current_rank,
      rankDelta: rankDeltaById.get(entry.player_id) ?? 0,
      isInjured: entry.is_injured,
      isFighting: entry.is_fighting,
    }));

    return computeRaceBarMarks(inputs, { earlyRace });
  }, [state, raceActive, liveRankMap, rankDeltaById, barMarkNow]);

  const ageNow = useRelativeAgeNow();
  const oddsAsOf = state?.gameState.last_tick_at ?? state?.serverTime;
  const oddsAge = oddsAsOf ? formatTickerAge(oddsAsOf, ageNow) : "";

  const liveOddsLines = useMemo(() => {
    if (
      !state ||
      !raceActive ||
      raceDelayed ||
      state.race.status !== "active" ||
      state.racePhase !== "live" ||
      !liveRace
    ) {
      return [];
    }

    return calculateLiveOdds(
      state.race.id,
      state.race.day_number,
      liveRace.raceProgress,
      state.entries,
      liveScoreMap,
      liveRankMap,
      ovrByPlayerId
    );
  }, [state, raceActive, raceDelayed, liveRace, liveScoreMap, liveRankMap, ovrByPlayerId]);

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
      {raceWeather && raceActive && !raceDelayed && (
        <div className="race-weather-fullscreen" aria-hidden="true">
          <RaceWeatherOverlay weather={raceWeather} isNight={isNight} />
        </div>
      )}
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
          raceStartedAt={state.race.started_at}
          raceNumber={state.race.race_number}
          now={ageNow}
          fallback={
            state.racePhase === "live" || state.racePhase === "delayed"
              ? "Race in progress — awaiting first broadcast"
              : state.racePhase === "upcoming"
                ? "Race scheduled — awaiting start"
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
          <div className="race-meta-weather-zone">
            <div className="race-meta-shell">
              <RaceMetaPanel
                state={state}
                betweenRaces={betweenRaces}
                raceActive={raceActive}
                liveRaceProgress={liveRace?.raceProgress ?? null}
                nextUpdateMs={nextUpdateMs}
                raceDelay={state.raceDelay}
                isNight={isNight}
                weatherBadge={
                  raceWeather && raceActive && !raceDelayed ? (
                    <RaceWeatherBadge weather={raceWeather} />
                  ) : undefined
                }
              />
            </div>

            <p className="tap-hint">click a racer to see stats</p>
          </div>

          <div className={`race-standings-wrap${raceDelayed ? " race-standings-frozen" : ""}`}>
            <div className="race-standings" key={state.serverTime}>
          {[...state.entries]
            .sort((a, b) => a.lane - b.lane)
            .map((entry) => {
            const live = liveRace?.entries.get(entry.player_id);
            const rank = liveRankMap.get(entry.player_id) ?? entry.current_rank;
            const pipConfirmedScore = roundRaceScore(Number(entry.race_score));
            const pipLastDelta = Number(entry.last_delta ?? 0);
            const pipSegmentProgress = live?.segmentProgress ?? 1;
            const isInjured = entry.is_injured;
            const isFighting = entry.is_fighting;
            const rankDelta = rankDeltaById.get(entry.player_id) ?? 0;
            const pipOverlay = isInjured
              ? { icon: "injured" as const, label: "INJURED" }
              : isFighting
                ? { icon: "fight" as const, label: "FIGHT" }
                : undefined;
            const barMark = isInjured || isFighting
              ? null
              : barMarksById.get(entry.player_id) ?? null;
            const isLeader = barMark === "lead";
            const rankDeltaLabel = formatRankDelta(rankDelta);
            const isEncouragingThis = encouragingPlayerId === entry.player_id;
            const encouragePhase =
              encouragement &&
              getEncourageButtonPhase({
                raceActive,
                isInjured,
                isFighting,
                encouragement,
                cooldownReady,
              });
            const canEncourage =
              encouragement &&
              canEncourageVote({
                raceActive,
                raceDelayed,
                encouraging,
                encouragement,
                playerId: entry.player_id,
                cooldownReady,
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
                    <span className="row-mark-slot" aria-hidden={!barMark}>
                      {barMark ? (
                        <FlatIcon id={barMark} className="race-emoji" />
                      ) : null}
                    </span>
                    <ScorePipTrack
                      confirmedScore={pipConfirmedScore}
                      lastDelta={pipLastDelta}
                      segmentProgress={pipSegmentProgress}
                      leaderScore={leaderScorePoints}
                      isLeader={isLeader}
                      isNight={isNight}
                      statusOverlay={pipOverlay}
                    />
                    {raceActive && !isInjured && !isFighting && encouragePhase !== "hidden" ? (
                      <button
                        type="button"
                        className={`encourage-btn${
                          encouragePhase === "ready" ? " encourage-btn-ready" : ""
                        }${encouragePhase === "cooldown" ? " encourage-btn-cooldown" : ""}${
                          encouragePhase === "exhausted" ? " encourage-btn-exhausted" : ""
                        }${!canEncourage ? " encourage-btn-blocked" : ""}${
                          isEncouragingThis ? " encourage-btn-loading" : ""
                        }${nopeShakeId === entry.player_id ? " encourage-btn-nope" : ""}`}
                        aria-disabled={!canEncourage}
                        aria-busy={isEncouragingThis}
                        aria-label={
                          isEncouragingThis
                            ? "Sending encourage vote"
                            : encouragePhase === "ready"
                              ? `Encourage +1 (${encouragement?.votesUsed ?? 0}/${encouragement?.votesMax ?? 6})`
                              : encouragePhase === "cooldown"
                                ? "Encourage cooldown — check back soon"
                                : "All encourages used this race"
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEncourageClick(entry.player_id);
                        }}
                        onAnimationEnd={() => {
                          if (nopeShakeId === entry.player_id) setNopeShakeId(null);
                        }}
                      >
                        {isEncouragingThis ? (
                          <span className="encourage-btn-loading-dots" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </span>
                        ) : encouragePhase === "ready" ? (
                          "+1"
                        ) : (
                          <FlatIcon id="check" className="race-emoji race-emoji-btn" />
                        )}
                      </button>
                    ) : raceActive && (isFighting || isInjured) ? (
                      <span className="encourage-btn-spacer" aria-hidden="true" />
                    ) : null}
                    {raceActive &&
                    !raceDelayed &&
                    !isInjured &&
                    !isFighting &&
                    state.badMoney ? (
                      state.badMoney.hasBet &&
                      state.badMoney.betPlayerId === entry.player_id ? (
                        <button
                          type="button"
                          className="bad-money-btn bad-money-btn-placed"
                          disabled
                          aria-label="Bad money placed on this racer"
                        >
                          BET
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`bad-money-btn${
                            !state.badMoney.canBet || state.badMoney.hasBet
                              ? " bad-money-btn-blocked"
                              : ""
                          }`}
                          disabled={
                            betting ||
                            !state.badMoney.canBet ||
                            state.badMoney.hasBet
                          }
                          aria-label={
                            state.badMoney.hasBet
                              ? "Bad money already placed this race"
                              : `Place bad money on ${formatRacerName(entry.player.name)}`
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBadMoneyOpen(entry.player_id, entry.player.name);
                          }}
                        >
                          $
                        </button>
                      )
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

          {liveOddsLines.length > 0 && (
            <LiveOddsBoard lines={liveOddsLines} oddsAge={oddsAge} />
          )}

          <div className="divider">{"────────────────────────"}</div>

          <div className="home-section-block home-section-block-full home-log-section">
            <div className="section-label">&gt; LOG</div>
            <RaceTickLogPanel
              entries={state.raceLog ?? []}
              raceStartedAt={state.race.started_at}
              now={ageNow}
            />
          </div>

          <div className="home-sections-grid">
            {lastRaceRecap && (
              <div className="home-section-block home-section-block-full">
                <div className="section-label">LAST RACE RECAP</div>
                <p className="last-race-recap">
                  {lastRaceRecap.segments.map((segment, i) =>
                    segment.kind === "name" ? (
                      <strong key={i} className="last-race-recap-name">
                        {segment.value}
                      </strong>
                    ) : (
                      <span key={i}>{segment.value}</span>
                    )
                  )}
                </p>
                {lastRaceRecap.abilityGainsSegments && (
                  <p className="last-race-recap last-race-recap-abilities">
                    {lastRaceRecap.abilityGainsSegments.map((segment, i) =>
                      segment.kind === "name" ? (
                        <strong key={i} className="last-race-recap-name">
                          {segment.value}
                        </strong>
                      ) : (
                        <span key={i}>{segment.value}</span>
                      )
                    )}
                  </p>
                )}
              </div>
            )}

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

      {state && raceActive && !betweenRaces && !raceDelayed && (
        <RacerFactReveal
          activeEntries={state.entries}
          raceId={state.race.id}
          dayNumber={state.gameState.current_day}
          raceActive={raceActive}
          blocked={Boolean(selectedSlug || badMoneyModal || tickBurst)}
        />
      )}

      {badMoneyModal && (
        <BadMoneyModal
          racerName={badMoneyModal.name}
          placing={badMoneySuccess}
          busy={betting}
          onConfirm={handleBadMoneyConfirm}
          onCancel={() => {
            if (!betting) setBadMoneyModal(null);
          }}
        />
      )}
      {betError && (
        <p className="error" style={{ textAlign: "center", marginTop: 8 }}>
          {betError}
        </p>
      )}

      {selectedSlug && selectedEntry && (
        <PlayerCardOverlay
          slug={selectedSlug}
          liveScore={
            liveScoreMap.get(selectedEntry.player_id) ??
            roundRaceScore(Number(selectedEntry.race_score))
          }
          liveRank={
            liveRankMap.get(selectedEntry.player_id) ?? selectedEntry.current_rank
          }
          animatingDelta={
            liveRace?.entries.get(selectedEntry.player_id)?.animatingDelta ?? 0
          }
          leaderScore={leaderScorePoints}
          lastDelta={Number(selectedEntry.last_delta ?? 0)}
          rankDelta={rankDeltaById.get(selectedEntry.player_id) ?? 0}
          healthyEntryCount={healthyEntryCount}
          lane={selectedEntry.lane}
          isFighting={selectedEntry.is_fighting}
          isInjured={selectedEntry.is_injured}
          barMark={
            selectedEntry.is_injured || selectedEntry.is_fighting
              ? null
              : barMarksById.get(selectedEntry.player_id) ?? null
          }
          ovrInfo={ovrByPlayerId[selectedEntry.player_id]}
          isNight={isNight}
          onClose={() => setSelectedSlug(null)}
          playerId={selectedEntry.player_id}
          raceId={state!.race.id}
          recentDeltas={
            selectedEntry.recent_deltas ??
            (selectedEntry.last_delta ? [Number(selectedEntry.last_delta)] : [])
          }
          confirmedScore={roundRaceScore(Number(selectedEntry.race_score))}
          segmentProgress={
            liveRace?.entries.get(selectedEntry.player_id)?.segmentProgress ?? 1
          }
        />
      )}
    </main>
  );
}
