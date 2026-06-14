/** Progress 0–100 → score in hundredths (0–10000.00). */
export function progressToScore(progress: number): number {
  return Math.max(0, Math.min(100, progress)) * 100;
}

export function formatLiveScore(progress: number): string {
  return progressToScore(progress).toFixed(2);
}

export function formatStoredScore(score: number): string {
  return Number(score).toFixed(2);
}
