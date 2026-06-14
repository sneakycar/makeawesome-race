import { CRON_SEGMENT_MS, getMsUntilNextUpdate } from "./race-clock";

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

export interface HybridScoreState {
  /** Animated display score between segment start and confirmed total. */
  score: number;
  /** Confirmed total from the last cron tick. */
  confirmedScore: number;
  /** Points gained on the last cron tick (>= 0 for animation). */
  tickDelta: number;
  /** Score at the start of this 15m segment. */
  baseScore: number;
  segmentProgress: number;
}

export function getHybridScoreState(
  raceScore: number,
  lastDelta: number,
  segmentProgress: number
): HybridScoreState {
  const confirmedScore = Math.max(0, Number(raceScore));
  const rawDelta = Number(lastDelta);
  const tickDelta = rawDelta > 0 ? rawDelta : 0;
  const baseScore = Math.max(0, confirmedScore - tickDelta);

  if (tickDelta <= 0 || segmentProgress >= 1) {
    return {
      score: confirmedScore,
      confirmedScore,
      tickDelta,
      baseScore,
      segmentProgress: 1,
    };
  }

  return {
    score: baseScore + tickDelta * segmentProgress,
    confirmedScore,
    tickDelta,
    baseScore,
    segmentProgress,
  };
}

export interface PipFillState {
  /** Fully lit pip count. */
  bright: number;
  /** Index of the pip currently filling (if any). */
  partialIndex: number;
  /** 0–1 fill amount for partialIndex. */
  partial: number;
}

/** How many pips are lit, with the trailing pip easing in over the segment. */
export function getPipFillState(
  confirmedScore: number,
  lastDelta: number,
  segmentProgress: number
): PipFillState {
  const hybrid = getHybridScoreState(confirmedScore, lastDelta, segmentProgress);
  const target = hybrid.baseScore + hybrid.tickDelta;

  if (hybrid.tickDelta <= 0 || hybrid.segmentProgress >= 1) {
    return {
      bright: Math.round(hybrid.confirmedScore),
      partialIndex: -1,
      partial: 0,
    };
  }

  const animatedTotal = hybrid.baseScore + hybrid.tickDelta * hybrid.segmentProgress;
  const bright = Math.floor(animatedTotal);
  const partial = animatedTotal - bright;
  const maxBright = Math.ceil(target);

  if (partial > 0.001 && bright < maxBright) {
    return { bright, partialIndex: bright, partial: Math.min(1, partial) };
  }

  return { bright, partialIndex: -1, partial: 0 };
}
