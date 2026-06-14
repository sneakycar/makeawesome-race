#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import { ensureRaceTickedIfStale } from "../lib/race-logic";

async function main() {
  const supabase = createAdminClient();
  const { data: gs } = await supabase
    .from("game_state")
    .select("last_tick_at")
    .eq("id", 1)
    .single();

  const last = gs?.last_tick_at ? new Date(gs.last_tick_at) : null;
  const staleMin = last
    ? (Date.now() - last.getTime()) / 60000
    : null;

  console.log(
    "[ensure-race-tick] last_tick_at:",
    last?.toISOString() ?? "(none)",
    staleMin != null ? `(${staleMin.toFixed(1)}m ago)` : ""
  );

  await ensureRaceTickedIfStale(supabase);

  const { data: after } = await supabase
    .from("game_state")
    .select("last_tick_at")
    .eq("id", 1)
    .single();

  const ran =
    after?.last_tick_at &&
    after.last_tick_at !== gs?.last_tick_at;
  console.log(ran ? "[ensure-race-tick] tick executed" : "[ensure-race-tick] still fresh, skipped");
}

main().catch((err) => {
  console.error("[ensure-race-tick] failed:", err);
  process.exit(1);
});
