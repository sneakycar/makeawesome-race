import type { PlayerStatus } from "./types";

/** Statuses that belong to the current league (excludes retired legacy racers). */
export const CURRENT_LEAGUE_STATUSES: PlayerStatus[] = [
  "active",
  "holding",
  "injured",
];

/** Seeds allowed for B3S racers — never procedural `player-*` names. */
export const APPROVED_PLAYER_SEED_PREFIXES = [
  "seed-active-",
  "b3s-seed-",
  "holding-reserve-",
] as const;

export function isCurrentLeaguePlayer(status: PlayerStatus): boolean {
  return CURRENT_LEAGUE_STATUSES.includes(status);
}

export function isApprovedLeaguePlayerSeed(seed: string | null | undefined): boolean {
  const value = String(seed ?? "");
  return APPROVED_PLAYER_SEED_PREFIXES.some((prefix) => value.startsWith(prefix));
}
