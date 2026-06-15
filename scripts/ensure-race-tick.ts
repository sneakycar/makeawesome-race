#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import { ensureRaceTickedIfStale, getRaceTickLag } from "../lib/race-logic";

async function main() {
  const supabase = createAdminClient();
  const lag = await getRaceTickLag(supabase);

  const { data: gs } = await supabase
    .from("game_state")
    .select("last_tick_at")
    .eq("id", 1)
    .single();

  const last = gs?.last_tick_at ? new Date(gs.last_tick_at) : null;
  const staleMin = last ? (Date.now() - last.getTime()) / 60000 : null;

  console.log(
    "[ensure-race-tick] last_tick_at:",
    last?.toISOString() ?? "(none)",
    staleMin != null ? `(${staleMin.toFixed(1)}m ago)` : ""
  );

  if (lag) {
    console.log(
      "[ensure-race-tick] targetTick:",
      lag.targetTick,
      "maxProcessed:",
      lag.maxProcessedTick,
      "missing:",
      lag.missingCount
    );
  }

  const beforeMissing = lag?.missingCount ?? 0;
  await ensureRaceTickedIfStale(supabase);
  const afterLag = await getRaceTickLag(supabase);

  const ran =
    afterLag != null && afterLag.missingCount < beforeMissing;
  console.log(
    ran
      ? `[ensure-race-tick] caught up (${beforeMissing - (afterLag?.missingCount ?? 0)} tick(s))`
      : "[ensure-race-tick] on schedule, skipped"
  );
}

main().catch((err) => {
  console.error("[ensure-race-tick] failed:", err);
  process.exit(1);
});
