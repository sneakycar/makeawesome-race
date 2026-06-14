import type { SupabaseClient } from "@supabase/supabase-js";
import type { Player, OvrRanking } from "./types";

export type { OvrRanking };

export type OvrPlayer = Pick<
  Player,
  "id" | "grit" | "chaos" | "nerve" | "luck" | "burst" | "drag" | "rating"
>;

/** Overall ability rating (1–99) from the six pip stats plus rating. */
export function calculatePlayerOvr(player: OvrPlayer): number {
  const raw =
    player.grit * 0.18 +
    player.chaos * 0.14 +
    player.nerve * 0.16 +
    player.luck * 0.12 +
    player.burst * 0.16 +
    (100 - player.drag) * 0.14 +
    player.rating * 0.1;

  return Math.round(Math.max(1, Math.min(99, raw)));
}

export function buildOvrRankings(players: OvrPlayer[]): Map<string, OvrRanking> {
  const scored = players.map((player) => ({
    id: player.id,
    ovr: calculatePlayerOvr(player),
  }));

  scored.sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id));

  const total = scored.length;
  const map = new Map<string, OvrRanking>();
  let rank = 0;
  let prevOvr: number | null = null;

  for (let i = 0; i < scored.length; i++) {
    if (scored[i].ovr !== prevOvr) {
      rank = i + 1;
      prevOvr = scored[i].ovr;
    }
    map.set(scored[i].id, { ovr: scored[i].ovr, rank, total });
  }

  return map;
}

export function ovrRankingsToRecord(
  rankings: Map<string, OvrRanking>
): Record<string, OvrRanking> {
  return Object.fromEntries(rankings);
}

export function formatOvrRank(ranking: OvrRanking): string {
  return `#${ranking.rank}/${ranking.total}`;
}

export async function getOvrRankings(
  supabase: SupabaseClient
): Promise<Map<string, OvrRanking>> {
  const { data, error } = await supabase
    .from("players")
    .select("id, grit, chaos, nerve, luck, burst, drag, rating");

  if (error) throw error;
  return buildOvrRankings(data || []);
}
