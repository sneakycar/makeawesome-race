#!/usr/bin/env tsx
/**
 * Full league reset: retire all racers, wipe history, seed eight fresh names, race 1 live.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { slugify } from "../lib/format";
import {
  EASTERN_TZ,
  RACE_START_HOUR,
  getEasternCalendarDate,
  getRaceWindowForEasternDay,
} from "../lib/eastern-time";
import { createAdminClient } from "../lib/supabase/admin";
import {
  B3S_SEED_ACTIVE_NAMES,
  buildPlayerInsert,
  calculatePercentComplete,
  createRace,
  getRaceTickLag,
  tickRace,
} from "../lib/race-logic";

const CATCHUP_MAX = 120;

function getEasternHour(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")!.value);
}

/** 9am Eastern today if past 9am, otherwise yesterday's window (overnight). */
function getCurrentRaceWindow(now = new Date()) {
  const cal = getEasternCalendarDate(now);
  const hour = getEasternHour(now);
  if (hour >= RACE_START_HOUR) {
    return getRaceWindowForEasternDay(cal.year, cal.month, cal.day);
  }
  const noon = new Date(
    Date.UTC(cal.year, cal.month - 1, cal.day, 17, 0, 0)
  );
  const prev = getEasternCalendarDate(
    new Date(noon.getTime() - 24 * 60 * 60 * 1000)
  );
  return getRaceWindowForEasternDay(prev.year, prev.month, prev.day);
}

async function catchUpTicks(supabase: ReturnType<typeof createAdminClient>) {
  for (let i = 0; i < CATCHUP_MAX; i++) {
    const lag = await getRaceTickLag(supabase);
    if (!lag || lag.needsFinalize) {
      if (lag?.needsFinalize) await tickRace(supabase);
      break;
    }
    if (lag.latestMissingTick < 0) break;
    await tickRace(supabase);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();
  const { startedAt, endsAt } = getCurrentRaceWindow(now);
  const percentComplete = calculatePercentComplete(startedAt, endsAt, now);

  console.log("[reset-b3s-league] starting", dryRun ? "(dry run)" : "");
  console.log(
    `[reset-b3s-league] race window ${startedAt.toISOString()} → ${endsAt.toISOString()} (${percentComplete}% complete)`
  );

  const supabase = createAdminClient();

  const { data: existingPlayers, error: listErr } = await supabase
    .from("players")
    .select("id, name, status")
    .neq("status", "retired");
  if (listErr) throw listErr;

  console.log(
    `[reset-b3s-league] retiring ${existingPlayers?.length ?? 0} racers:`,
    (existingPlayers ?? []).map((p) => p.name).join(", ")
  );

  if (dryRun) {
    console.log("[reset-b3s-league] new roster:", B3S_SEED_ACTIVE_NAMES.join(", "));
    return;
  }

  const { error: retireErr } = await supabase
    .from("players")
    .update({ status: "retired", updated_at: now.toISOString() })
    .neq("status", "retired");
  if (retireErr) throw retireErr;

  const { error: histErr } = await supabase
    .from("player_history")
    .delete()
    .gte("day_number", 0);
  if (histErr) throw histErr;

  const { error: raceDelErr } = await supabase.from("races").delete().gte("race_number", 1);
  if (raceDelErr) throw raceDelErr;

  const newPlayers = B3S_SEED_ACTIVE_NAMES.map((name, i) =>
    buildPlayerInsert(name, slugify(name), "active", 1, `b3s-seed-${i}`)
  );

  const { data: inserted, error: insertErr } = await supabase
    .from("players")
    .insert(newPlayers)
    .select("id, name, archetype");
  if (insertErr) throw insertErr;

  const rosterIds = (inserted ?? []).map((p) => p.id);
  if (rosterIds.length !== 8) {
    throw new Error(`Expected 8 new racers, got ${rosterIds.length}`);
  }

  console.log(
    "[reset-b3s-league] created:",
    (inserted ?? []).map((p) => `${p.name} (${p.archetype})`).join(", ")
  );

  const race = await createRace(supabase, 1, 1, rosterIds, startedAt, endsAt);

  await supabase
    .from("races")
    .update({ percent_complete: percentComplete })
    .eq("id", race.id);

  const { error: gsErr } = await supabase.from("game_state").upsert({
    id: 1,
    current_day: 1,
    current_race_number: 1,
    last_tick_at: startedAt.toISOString(),
    god_score_awarded: false,
    updated_at: now.toISOString(),
  });
  if (gsErr) throw gsErr;

  console.log("[reset-b3s-league] catching up ticks...");
  await catchUpTicks(supabase);

  const lag = await getRaceTickLag(supabase);
  const { data: finalRace } = await supabase
    .from("races")
    .select("percent_complete, started_at, ends_at")
    .eq("id", race.id)
    .single();

  console.log(
    `[reset-b3s-league] race 1 live — ${finalRace?.percent_complete ?? percentComplete}% complete` +
      (lag?.latestMissingTick >= 0 ? ` (${lag.missingCount} ticks still behind)` : "")
  );
  console.log("[reset-b3s-league] complete.");
}

main().catch((err) => {
  console.error("[reset-b3s-league] failed:", err);
  process.exit(1);
});
