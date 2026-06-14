export type RacePhase = "upcoming" | "live" | "ended";

export interface RaceClock {
  phase: RacePhase;
  percentComplete: number;
  remainingMs: number;
  startsInMs: number;
}

export function getRaceClock(
  startedAt: Date,
  endsAt: Date,
  now: Date = new Date()
): RaceClock {
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
