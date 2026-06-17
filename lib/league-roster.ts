import type { PlayerStatus } from "./types";

/** Statuses that belong to the current league (excludes retired legacy racers). */
export const CURRENT_LEAGUE_STATUSES: PlayerStatus[] = [
  "active",
  "holding",
  "injured",
];

export function isCurrentLeaguePlayer(status: PlayerStatus): boolean {
  return CURRENT_LEAGUE_STATUSES.includes(status);
}
