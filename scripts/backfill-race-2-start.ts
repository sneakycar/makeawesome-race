#!/usr/bin/env tsx
/**
 * Backfill race 2 from a clean 9 AM Eastern start:
 * - Fix race 1 final ranks; send 8th place to holding
 * - Ensure walhof replaces them on the race 2 roster
 * - Reset race 2 schedule + scores, replay sim through current tick
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import { backfillActiveRaceScores } from "../lib/backfill-race-scores";
import {
  createPlayer,
  getNextRaceDayBounds,
  QUEUED_ROOKIE,
} from "../lib/race-logic";
import type { Player } from "../lib/types";

function rankRace1Finals(
  entries: Array<{
    id: string;
    race_score: number;
    is_injured?: boolean;
    is_disqualified?: boolean;
    player: Player;
  }>
) {
  const healthy = entries
    .filter((e) => !e.is_injured && !e.is_disqualified)
    .sort((a, b) => Number(b.race_score) - Number(a.race_score));
  const disqualified = entries
    .filter((e) => !e.is_injured && e.is_disqualified)
    .sort((a, b) => Number(b.race_score) - Number(a.race_score));
  const injured = entries
    .filter((e) => e.is_injured)
    .sort((a, b) => Number(b.race_score) - Number(a.race_score));
  const sorted = [...healthy, ...disqualified, ...injured];
  const healthyCount = healthy.length;
  return sorted.map((entry, index) => ({
    ...entry,
    final_rank: index + 1,
    isLast: !entry.is_injured && !entry.is_disqualified && entry === healthy[healthyCount - 1],
  }));
}

async function main() {
  console.log("[backfill-race-2-start] starting...");
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: race1, error: r1Err } = await supabase
    .from("races")
    .select("*")
    .eq("race_number", 1)
    .maybeSingle();

  if (r1Err) throw r1Err;
  if (!race1 || race1.status !== "finalized") {
    throw new Error("Race 1 must be finalized before backfilling race 2");
  }

  const { data: race1Entries, error: e1Err } = await supabase
    .from("race_entries")
    .select("*, player:players!race_entries_player_id_fkey(*)")
    .eq("race_id", race1.id);

  if (e1Err) throw e1Err;
  if (!race1Entries?.length) throw new Error("Race 1 has no entries");

  const rankedR1 = rankRace1Finals(
    race1Entries.map((entry) => ({
      id: entry.id,
      race_score: Number(entry.race_score),
      is_injured: Boolean(entry.is_injured),
      is_disqualified: Boolean((entry as { is_disqualified?: boolean }).is_disqualified),
      player: entry.player as Player,
    }))
  );

  for (const entry of rankedR1) {
    const { error } = await supabase
      .from("race_entries")
      .update({
        final_rank: entry.final_rank,
        updated_at: now,
      })
      .eq("id", entry.id);
    if (error) throw error;
  }

  const lastEntry = rankedR1.find((e) => e.isLast);
  if (!lastEntry) throw new Error("Could not determine race 1 last place");

  const lastPlayer = lastEntry.player as Player;
  console.log(
    `[backfill-race-2-start] race 1 last place: ${lastPlayer.name} (P${lastEntry.final_rank})`
  );

  if (lastPlayer.status !== "holding") {
    const { error: holdErr } = await supabase
      .from("players")
      .update({
        status: "holding",
        eliminations: lastPlayer.eliminations + 1,
        holding_days: lastPlayer.holding_days + 1,
        total_holding_days: lastPlayer.total_holding_days + 1,
        pressure: Math.max(0, lastPlayer.pressure - 8),
        fatigue: Math.max(0, lastPlayer.fatigue - 3),
        updated_at: now,
      })
      .eq("id", lastPlayer.id);

    if (holdErr) throw holdErr;
  }

  const { data: race2, error: r2Err } = await supabase
    .from("races")
    .select("*")
    .eq("race_number", 2)
    .maybeSingle();

  if (r2Err) throw r2Err;
  if (!race2 || race2.status !== "active") {
    throw new Error("Active race 2 not found");
  }

  let walhof = (
    await supabase.from("players").select("*").eq("slug", QUEUED_ROOKIE.slug).maybeSingle()
  ).data as Player | null;

  if (!walhof) {
    console.log("[backfill-race-2-start] creating walhof...");
    walhof = await createPlayer(supabase, "active", race2.day_number);
  } else if (walhof.status !== "active") {
    const { error: walhofActiveErr } = await supabase
      .from("players")
      .update({ status: "active", updated_at: now })
      .eq("id", walhof.id);
    if (walhofActiveErr) throw walhofActiveErr;
  }

  const { data: race2Entries, error: e2Err } = await supabase
    .from("race_entries")
    .select("*")
    .eq("race_id", race2.id);

  if (e2Err) throw e2Err;
  if (!race2Entries?.length) throw new Error("Race 2 has no entries");

  const lastInRace2 = race2Entries.find((e) => e.player_id === lastPlayer.id);
  const walhofInRace2 = race2Entries.find((e) => e.player_id === walhof!.id);

  if (lastInRace2 && !walhofInRace2) {
    const { error: swapErr } = await supabase
      .from("race_entries")
      .update({ player_id: walhof.id, updated_at: now })
      .eq("id", lastInRace2.id);
    if (swapErr) throw swapErr;
    console.log(`[backfill-race-2-start] swapped ${lastPlayer.slug} → walhof on race 2 roster`);
  } else if (!walhofInRace2) {
    throw new Error("walhof is not on the race 2 roster and last place slot not found");
  }

  const { startedAt, endsAt } = getNextRaceDayBounds(new Date(race1.ends_at));
  console.log(
    `[backfill-race-2-start] race 2 window: ${startedAt.toISOString()} → ${endsAt.toISOString()}`
  );

  const { error: race2ScheduleErr } = await supabase
    .from("races")
    .update({
      started_at: startedAt.toISOString(),
      ends_at: endsAt.toISOString(),
      percent_complete: 0,
    })
    .eq("id", race2.id);

  if (race2ScheduleErr) throw race2ScheduleErr;

  for (const entry of race2Entries) {
    const { error: resetErr } = await supabase
      .from("race_entries")
      .update({
        progress: 0,
        displayed_progress: 0,
        race_score: 0,
        peak_race_score: 0,
        fan_live_bonus: 0,
        last_delta: 0,
        recent_deltas: [],
        last_rank_change: 0,
        event_note: null,
        current_rank: 1,
        is_injured: false,
        injured_at_tick: null,
        injury_name: null,
        injury_severity: null,
        injury_note: null,
        injury_races_missed: null,
        is_fighting: false,
        fighting_at_tick: null,
        fight_end_tick: null,
        fight_partner_id: null,
        fight_frozen_score: null,
        bad_money_count: 0,
        bad_money_effect: null,
        updated_at: now,
      })
      .eq("id", entry.id);

    if (resetErr) throw resetErr;
  }

  const result = await backfillActiveRaceScores(supabase);
  if (!result) throw new Error("backfillActiveRaceScores returned null");

  await supabase
    .from("game_state")
    .update({ last_tick_at: new Date().toISOString(), updated_at: now })
    .eq("id", 1);

  console.log(
    `[backfill-race-2-start] replayed through tick ${result.tickNumber} (${Object.keys(result.scores).length} racers)`
  );
  console.log("[backfill-race-2-start] top scores:", result.scores);
  console.log("[backfill-race-2-start] complete.");
}

main().catch((err) => {
  console.error("[backfill-race-2-start] failed:", err);
  process.exit(1);
});
