/** Typical winning total — used for soft pacing caps, not a fixed final score. */
export const TARGET_WINNER_SCORE = 140;

const scoreFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/** Format a race point total for display (e.g. 135, 1,024). */
export function formatRaceScore(score: number): string {
  return scoreFormatter.format(Math.round(Math.max(0, score)));
}

/** @deprecated use formatRaceScore */
export function formatLiveScore(score: number): string {
  return formatRaceScore(score);
}

/** @deprecated use formatRaceScore */
export function formatStoredScore(score: number): string {
  return formatRaceScore(score);
}

/** @deprecated scores are stored as points, not derived from progress */
export function progressToScore(_progress: number): number {
  return 0;
}
