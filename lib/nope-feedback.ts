/** Short double-pulse — "nope" on unsupported actions. */
export function vibrateNope(): void {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    navigator.vibrate([35, 40, 35]);
  } catch {
    // iOS / restricted contexts may reject vibrate
  }
}

export function canEncourageVote(options: {
  raceActive: boolean;
  raceDelayed: boolean;
  encouraging: boolean;
  supportedPlayerId: string | null;
}): boolean {
  return (
    options.raceActive &&
    !options.raceDelayed &&
    !options.encouraging &&
    options.supportedPlayerId == null
  );
}
