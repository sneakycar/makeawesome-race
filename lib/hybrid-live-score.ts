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

export interface HybridScoreState {
  /** Animated display score between segment start and confirmed total. */
  score: number;
  /** Confirmed total from the last cron tick. */
  confirmedScore: number;
  /** Signed point change on the last cron tick. */
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
  const confirmedScore = clampRaceScore(Number(raceScore));
  const tickDelta = Number(lastDelta);
  const baseScore = clampRaceScore(confirmedScore - tickDelta);

  if (tickDelta === 0 || segmentProgress >= 1) {
    return {
      score: confirmedScore,
      confirmedScore,
      tickDelta,
      baseScore,
      segmentProgress: 1,
    };
  }

  return {
    score: clampRaceScore(baseScore + tickDelta * segmentProgress),
    confirmedScore,
    tickDelta,
    baseScore,
    segmentProgress,
  };
}

export interface PipFillState {
  /** Fully lit pip count. */
  bright: number;
  /** Index of the pip currently filling or draining (if any). */
  partialIndex: number;
  /** 0–1 fill amount for partialIndex. */
  partial: number;
}

/** Lit pips for animated score, with trailing pip easing over the segment. */
export function getPipFillState(
  confirmedScore: number,
  lastDelta: number,
  segmentProgress: number
): PipFillState {
  const hybrid = getHybridScoreState(confirmedScore, lastDelta, segmentProgress);
  const animatedTotal = hybrid.score;

  if (hybrid.tickDelta === 0 || hybrid.segmentProgress >= 1) {
    return {
      bright: Math.round(hybrid.confirmedScore),
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
