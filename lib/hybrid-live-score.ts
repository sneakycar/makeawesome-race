import { CRON_SEGMENT_MS, getMsUntilNextUpdate } from "./race-clock";
import { clampRaceScore } from "./score";

/** 0 at last cron tick, 1 just before the next. */
export function getCronSegmentProgress(
  lastTickAt: string | null,
  now: Date = new Date()
): number {
  const elapsed = lastTickAt
    ? now.getTime() - new Date(lastTickAt).getTime()
    : CRON_SEGMENT_MS - getMsUntilNextUpdate(now);
  return Math.max(0, Math.min(1, elapsed / CRON_SEGMENT_MS));
}

export const ROLLING_TICK_WINDOW = 3;

export interface RollingTickAnimationState {
  /** Animated display score between cron ticks. */
  score: number;
  /** Confirmed total from the last cron tick. */
  confirmedScore: number;
  /** Score before the rolling window of recent deltas. */
  hardenedScore: number;
  /** Last N tick deltas (oldest first), max 3. */
  recentDeltas: number[];
  segmentProgress: number;
  /** Signed delta currently animating (for +N badge). */
  animatingDelta: number;
}

export function normalizeRecentDeltas(
  recentDeltas: number[] | null | undefined,
  lastDelta?: number
): number[] {
  if (recentDeltas?.length) {
    return recentDeltas.map(Number).slice(-ROLLING_TICK_WINDOW);
  }
  const d = Number(lastDelta ?? 0);
  return d !== 0 ? [d] : [];
}

/** Append a tick delta and keep the last 3. */
export function appendRecentDelta(
  prev: number[] | null | undefined,
  delta: number
): number[] {
  return [...(prev ?? []), Number(delta)].slice(-ROLLING_TICK_WINDOW);
}

/**
 * Between cron ticks: hardened base + each of the last 3 tick gains animates
 * in sequence over the 15m segment. At segment end, display = confirmed score.
 */
export function getRollingTickAnimationState(
  confirmedScore: number,
  recentDeltas: number[],
  segmentProgress: number
): RollingTickAnimationState {
  const confirmed = clampRaceScore(Number(confirmedScore));
  const deltas = recentDeltas.map(Number).slice(-ROLLING_TICK_WINDOW);
  const deltaSum = deltas.reduce((a, b) => a + b, 0);
  const hardened = clampRaceScore(confirmed - deltaSum);

  if (deltas.length === 0 || segmentProgress >= 1) {
    return {
      score: confirmed,
      confirmedScore: confirmed,
      hardenedScore: hardened,
      recentDeltas: deltas,
      segmentProgress: deltas.length === 0 ? 1 : segmentProgress,
      animatingDelta: 0,
    };
  }

  const n = deltas.length;
  const partSize = 1 / n;
  let score = hardened;
  let animatingDelta = 0;

  for (let i = 0; i < n; i++) {
    const slotStart = i * partSize;
    const slotEnd = (i + 1) * partSize;
    if (segmentProgress >= slotEnd) {
      score += deltas[i];
    } else if (segmentProgress > slotStart) {
      const t = (segmentProgress - slotStart) / partSize;
      score += deltas[i] * t;
      animatingDelta = Math.round(deltas[i] * t);
      break;
    }
  }

  return {
    score: clampRaceScore(score),
    confirmedScore: confirmed,
    hardenedScore: hardened,
    recentDeltas: deltas,
    segmentProgress,
    animatingDelta,
  };
}

export interface PipFillState {
  bright: number;
  partialIndex: number;
  partial: number;
}

/** Lit pips for rolling tick animation score. */
export function getPipFillState(
  confirmedScore: number,
  recentDeltas: number[],
  segmentProgress: number
): PipFillState {
  const rolling = getRollingTickAnimationState(
    confirmedScore,
    recentDeltas,
    segmentProgress
  );
  const animatedTotal = rolling.score;

  if (rolling.recentDeltas.length === 0 || rolling.segmentProgress >= 1) {
    return {
      bright: Math.round(rolling.confirmedScore),
      partialIndex: -1,
      partial: 0,
    };
  }

  const bright = Math.floor(animatedTotal);
  const partial = animatedTotal - bright;

  if (partial > 0.001) {
    return { bright, partialIndex: bright, partial: Math.min(1, partial) };
  }
  if (partial < -0.001 && bright >= 0) {
    return { bright: bright + 1, partialIndex: bright, partial: 1 + partial };
  }

  return { bright, partialIndex: -1, partial: 0 };
}

/** @deprecated use getRollingTickAnimationState */
export function getHybridScoreState(
  raceScore: number,
  lastDelta: number,
  segmentProgress: number
) {
  const rolling = getRollingTickAnimationState(
    raceScore,
    normalizeRecentDeltas(null, lastDelta),
    segmentProgress
  );
  return {
    score: rolling.score,
    confirmedScore: rolling.confirmedScore,
    tickDelta: lastDelta,
    baseScore: rolling.hardenedScore,
    segmentProgress: rolling.segmentProgress,
  };
}
