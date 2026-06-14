#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { backfillActiveRaceTicker, backfillRaceTicker } from "../lib/backfill-ticker";
import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const raceIdArg = process.argv.find((arg) => arg.startsWith("--race-id="))?.split("=")[1];

  console.log("[backfill-ticker] starting...");
  const supabase = createAdminClient();

  const result = raceIdArg
    ? await backfillRaceTicker(supabase, raceIdArg)
    : await backfillActiveRaceTicker(supabase);

  if (!result) {
    console.log("[backfill-ticker] no active race found");
    return;
  }

  console.log(
    `[backfill-ticker] race ${result.raceNumber}: replayed ${result.ticks} ticks, inserted ${result.events} events`
  );
}

main().catch((err) => {
  console.error("[backfill-ticker] failed:", err);
  process.exit(1);
});
