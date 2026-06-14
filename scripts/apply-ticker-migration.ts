#!/usr/bin/env tsx
/**
 * Applies verifiable-ticker migration via Supabase Management API is not available;
 * this script uses the service-role client to verify columns exist and prints
 * the SQL to run if not.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const supabase = createAdminClient();

  const probe = await supabase
    .from("race_ticker_events")
    .select("event_type, player_id, facts")
    .limit(1);

  if (probe.error?.message.includes("column")) {
    console.error(
      "[apply-ticker-migration] Missing columns. Run this in Supabase SQL Editor:\n"
    );
    console.error("  supabase/migrations/20260613210000_verifiable_ticker.sql\n");
    process.exit(1);
  }

  const entryProbe = await supabase
    .from("race_entries")
    .select("last_rank_change")
    .limit(1);

  if (entryProbe.error?.message.includes("column")) {
    console.error(
      "[apply-ticker-migration] Missing last_rank_change. Run:\n"
    );
    console.error("  supabase/migrations/20260613210000_verifiable_ticker.sql\n");
    process.exit(1);
  }

  console.log("[apply-ticker-migration] schema OK — verifiable ticker columns present.");
}

main().catch((err) => {
  console.error("[apply-ticker-migration] failed:", err);
  process.exit(1);
});
