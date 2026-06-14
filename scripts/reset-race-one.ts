#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import { resetToFirstRace } from "../lib/race-logic";

async function main() {
  console.log("[reset-race-one] starting...");
  const supabase = createAdminClient();
  const race = await resetToFirstRace(supabase);
  const started = new Date(race.started_at);
  const ends = new Date(race.ends_at);
  const remainingH = Math.max(0, (ends.getTime() - Date.now()) / 3600000);
  console.log(
    `[reset-race-one] race ${race.race_number} live (${race.percent_complete}% complete, ~${remainingH.toFixed(1)}h remaining)`
  );
  console.log(`[reset-race-one] ${started.toISOString()} → ${ends.toISOString()}`);
  console.log("[reset-race-one] complete.");
}

main().catch((err) => {
  console.error("[reset-race-one] failed:", err);
  process.exit(1);
});
