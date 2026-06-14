/** Progress 0–100 → score in hundredths (0–10000.00). */
export function progressToScore(progress: number): number {
  return Math.max(0, Math.min(100, progress)) * 100;
}

const scoreFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatScore(score: number): string {
  return scoreFormatter.format(Number(score));
}

export function formatLiveScore(progress: number): string {
  return formatScore(progressToScore(progress));
}

export function formatStoredScore(score: number): string {
  return formatScore(score);
}
