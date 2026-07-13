#!/usr/bin/env tsx
/**
 * Anchor the active race to today's 9am→9am Eastern window (by local Eastern date)
 * and replay sim + ticker through the current moment.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { backfillActiveRaceScores } from "../lib/backfill-race-scores";
import { backfillActiveRaceTicker } from "../lib/backfill-ticker";
import { getRaceWindowForEasternDay } from "../lib/eastern-time";
import { calculatePercentComplete } from "../lib/race-logic";
import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const supabase = createAdminClient();
  const now = new Date();

  const { data: race, error: raceErr } = await supabase
    .from("races")
    .select("id, race_number, status")
    .eq("status", "active")
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (raceErr) throw raceErr;
  if (!race) {
    console.log("[backfill-race-today] no active race");
    return;
  }

  // Eastern "today" at 9am — if we're before 9am ET, use yesterday's window.
  const easternNow = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(easternNow.find((p) => p.type === type)!.value);
  let year = get("year");
  let month = get("month");
  let day = get("day");
  const hour = get("hour");

  if (hour < 9) {
    const anchor = new Date(Date.UTC(year, month - 1, day));
    anchor.setUTCDate(anchor.getUTCDate() - 1);
    year = anchor.getUTCFullYear();
    month = anchor.getUTCMonth() + 1;
    day = anchor.getUTCDate();
  }

  const { startedAt, endsAt } = getRaceWindowForEasternDay(year, month, day);
  const percentComplete = calculatePercentComplete(startedAt, endsAt, now);

  const { error: scheduleErr } = await supabase
    .from("races")
    .update({
      started_at: startedAt.toISOString(),
      ends_at: endsAt.toISOString(),
      percent_complete: percentComplete,
      delay_until: null,
      delay_started_at: null,
      delay_title: null,
      delay_body: null,
      delay_frozen_percent: null,
    })
    .eq("id", race.id);

  if (scheduleErr) throw scheduleErr;

  console.log(
    `[backfill-race-today] race ${race.race_number}: ${startedAt.toISOString()} → ${endsAt.toISOString()} (${percentComplete}%)`
  );

  const { data: entries, error: entriesErr } = await supabase
    .from("race_entries")
    .select("id")
    .eq("race_id", race.id);

  if (entriesErr) throw entriesErr;

  const resetNow = now.toISOString();
  for (const entry of entries ?? []) {
    const { error: resetErr } = await supabase
      .from("race_entries")
      .update({
        progress: 0,
        displayed_progress: 0,
        race_score: 0,
        peak_race_score: 0,
        fan_live_bonus: 0,
        last_delta: 0,
        recent_deltas: [],
        last_rank_change: 0,
        event_note: null,
        current_rank: 1,
        is_injured: false,
        injured_at_tick: null,
        injury_name: null,
        injury_severity: null,
        injury_note: null,
        injury_races_missed: null,
        is_fighting: false,
        fighting_at_tick: null,
        fight_end_tick: null,
        fight_partner_id: null,
        fight_frozen_score: null,
        bad_money_count: 0,
        bad_money_effect: 0,
        updated_at: resetNow,
      })
      .eq("id", entry.id);

    if (resetErr) throw resetErr;
  }

  const scores = await backfillActiveRaceScores(supabase);
  if (!scores) throw new Error("backfillActiveRaceScores returned null");

  const ticker = await backfillActiveRaceTicker(supabase);
  if (!ticker) throw new Error("backfillActiveRaceTicker returned null");

  await supabase
    .from("game_state")
    .update({ last_tick_at: now.toISOString(), updated_at: resetNow })
    .eq("id", 1);

  console.log(
    `[backfill-race-today] tick ${scores.tickNumber}, ticker ${ticker.events} events, top score ${Math.max(...Object.values(scores.scores))}`
  );
  console.log("[backfill-race-today] complete.");
}

main().catch((err) => {
  console.error("[backfill-race-today] failed:", err);
  process.exit(1);
});
