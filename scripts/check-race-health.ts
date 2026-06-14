#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import { calculatePercentComplete, getTickNumber } from "../lib/race-logic";

async function main() {
  const supabase = createAdminClient();
  const now = new Date();

  const { data: gs, error: gsErr } = await supabase
    .from("game_state")
    .select("*")
    .eq("id", 1)
    .single();
  if (gsErr) throw gsErr;

  const { data: race, error: raceErr } = await supabase
    .from("races")
    .select("*")
    .eq("status", "active")
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (raceErr) throw raceErr;

  console.log("=== RACE HEALTH ===");
  console.log("now (UTC):", now.toISOString());
  console.log("game_state.last_tick_at:", gs?.last_tick_at ?? "(null)");
  if (gs?.last_tick_at) {
    const mins = (now.getTime() - new Date(gs.last_tick_at).getTime()) / 60000;
    console.log("minutes since last tick:", mins.toFixed(1));
  }

  if (!race) {
    console.log("NO ACTIVE RACE");
    return;
  }

  const startedAt = new Date(race.started_at);
  const endsAt = new Date(race.ends_at);
  const pct = calculatePercentComplete(startedAt, endsAt, now);
  const tick = getTickNumber(startedAt, endsAt, now);

  console.log("\n=== ACTIVE RACE", race.race_number, "===");
  console.log("started_at:", race.started_at);
  console.log("ends_at:", race.ends_at);
  console.log("percent_complete (db):", race.percent_complete);
  console.log("percent_complete (calc):", pct);
  console.log("expected tick number:", tick);
  console.log("delay_until:", race.delay_until ?? "(none)");
  console.log("delay_title:", race.delay_title ?? "(none)");

  const { data: entries, error: entErr } = await supabase
    .from("race_entries")
    .select("current_rank, race_score, last_delta, player:players!race_entries_player_id_fkey(name, slug)")
    .eq("race_id", race.id)
    .order("current_rank", { ascending: true });
  if (entErr) throw entErr;

  console.log("\n=== STANDINGS ===");
  for (const e of entries ?? []) {
    const raw = e.player as unknown;
    const p = (Array.isArray(raw) ? raw[0] : raw) as { name: string; slug: string };
    console.log(
      `${e.current_rank}. ${p.name} score=${e.race_score} delta=${e.last_delta}`
    );
  }

  const { data: ticker, error: tickErr } = await supabase
    .from("race_ticker_events")
    .select("id, tick_number, message, created_at, event_type")
    .eq("race_id", race.id)
    .order("created_at", { ascending: false })
    .limit(10);
  if (tickErr) throw tickErr;

  console.log("\n=== RECENT TICKER (newest first) ===");
  for (const t of ticker ?? []) {
    const mins = (now.getTime() - new Date(t.created_at).getTime()) / 60000;
    console.log(
      `[${mins.toFixed(0)}m ago] tick=${t.tick_number} ${t.event_type}: ${t.message}`
    );
  }

  const { count: tickCount } = await supabase
    .from("race_ticker_events")
    .select("id", { count: "exact", head: true })
    .eq("race_id", race.id);
  console.log("\ntotal ticker events this race:", tickCount);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
