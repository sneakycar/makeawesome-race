#!/usr/bin/env tsx
/**
 * Audit B3S league integrity and repair legacy leaks (retired stats, stale history text).
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { isApprovedLeaguePlayerSeed } from "../lib/league-roster";
import { createAdminClient } from "../lib/supabase/admin";
import { getActiveStreaks, getAllTimeTop3 } from "../lib/race-logic";

const LEGACY_NAME_MARKERS = [
  "uncle",
  "chrisman",
  "walhof",
  "jon penn",
  "bhole",
  "lacie",
  "chris vogel",
  "pal",
  "kimber",
  "Troll",
  "UNCLE",
];

const NUMERIC_OPPONENT: Record<string, string> = {
  "1": "gerald",
  "2": "rob",
  "3": "sam",
  "4": "danz",
  "5": "emily",
  "6": "tacosaurus",
  "7": "daven23",
  "8": "kara",
};

async function main() {
  const repair = process.argv.includes("--repair");
  const supabase = createAdminClient();
  const issues: string[] = [];

  const { data: races } = await supabase
    .from("races")
    .select("id, race_number, status, percent_complete, started_at, ends_at")
    .order("race_number", { ascending: true });

  const activeRaces = (races ?? []).filter((r) => r.status === "active");
  const finalizedRaces = (races ?? []).filter((r) => r.status === "finalized");

  console.log("\n=== RACES ===");
  for (const race of races ?? []) {
    console.log(`  race ${race.race_number}: ${race.status} (${race.percent_complete}%)`);
  }
  if (activeRaces.length !== 1) {
    issues.push(`expected 1 active race, found ${activeRaces.length}`);
  }
  if (finalizedRaces.length > 0) {
    issues.push(`expected 0 finalized races for fresh league, found ${finalizedRaces.length}`);
  }

  const { data: activePlayers } = await supabase
    .from("players")
    .select("id, name, slug, status, seed, wins, races, current_streak_type, current_streak_count")
    .eq("status", "active")
    .order("name", { ascending: true });

  console.log("\n=== ACTIVE ROSTER ===");
  for (const p of activePlayers ?? []) {
    console.log(`  ${p.name} (${p.slug}) — wins ${p.wins}, streak ${p.current_streak_type}/${p.current_streak_count}`);
  }
  if ((activePlayers ?? []).length !== 8) {
    issues.push(`expected 8 active racers, found ${activePlayers?.length ?? 0}`);
  }

  for (const p of activePlayers ?? []) {
    if (!isApprovedLeaguePlayerSeed(p.seed)) {
      issues.push(`procedural/unapproved active racer: ${p.name} (seed ${p.seed})`);
    }
    if (p.wins > 0 || p.current_streak_count > 0) {
      issues.push(`active racer ${p.name} has pre-finalize career stats`);
    }
  }

  const { data: retiredDirty } = await supabase
    .from("players")
    .select("name, slug, wins, current_streak_type, current_streak_count, races")
    .eq("status", "retired")
    .or("wins.gt.0,current_streak_count.gt.0,races.gt.0");

  console.log("\n=== RETIRED LEAKS ===");
  if (!retiredDirty?.length) {
    console.log("  none");
  } else {
    for (const p of retiredDirty) {
      console.log(`  ${p.name}: wins=${p.wins} races=${p.races} streak=${p.current_streak_type}/${p.current_streak_count}`);
      issues.push(`retired racer ${p.name} still has career stats`);
    }
  }

  const allTime = await getAllTimeTop3(supabase);
  const streaks = await getActiveStreaks(supabase);
  console.log("\n=== HOME PANELS ===");
  console.log("  all-time:", allTime.length ? allTime : "(empty)");
  console.log("  streaks:", streaks.length ? streaks : "(empty)");
  if (allTime.length > 0) {
    issues.push(`all-time panel shows ${allTime.map((p) => p.name).join(", ")}`);
  }
  for (const s of streaks) {
    const leagueOk = (activePlayers ?? []).some((p) => p.slug === s.slug);
    if (!leagueOk) {
      issues.push(`streak panel shows legacy racer ${s.name}`);
    }
  }

  const activeRaceId = activeRaces[0]?.id;
  if (activeRaceId) {
    const { data: tickerRows } = await supabase
      .from("race_ticker_events")
      .select("id, message")
      .eq("race_id", activeRaceId);

    const staleTicker = (tickerRows ?? []).filter((row) =>
      LEGACY_NAME_MARKERS.some((m) => row.message.toLowerCase().includes(m.toLowerCase()))
    );
    console.log("\n=== TICKER ===");
    console.log(`  rows: ${tickerRows?.length ?? 0}, legacy names: ${staleTicker.length}`);

    const { data: historyRows } = await supabase
      .from("player_history")
      .select("id, event_type, event_text, player:players(name)")
      .eq("race_id", activeRaceId);

    const staleHistory = (historyRows ?? []).filter((row) => {
      const text = row.event_text ?? "";
      if (LEGACY_NAME_MARKERS.some((m) => text.toLowerCase().includes(m.toLowerCase()))) {
        return true;
      }
      return /\bvs\s+[1-8]\b/i.test(text);
    });

    console.log("\n=== PLAYER HISTORY (race 1) ===");
    for (const row of historyRows ?? []) {
      const player = row.player as { name: string } | { name: string }[] | null;
      const name = Array.isArray(player) ? player[0]?.name : player?.name;
      console.log(`  ${name}: [${row.event_type}] ${row.event_text}`);
    }
    if (staleHistory.length) {
      issues.push(`${staleHistory.length} player_history rows have stale opponent names`);
    }
  }

  console.log("\n=== SUMMARY ===");
  if (!issues.length) {
    console.log("  OK — no issues found");
    return;
  }

  for (const issue of issues) console.log(`  ! ${issue}`);

  if (!repair) {
    console.log("\nRun with --repair to fix retired stat leaks and stale history text.");
    process.exitCode = 1;
    return;
  }

  console.log("\n=== REPAIR ===");

  const { error: retireCleanErr } = await supabase
    .from("players")
    .update({
      races: 0,
      wins: 0,
      eliminations: 0,
      returns: 0,
      best_finish: null,
      worst_finish: null,
      current_streak_type: "none",
      current_streak_count: 0,
      longest_win_streak: 0,
      total_holding_days: 0,
      highest_race_score: 0,
      highest_career_score: 0,
      biggest_comeback: 0,
      total_support_received: 0,
    })
    .eq("status", "retired");
  if (retireCleanErr) throw retireCleanErr;
  console.log("  cleared career stats on retired racers");

  const { data: fightHistory } = await supabase
    .from("player_history")
    .select("id, event_text")
    .eq("event_type", "fight");

  for (const row of fightHistory ?? []) {
    let text = row.event_text;
    let changed = false;
    for (const [num, name] of Object.entries(NUMERIC_OPPONENT)) {
      const next = text.replace(new RegExp(`\\bvs\\s+${num}\\b`, "gi"), `vs ${name}`);
      if (next !== text) {
        text = next;
        changed = true;
      }
      const next2 = text.replace(new RegExp(`\\b${num}\\s+vs\\b`, "gi"), `${name} vs`);
      if (next2 !== text) {
        text = next2;
        changed = true;
      }
    }
    if (!changed) continue;
    const { error } = await supabase
      .from("player_history")
      .update({ event_text: text })
      .eq("id", row.id);
    if (error) throw error;
    console.log(`  history: ${row.event_text} → ${text}`);
  }

  const allTimeAfter = await getAllTimeTop3(supabase);
  const streaksAfter = await getActiveStreaks(supabase);
  console.log("\n=== AFTER REPAIR ===");
  console.log("  all-time:", allTimeAfter.length ? allTimeAfter : "(empty)");
  console.log("  streaks:", streaksAfter.length ? streaksAfter : "(empty)");
}

main().catch((err) => {
  console.error("[audit-b3s-league] failed:", err);
  process.exit(1);
});
