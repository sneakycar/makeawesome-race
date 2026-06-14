#!/usr/bin/env tsx
/**
 * Recompute finalized race scores from the deterministic sim replay.
 *
 * Usage:
 *   npm run repair-race-scores -- 1
 *   npm run repair-race-scores -- 1 --ignore-flags
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import { repairFinalizedRaceScores } from "../lib/replay-race-scores";

async function main() {
  const raceNumber = Number(process.argv[2]);
  const ignoreFlags = process.argv.includes("--ignore-flags");

  if (!Number.isFinite(raceNumber) || raceNumber < 1) {
    throw new Error("Usage: repair-race-scores <raceNumber> [--ignore-flags]");
  }

  console.log(
    `[repair-race-scores] race ${raceNumber}${ignoreFlags ? " (ignoring injury/fight flags)" : ""}...`
  );

  const supabase = createAdminClient();
  const scores = await repairFinalizedRaceScores(supabase, raceNumber, {
    ignoreStatusFlags: ignoreFlags,
  });

  console.log("[repair-race-scores] updated scores:", scores);
  console.log("[repair-race-scores] complete.");
}

main().catch((err) => {
  console.error("[repair-race-scores] failed:", err);
  process.exit(1);
});
