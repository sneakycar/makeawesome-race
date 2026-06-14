#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { backfillActiveRaceScores } from "../lib/backfill-race-scores";
import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  console.log("[backfill-race-scores] starting...");
  const supabase = createAdminClient();
  const result = await backfillActiveRaceScores(supabase);
  if (!result) {
    console.log("[backfill-race-scores] no active race");
    return;
  }
  console.log(
    `[backfill-race-scores] race ${result.raceNumber} @ tick ${result.tickNumber}:`
  );
  for (const [id, score] of Object.entries(result.scores)) {
    console.log(`  ${id.slice(0, 8)}… → ${score}`);
  }
  console.log("[backfill-race-scores] complete.");
}

main().catch((err) => {
  console.error("[backfill-race-scores] failed:", err);
  process.exit(1);
});
