import type { SupabaseClient } from "@supabase/supabase-js";
import { LANE_COUNT, LANE_PROFILES, getLaneProfile } from "./lanes";
import type { LaneWinStat } from "./types";

export async function getLaneWinStats(supabase: SupabaseClient): Promise<LaneWinStat[]> {
  const { data: races, error: raceErr } = await supabase
    .from("races")
    .select("id")
    .eq("status", "finalized");

  if (raceErr) throw raceErr;
  if (!races?.length) {
    return emptyLaneStats();
  }

  const raceIds = races.map((r) => r.id);
  const { data: entries, error: entryErr } = await supabase
    .from("race_entries")
    .select("lane, final_rank")
    .in("race_id", raceIds);

  if (entryErr) throw entryErr;

  const tallies = new Map<number, { wins: number; starts: number }>();
  for (let lane = 1; lane <= LANE_COUNT; lane++) {
    tallies.set(lane, { wins: 0, starts: 0 });
  }

  for (const entry of entries ?? []) {
    const lane = entry.lane as number;
    if (lane < 1 || lane > LANE_COUNT) continue;
    const row = tallies.get(lane)!;
    row.starts += 1;
    if (entry.final_rank === 1) row.wins += 1;
  }

  return [...tallies.entries()]
    .map(([lane, { wins, starts }]) => {
      const profile = getLaneProfile(lane);
      return {
        lane,
        label: profile.label,
        wins,
        starts,
        winPct: starts > 0 ? Math.round((wins / starts) * 1000) / 10 : 0,
        performanceBonus: profile.bonus,
      };
    })
    .sort((a, b) => a.lane - b.lane);
}

function emptyLaneStats(): LaneWinStat[] {
  return LANE_PROFILES.map((profile) => ({
    lane: profile.lane,
    label: profile.label,
    wins: 0,
    starts: 0,
    winPct: 0,
    performanceBonus: profile.bonus,
  }));
}
