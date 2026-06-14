export type RacePhase = "upcoming" | "live" | "ended" | "delayed";

export interface RaceClock {
  phase: RacePhase;
  percentComplete: number;
  remainingMs: number;
  startsInMs: number;
}

export interface RaceClockDelayOptions {
  delayUntil: string;
  frozenPercent: number;
}

export function getRaceClock(
  startedAt: Date,
  endsAt: Date,
  now: Date = new Date(),
  delay?: RaceClockDelayOptions | null
): RaceClock {
  if (delay) {
    const untilMs = new Date(delay.delayUntil).getTime();
    if (now.getTime() < untilMs) {
      return {
        phase: "delayed",
        percentComplete: delay.frozenPercent,
        remainingMs: Math.max(0, untilMs - now.getTime()),
        startsInMs: 0,
      };
    }
  }

  const startMs = startedAt.getTime();
  const endMs = endsAt.getTime();
  const nowMs = now.getTime();
  const durationMs = Math.max(0, endMs - startMs);

  if (nowMs < startMs) {
    return {
      phase: "upcoming",
      percentComplete: 0,
      remainingMs: durationMs,
      startsInMs: startMs - nowMs,
    };
  }

  if (nowMs >= endMs) {
    return {
      phase: "ended",
      percentComplete: 100,
      remainingMs: 0,
      startsInMs: 0,
    };
  }

  const elapsed = nowMs - startMs;
  const percentComplete =
    durationMs <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((elapsed / durationMs) * 100)));

  return {
    phase: "live",
    percentComplete,
    remainingMs: endMs - nowMs,
    startsInMs: 0,
  };
}

const TICK_INTERVAL_MS = 15 * 60 * 1000;

/** Ms until the next :00/:15/:30/:45 UTC cron tick. */
export function getMsUntilNextUpdate(now: Date = new Date()): number {
  const min = now.getUTCMinutes();
  const sec = now.getUTCSeconds();
  const ms = now.getUTCMilliseconds();
  const msPastQuarter = ((min % 15) * 60 + sec) * 1000 + ms;
  return TICK_INTERVAL_MS - msPastQuarter;
}
