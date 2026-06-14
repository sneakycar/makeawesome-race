/** Short double-pulse — "nope" on unsupported actions. */
export function vibrateNope(): void {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    navigator.vibrate([35, 40, 35]);
  } catch {
    // iOS / restricted contexts may reject vibrate
  }
}

/** Hard triple hit when the 15m pack rips. */
export function vibrateTickBurst(): void {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    navigator.vibrate([18, 28, 42, 28, 64]);
  } catch {
    // iOS / restricted contexts may reject vibrate
  }
}

export function canEncourageVote(options: {
  raceActive: boolean;
  raceDelayed: boolean;
  encouraging: boolean;
  encouragement: {
    supportedPlayerId: string | null;
    votesRemaining: number;
    canVote: boolean;
  };
  playerId: string;
  cooldownReady: boolean;
}): boolean {
  const { encouragement } = options;
  if (!options.raceActive || options.raceDelayed || options.encouraging) return false;
  if (encouragement.votesRemaining <= 0) return false;
  if (!options.cooldownReady) return false;
  if (
    encouragement.supportedPlayerId != null &&
    encouragement.supportedPlayerId !== options.playerId
  ) {
    return false;
  }
  return true;
}

export type EncourageButtonPhase = "ready" | "cooldown" | "exhausted" | "hidden" | "blocked";

export function getEncourageButtonPhase(options: {
  raceActive: boolean;
  isInjured: boolean;
  isFighting: boolean;
  playerId: string;
  encouragement: {
    supportedPlayerId: string | null;
    votesUsed: number;
    votesMax: number;
    votesRemaining: number;
  };
  cooldownReady: boolean;
}): EncourageButtonPhase {
  if (!options.raceActive || options.isInjured || options.isFighting) return "hidden";

  const { encouragement } = options;
  const isTarget =
    encouragement.supportedPlayerId == null ||
    encouragement.supportedPlayerId === options.playerId;

  if (!isTarget) return "blocked";

  if (encouragement.votesRemaining <= 0) return "exhausted";

  if (!options.cooldownReady) return "cooldown";

  return "ready";
}
