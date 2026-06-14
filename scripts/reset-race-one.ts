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
  console.log(
    `[reset-race-one] fresh race ${race.race_number} created (${race.percent_complete}% complete)`
  );
  console.log("[reset-race-one] complete.");
}

main().catch((err) => {
  console.error("[reset-race-one] failed:", err);
  process.exit(1);
});
