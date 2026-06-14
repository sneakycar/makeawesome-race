#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import { getRaceEffectiveNow, isRaceDelayed } from "../lib/race-delay";
import {
  calculatePercentComplete,
  getRaceTickIntervalMs,
  getTickNumber,
} from "../lib/race-logic";
import { saveTickerEvents } from "../lib/ticker-db";
import type { Player } from "../lib/types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function main() {
  const applyNow = process.argv.includes("--now");
  const supabase = createAdminClient();
  const now = new Date();

  const { data: race, error: raceErr } = await supabase
    .from("races")
    .select("*")
    .eq("status", "active")
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (raceErr) throw raceErr;
  if (!race) {
    console.log("[force-fight] No active race.");
    return;
  }

  if (isRaceDelayed(race, now)) {
    console.log("[force-fight] Race is delayed — clear delay first.");
    process.exit(1);
  }

  const startedAt = new Date(race.started_at);
  const endsAt = new Date(race.ends_at);
  const effectiveNow = getRaceEffectiveNow(race, now);
  const currentTick = getTickNumber(startedAt, endsAt, effectiveNow);
  const nextTick = Math.min(currentTick + 1, 47);
  const tickMs = getRaceTickIntervalMs(startedAt, endsAt);
  const nextTickAt = startedAt.getTime() + nextTick * tickMs;
  const waitMs = Math.max(0, nextTickAt - effectiveNow.getTime());

  const { data: entries, error: entriesErr } = await supabase
    .from("race_entries")
    .select("*, player:players!race_entries_player_id_fkey(*)")
    .eq("race_id", race.id)
    .order("current_rank", { ascending: true });

  if (entriesErr) throw entriesErr;
  if (!entries?.length) {
    console.log("[force-fight] No race entries.");
    return;
  }

  if (entries.some((e) => e.is_fighting)) {
    console.log("[force-fight] A fight is already active.");
    process.exit(1);
  }

  const eligible = entries.filter((e) => !e.is_injured && !e.is_fighting);
  if (eligible.length < 2) {
    console.log("[force-fight] Need at least two healthy racers.");
    process.exit(1);
  }

  const sorted = [...eligible].sort(
    (a, b) => (a.current_rank as number) - (b.current_rank as number)
  );
  const mid = Math.max(0, Math.floor(sorted.length / 2) - 1);
  const a = sorted[mid];
  const b = sorted[mid + 1];
  const durationTicks = 5;
  const fightTick = applyNow ? currentTick : nextTick;

  if (!applyNow && waitMs > 0) {
    console.log(
      `[force-fight] Waiting ${Math.ceil(waitMs / 1000)}s for tick ${nextTick} (${new Date(nextTickAt).toISOString()})...`
    );
    await sleep(waitMs + 250);
  }

  const nameA = (a.player as Player).name;
  const nameB = (b.player as Player).name;
  const frozenA = Math.round(Number(a.race_score));
  const frozenB = Math.round(Number(b.race_score));
  const percentComplete = calculatePercentComplete(startedAt, endsAt, effectiveNow);

  const applyEntry = async (
    entryId: string,
    partnerId: string,
    frozen: number
  ) => {
    const { error } = await supabase
      .from("race_entries")
      .update({
        is_fighting: true,
        fighting_at_tick: fightTick,
        fight_end_tick: fightTick + durationTicks,
        fight_partner_id: partnerId,
        fight_frozen_score: frozen,
        race_score: frozen,
        progress: frozen,
        displayed_progress: frozen,
        last_delta: 0,
        event_note: "FIGHT",
      })
      .eq("id", entryId);
    if (error) throw error;
  };

  await applyEntry(a.id, b.player_id, frozenA);
  await applyEntry(b.id, a.player_id, frozenB);

  await saveTickerEvents(supabase, race.id, fightTick, [
    {
      message: `${nameA} and ${nameB} throw down — FIGHT!`,
      eventType: "fight",
      playerId: a.player_id,
      facts: {
        tickNumber: fightTick,
        percentComplete,
        playerName: nameA,
      },
      priority: 78,
    },
  ]);

  console.log(
    `[force-fight] FIGHT scheduled at tick ${fightTick}: ${nameA} vs ${nameB} (${durationTicks} ticks)`
  );
}

main().catch((err) => {
  console.error("[force-fight] failed:", err);
  process.exit(1);
});
