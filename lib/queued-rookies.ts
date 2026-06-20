import type { PlayerIdentity } from "./identity";

export interface QueuedRookie {
  name: string;
  slug: string;
  /** Fixed identity; omit to roll archetype/traits/stats from seed. */
  identity?: PlayerIdentity;
}

/** One-time queue for race 4 — after that, random holding draw only. */
export const QUEUED_FOR_RACE_NUMBER = 4;

/** Manual replacement order — checked before random holding draw. */
export const QUEUED_ROOKIES: readonly QueuedRookie[] = [
  { name: "chrisman", slug: "chrisman" },
  { name: "A.K. pal", slug: "a-k-pal" },
  { name: "bhole", slug: "bhole" },
];

/** @deprecated use QUEUED_ROOKIES */
export const QUEUED_ROOKIE = QUEUED_ROOKIES[0]!;

export function peekNextQueuedRookie(existingSlugs: Set<string>): QueuedRookie | null {
  return QUEUED_ROOKIES.find((rookie) => !existingSlugs.has(rookie.slug)) ?? null;
}

export function hasPendingQueuedRookie(existingSlugs: Set<string>): boolean {
  return peekNextQueuedRookie(existingSlugs) !== null;
}

/** First queued name still in holding and not excluded from the roster. */
export function pickQueuedHoldingPlayer<T extends { id: string; slug: string }>(
  holding: T[],
  excludePlayerIds: Set<string>,
  nextRaceNumber?: number
): T | null {
  if (nextRaceNumber != null && nextRaceNumber !== QUEUED_FOR_RACE_NUMBER) {
    return null;
  }
  for (const queued of QUEUED_ROOKIES) {
    const player = holding.find((p) => p.slug === queued.slug);
    if (player && !excludePlayerIds.has(player.id)) {
      return player;
    }
  }
  return null;
}
