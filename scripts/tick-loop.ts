#!/usr/bin/env tsx
/**
 * Long-running tick daemon for GitHub Actions.
 * Waits for each :00/:15/:30/:45 UTC boundary, then runs one tick.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { getMsUntilNextUpdate } from "../lib/race-clock";
import { createAdminClient } from "../lib/supabase/admin";
import { ensureRaceTickedIfStale, initializeGameIfNeeded } from "../lib/race-logic";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseDurationMinutes(): number {
  const arg = process.argv.find((a) => a.startsWith("--duration-minutes="));
  const raw = arg ? arg.split("=")[1] : process.env.TICK_LOOP_DURATION_MINUTES ?? "350";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 350;
}

async function main() {
  const durationMinutes = parseDurationMinutes();
  const endAt = Date.now() + durationMinutes * 60 * 1000;
  const supabase = createAdminClient();
  await initializeGameIfNeeded(supabase);

  console.log(
    `[tick-loop] starting — ${durationMinutes}m window, one tick per 15m UTC boundary`
  );

  let tickCount = 0;

  while (Date.now() < endAt) {
    const wait = getMsUntilNextUpdate();
    const remaining = endAt - Date.now();

    if (wait > 500 && wait < remaining) {
      console.log(
        `[tick-loop] waiting ${Math.round(wait / 1000)}s for :00/:15/:30/:45 UTC`
      );
      await sleep(wait);
    }

    if (Date.now() >= endAt) break;

    console.log(`[tick-loop] tick #${tickCount + 1} at ${new Date().toISOString()}`);
    await ensureRaceTickedIfStale(supabase);
    tickCount += 1;
  }

  console.log(`[tick-loop] done — ${tickCount} tick(s) in this session`);
}

main().catch((err) => {
  console.error("[tick-loop] failed:", err);
  process.exit(1);
});
