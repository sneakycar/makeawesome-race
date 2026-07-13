#!/usr/bin/env tsx
/**
 * Recover when the league has no active race (empty races table or finalize
 * never spawned the next race).
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { repairLeagueRaceState } from "../lib/race-logic";
import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const supabase = createAdminClient();
  await repairLeagueRaceState(supabase);

  const { data: race } = await supabase
    .from("races")
    .select("race_number, status, started_at, ends_at")
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!race) {
    console.log("[repair-missing-race] no race after repair — check holding pool / game_state");
    return;
  }

  console.log(
    `[repair-missing-race] latest race ${race.race_number} (${race.status}) ${race.started_at} → ${race.ends_at}`
  );
}

main().catch((err) => {
  console.error("[repair-missing-race] failed:", err);
  process.exit(1);
});
