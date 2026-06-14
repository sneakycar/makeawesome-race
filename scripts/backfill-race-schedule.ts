#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import {
  calculatePercentComplete,
  getNextRaceDayBounds,
  getRaceOneBounds,
} from "../lib/race-logic";

async function main() {
  console.log("[backfill-race-schedule] starting...");
  const supabase = createAdminClient();
  const now = new Date();

  const { data: races, error: listErr } = await supabase
    .from("races")
    .select("id, race_number, status, started_at, ends_at")
    .order("race_number", { ascending: true });

  if (listErr) throw listErr;
  if (!races?.length) {
    console.log("[backfill-race-schedule] no races found — nothing to do.");
    return;
  }

  let previousEndsAt: Date | null = null;

  for (const race of races) {
    let startedAt: Date;
    let endsAt: Date;

    if (race.race_number === 1) {
      ({ startedAt, endsAt } = getRaceOneBounds());
    } else if (previousEndsAt) {
      ({ startedAt, endsAt } = getNextRaceDayBounds(previousEndsAt));
    } else {
      console.warn(`[backfill-race-schedule] skipping race ${race.race_number} — no anchor`);
      continue;
    }

    previousEndsAt = endsAt;

    const percentComplete =
      race.status === "finalized"
        ? 100
        : calculatePercentComplete(startedAt, endsAt, now);

    const { error: updateErr } = await supabase
      .from("races")
      .update({
        started_at: startedAt.toISOString(),
        ends_at: endsAt.toISOString(),
        percent_complete: percentComplete,
      })
      .eq("id", race.id);

    if (updateErr) throw updateErr;

    console.log(
      `[backfill-race-schedule] race ${race.race_number}: ${startedAt.toISOString()} → ${endsAt.toISOString()} (${percentComplete}%)`
    );
  }

  console.log("[backfill-race-schedule] complete.");
}

main().catch((err) => {
  console.error("[backfill-race-schedule] failed:", err);
  process.exit(1);
});
