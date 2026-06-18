import type { PlayerIdentity } from "./identity";

export interface QueuedRookie {
  name: string;
  slug: string;
  /** Fixed identity; omit to roll archetype/traits/stats from seed. */
  identity?: PlayerIdentity;
}

/** Approved rookies only — add names here before they can enter the league. No procedural generation. */
export const QUEUED_ROOKIES: readonly QueuedRookie[] = [];

/** @deprecated use QUEUED_ROOKIES */
export const QUEUED_ROOKIE = QUEUED_ROOKIES[0]!;

export function peekNextQueuedRookie(existingSlugs: Set<string>): QueuedRookie | null {
  return QUEUED_ROOKIES.find((rookie) => !existingSlugs.has(rookie.slug)) ?? null;
}

export function hasPendingQueuedRookie(existingSlugs: Set<string>): boolean {
  return peekNextQueuedRookie(existingSlugs) !== null;
}
