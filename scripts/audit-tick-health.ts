#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import { getTickNumber } from "../lib/race-logic";

async function main() {
  const supabase = createAdminClient();
  const now = new Date();

  const { data: race } = await supabase
    .from("races")
    .select("*")
    .eq("status", "active")
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: gs } = await supabase
    .from("game_state")
    .select("last_tick_at, updated_at")
    .eq("id", 1)
    .single();

  if (!race) {
    console.log("No active race");
    return;
  }

  const startedAt = new Date(race.started_at);
  const endsAt = new Date(race.ends_at);
  const targetTick = getTickNumber(startedAt, endsAt, now);

  const { data: tickerRows } = await supabase
    .from("race_ticker_events")
    .select("tick_number, event_type, message, created_at")
    .eq("race_id", race.id)
    .order("tick_number", { ascending: false })
    .limit(15);

  const { data: processed } = await supabase
    .from("race_ticker_events")
    .select("tick_number")
    .eq("race_id", race.id);

  const processedTicks = new Set((processed ?? []).map((r) => r.tick_number));
  let latestMissing = -1;
  for (let t = targetTick; t >= 0; t--) {
    if (!processedTicks.has(t)) {
      latestMissing = t;
      break;
    }
  }

  const maxProcessed = Math.max(-1, ...(processed ?? []).map((r) => r.tick_number));

  console.log("=== TICK HEALTH ===");
  console.log("now:", now.toISOString());
  console.log("race:", race.race_number, race.id);
  console.log("started:", race.started_at);
  console.log("ends:", race.ends_at);
  console.log("percent:", race.percent_complete);
  console.log("delay_until:", race.delay_until);
  console.log("delay_title:", race.delay_title);
  console.log("delay_frozen_percent:", race.delay_frozen_percent);
  console.log("last_tick_at:", gs?.last_tick_at);
  console.log("targetTick:", targetTick);
  console.log("maxProcessedTick:", maxProcessed);
  console.log("latestMissingTick:", latestMissing);
  console.log("behind by ticks:", targetTick - maxProcessed);
  console.log("\nRecent ticker:");
  for (const row of tickerRows ?? []) {
    console.log(
      `  tick ${row.tick_number} [${row.event_type}] ${row.created_at} — ${row.message.slice(0, 70)}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
