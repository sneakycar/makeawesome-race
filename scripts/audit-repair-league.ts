#!/usr/bin/env tsx
/**
 * Audit league history + stats and repair from finalized race results.
 * Expects exactly 2 finalized races and 1 active race (currently race 3).
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import { ordinal } from "../lib/format";
import { roundRaceScore } from "../lib/score";
import type { Player } from "../lib/types";

const RESULT_EVENT_TYPES = new Set(["won", "finished", "eliminated"]);

type RaceRow = {
  id: string;
  race_number: number;
  day_number: number;
  status: string;
};

type EntryRow = {
  id: string;
  player_id: string;
  lane: number;
  current_rank: number;
  final_rank: number | null;
  race_score: number;
  peak_race_score: number | null;
  is_injured: boolean;
  player: Player;
};

async function main() {
  const supabase = createAdminClient();
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[audit-repair-league] starting${dryRun ? " (dry run)" : ""}...`);

  const { data: races, error: racesErr } = await supabase
    .from("races")
    .select("id, race_number, day_number, status")
    .order("race_number", { ascending: true });

  if (racesErr) throw racesErr;
  if (!races?.length) throw new Error("No races found");

  const finalized = races.filter((r) => r.status === "finalized");
  const active = races.filter((r) => r.status === "active");

  console.log("\n=== RACE STRUCTURE ===");
  console.log(`total=${races.length} finalized=${finalized.length} active=${active.length}`);
  for (const race of races) {
    console.log(`  race ${race.race_number}: ${race.status}`);
  }

  if (finalized.length !== 2) {
    throw new Error(`Expected 2 finalized races, found ${finalized.length}`);
  }
  if (active.length !== 1 || active[0]!.race_number !== 3) {
    throw new Error(`Expected active race 3, found ${active.map((r) => r.race_number).join(", ") || "none"}`);
  }

  const { data: allHistory, error: histErr } = await supabase
    .from("player_history")
    .select("*")
    .order("created_at", { ascending: true });
  if (histErr) throw histErr;

  const ancillary = (allHistory ?? []).filter((row) => !RESULT_EVENT_TYPES.has(row.event_type));
  const finalizedRaceIds = new Set(finalized.map((r) => r.id));

  // Drop spurious returns for racers still in holding.
  const { data: holdingRows } = await supabase
    .from("players")
    .select("id, name, status")
    .eq("status", "holding");
  const holdingIds = new Set((holdingRows ?? []).map((p) => p.id));

  const cleanedAncillary = ancillary.filter((row) => {
    if (row.event_type !== "returned") return true;
    if (holdingIds.has(row.player_id)) {
      console.log(`  drop spurious return for holding racer (${row.event_text})`);
      return false;
    }
    return true;
  });

  // Dedupe fight rows per race + pair (case-insensitive).
  const fightSeen = new Set<string>();
  const dedupedAncillary = cleanedAncillary.filter((row) => {
    if (row.event_type !== "fight") return true;
    const key = `${row.race_id ?? "none"}:${row.event_text.trim().toLowerCase()}`;
    if (fightSeen.has(key)) return false;
    fightSeen.add(key);
    return true;
  });

  const rebuiltResults: Array<{
    player_id: string;
    race_id: string;
    day_number: number;
    event_type: string;
    event_text: string;
    finish_rank: number;
    progress: number;
  }> = [];

  for (const race of finalized as RaceRow[]) {
    const { data: entries, error: entErr } = await supabase
      .from("race_entries")
      .select(
        "id, player_id, lane, current_rank, final_rank, race_score, peak_race_score, is_injured, player:players!race_entries_player_id_fkey(*)"
      )
      .eq("race_id", race.id)
      .order("final_rank", { ascending: true, nullsFirst: false });

    if (entErr) throw entErr;
    if (!entries?.length) throw new Error(`Race ${race.race_number} has no entries`);

    const ranked = entries as unknown as EntryRow[];
    const healthyCount = ranked.filter((e) => !e.is_injured).length;

    for (const entry of ranked) {
      const player = entry.player;
      const finish = entry.final_rank ?? entry.current_rank;
      const score = roundRaceScore(Number(entry.race_score));
      const isWinner = !entry.is_injured && finish === 1;
      const isLast = !entry.is_injured && finish === healthyCount && healthyCount > 0;

      if (isWinner) {
        rebuiltResults.push({
          player_id: player.id,
          race_id: race.id,
          day_number: race.day_number,
          event_type: "won",
          event_text: `WON RACE ${race.race_number}`,
          finish_rank: finish,
          progress: Math.round(score),
        });
      } else if (isLast) {
        rebuiltResults.push({
          player_id: player.id,
          race_id: race.id,
          day_number: race.day_number,
          event_type: "eliminated",
          event_text: "ELIMINATED TO HOLDING",
          finish_rank: finish,
          progress: Math.round(score),
        });
      } else if (!entry.is_injured) {
        rebuiltResults.push({
          player_id: player.id,
          race_id: race.id,
          day_number: race.day_number,
          event_type: "finished",
          event_text: `FINISHED ${ordinal(finish)}`,
          finish_rank: finish,
          progress: Math.round(score),
        });
      }
    }

    console.log(`\nRace ${race.race_number} rebuilt ${rebuiltResults.filter((r) => r.race_id === race.id).length} result rows`);
  }

  const { data: players, error: playerErr } = await supabase.from("players").select("*");
  if (playerErr) throw playerErr;

  const { data: activeEntries } = await supabase
    .from("race_entries")
    .select("player_id")
    .eq("race_id", active[0]!.id);
  const activeRaceIds = new Set((activeEntries ?? []).map((e) => e.player_id));

  const playerUpdates: Array<{ id: string; patch: Partial<Player> }> = [];

  for (const player of (players ?? []) as Player[]) {
    const { data: finishedEntries } = await supabase
      .from("race_entries")
      .select("final_rank, race_score, peak_race_score, race:races!inner(status, race_number)")
      .eq("player_id", player.id)
      .eq("race.status", "finalized");

    const entries = finishedEntries ?? [];
    const racesStarted = entries.length;
    const wins = entries.filter((e) => e.final_rank === 1).length;
    const finishes = entries
      .map((e) => e.final_rank as number)
      .filter((r) => r != null);
    const bestFinish = finishes.length ? Math.min(...finishes) : null;
    const worstFinish = finishes.length ? Math.max(...finishes) : null;

    let highestRaceScore = 0;
    let highestCareerScore = Number(player.highest_career_score ?? 0);

    const { data: allEntries } = await supabase
      .from("race_entries")
      .select("race_score, peak_race_score")
      .eq("player_id", player.id);

    for (const entry of allEntries ?? []) {
      const peak = Math.max(
        Number(entry.peak_race_score ?? 0),
        roundRaceScore(Number(entry.race_score))
      );
      highestRaceScore = Math.max(highestRaceScore, peak);
      highestCareerScore = Math.max(highestCareerScore, peak);
    }

    const eliminations = rebuiltResults.filter(
      (row) => row.player_id === player.id && row.event_type === "eliminated"
    ).length;

    const validReturns = dedupedAncillary.filter(
      (row) => row.player_id === player.id && row.event_type === "returned"
    ).length;

    const raceResults = finalized
      .map((race) => {
        const row = rebuiltResults.find(
          (r) => r.race_id === race.id && r.player_id === player.id
        );
        if (!row) return null;
        return { raceNumber: race.race_number, won: row.event_type === "won" };
      })
      .filter(Boolean) as Array<{ raceNumber: number; won: boolean }>;

    raceResults.sort((a, b) => a.raceNumber - b.raceNumber);

    let currentStreakType: Player["current_streak_type"] = "none";
    let currentStreakCount = 0;
    let longestWinStreak = 0;
    let winStreak = 0;

    for (const result of raceResults) {
      const eliminated = rebuiltResults.some(
        (row) =>
          row.player_id === player.id &&
          row.event_type === "eliminated" &&
          finalized.find((race) => race.id === row.race_id)?.race_number === result.raceNumber
      );

      if (result.won) {
        winStreak += 1;
        longestWinStreak = Math.max(longestWinStreak, winStreak);
        currentStreakType = "win";
        currentStreakCount = winStreak;
      } else if (eliminated) {
        winStreak = 0;
        currentStreakType = "lose";
        currentStreakCount = 1;
      } else {
        winStreak = 0;
        currentStreakType = "none";
        currentStreakCount = 0;
      }
    }

    let status: Player["status"] = player.status;
    if (holdingIds.has(player.id)) {
      status = "holding";
    } else if (activeRaceIds.has(player.id)) {
      status = "active";
    }

    playerUpdates.push({
      id: player.id,
      patch: {
        races: racesStarted,
        wins,
        eliminations,
        returns: validReturns,
        best_finish: bestFinish,
        worst_finish: worstFinish,
        highest_race_score: highestRaceScore,
        highest_career_score: highestCareerScore,
        current_streak_type: currentStreakType,
        current_streak_count: currentStreakCount,
        longest_win_streak: longestWinStreak,
        status,
      },
    });
  }

  console.log("\n=== PLAYER STAT FIXES ===");
  for (const { id, patch } of playerUpdates) {
    const player = (players as Player[]).find((p) => p.id === id);
    if (!player) continue;
    const changes: string[] = [];
    for (const [key, val] of Object.entries(patch)) {
      const before = (player as Record<string, unknown>)[key];
      if (before !== val) changes.push(`${key}: ${before} -> ${val}`);
    }
    if (changes.length) {
      console.log(`  ${player.name}: ${changes.join("; ")}`);
    }
  }

  console.log("\n=== HISTORY REWRITE ===");
  console.log(`  removing ${(allHistory ?? []).filter((r) => RESULT_EVENT_TYPES.has(r.event_type)).length} result rows`);
  console.log(`  keeping ${dedupedAncillary.length} ancillary rows`);
  console.log(`  inserting ${rebuiltResults.length} rebuilt result rows`);

  if (dryRun) {
    console.log("\n[dry run] no writes performed");
    return;
  }

  const { error: delErr } = await supabase
    .from("player_history")
    .delete()
    .in("event_type", [...RESULT_EVENT_TYPES]);
  if (delErr) throw delErr;

  const inserts = [
    ...dedupedAncillary.map((row) => ({
      player_id: row.player_id,
      race_id: row.race_id,
      day_number: row.day_number,
      event_type: row.event_type,
      event_text: row.event_text,
      finish_rank: row.finish_rank,
      progress: row.progress != null ? Math.round(Number(row.progress)) : null,
      created_at: row.created_at,
    })),
    ...rebuiltResults.map((row) => ({
      player_id: row.player_id,
      race_id: row.race_id,
      day_number: row.day_number,
      event_type: row.event_type,
      event_text: row.event_text,
      finish_rank: row.finish_rank,
      progress: row.progress != null ? Math.round(Number(row.progress)) : null,
    })),
  ];

  if (inserts.length) {
    const { error: insErr } = await supabase.from("player_history").insert(inserts);
    if (insErr) throw insErr;
  }

  for (const { id, patch } of playerUpdates) {
    const { error } = await supabase
      .from("players")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  const { data: gs } = await supabase.from("game_state").select("*").eq("id", 1).single();
  if (gs && (gs.current_race_number !== 3 || gs.current_day !== 3)) {
    await supabase
      .from("game_state")
      .update({
        current_race_number: 3,
        current_day: 3,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    console.log("\nFixed game_state to current race 3 / day 3");
  }

  console.log("\n[audit-repair-league] complete");
}

main().catch((err) => {
  console.error("[audit-repair-league] failed:", err);
  process.exit(1);
});
