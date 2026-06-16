import type { PlayerIdentity } from "./identity";

export interface QueuedRookie {
  name: string;
  slug: string;
  /** Fixed identity; omit to roll archetype/traits/stats from seed. */
  identity?: PlayerIdentity;
}

/** Named rookies enter in order before procedural name generation resumes. */
export const QUEUED_ROOKIES: readonly QueuedRookie[] = [
  {
    name: "walhof",
    slug: "walhof",
    identity: {
      archetype: "STAR",
      traits: ["FAMOUS", "LOUD"],
      signature_stat: "burst",
    },
  },
  {
    name: "Ace",
    slug: "ace",
  },
];

/** @deprecated use QUEUED_ROOKIES */
export const QUEUED_ROOKIE = QUEUED_ROOKIES[0]!;

export function peekNextQueuedRookie(existingSlugs: Set<string>): QueuedRookie | null {
  return QUEUED_ROOKIES.find((rookie) => !existingSlugs.has(rookie.slug)) ?? null;
}

export function hasPendingQueuedRookie(existingSlugs: Set<string>): boolean {
  return peekNextQueuedRookie(existingSlugs) !== null;
}
