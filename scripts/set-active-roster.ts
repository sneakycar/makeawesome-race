#!/usr/bin/env tsx
/**
 * Replace the active race roster with a fixed list of eight names.
 * Creates missing players, demotes outgoing actives to holding, preserves per-lane race state.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { slugify } from "../lib/format";
import { buildPlayerInsert } from "../lib/race-logic";
import { resolvePlayerGender } from "../lib/player-gender";
import { createAdminClient } from "../lib/supabase/admin";
import type { Player } from "../lib/types";

/** Display name + slug for the eight active racers (lane order). */
const TARGET_ROSTER: readonly { name: string; slug: string }[] = [
  { name: "uncle", slug: "uncle" },
  { name: "chrisman", slug: "chrisman" },
  { name: "A.K. pal", slug: "a-k-pal" },
  { name: "bhole", slug: "bhole" },
  { name: "noah", slug: "noah" },
  { name: "chris vogel", slug: "chris-vogel" },
  { name: "walhof", slug: "walhof" },
  { name: "ace", slug: "ace" },
];

async function ensurePlayer(
  supabase: ReturnType<typeof createAdminClient>,
  name: string,
  slug: string,
  createdDay: number
): Promise<Player> {
  const { data: existing, error: findErr } = await supabase
    .from("players")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing as Player;

  const seed = `holding-reserve-${slug}`;
  const insert = buildPlayerInsert(
    name,
    slug,
    "holding",
    createdDay,
    seed,
    undefined,
    resolvePlayerGender(slug, seed)
  );
  const { data: inserted, error: insertErr } = await supabase
    .from("players")
    .insert(insert)
    .select("*")
    .single();
  if (insertErr) throw insertErr;
  console.log(`[set-active-roster] created ${name} (${slug})`);
  return inserted as Player;
}

async function main() {
  const rosterArg = process.argv.find((a) => a.startsWith("--names="));
  const roster = rosterArg
    ? rosterArg
        .slice("--names=".length)
        .split(",")
        .map((name) => {
          const trimmed = name.trim();
          return { name: trimmed, slug: slugify(trimmed) };
        })
    : [...TARGET_ROSTER];

  if (roster.length !== 8) {
    throw new Error(`Expected 8 racers, got ${roster.length}`);
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: gameState, error: gsErr } = await supabase
    .from("game_state")
    .select("current_day")
    .eq("id", 1)
    .single();
  if (gsErr) throw gsErr;
  const createdDay = gameState?.current_day ?? 1;

  const { data: race, error: raceErr } = await supabase
    .from("races")
    .select("id, race_number, day_number, status")
    .eq("status", "active")
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (raceErr) throw raceErr;
  if (!race) throw new Error("No active race");

  const targetSlugs = new Set(roster.map((r) => r.slug));
  const targetPlayers: Player[] = [];
  for (const { name, slug } of roster) {
    targetPlayers.push(await ensurePlayer(supabase, name, slug, createdDay));
  }

  const { data: entries, error: entErr } = await supabase
    .from("race_entries")
    .select("id, lane, player_id, race_score, peak_race_score")
    .eq("race_id", race.id)
    .order("lane", { ascending: true });
  if (entErr) throw entErr;
  if ((entries ?? []).length !== 8) {
    throw new Error(`Expected 8 race entries, found ${entries?.length ?? 0}`);
  }

  const { data: outgoingActives, error: outErr } = await supabase
    .from("players")
    .select("id, name, slug, status")
    .eq("status", "active");
  if (outErr) throw outErr;

  const targetIds = new Set(targetPlayers.map((p) => p.id));

  for (const player of outgoingActives ?? []) {
    if (targetIds.has(player.id)) continue;
    const { error } = await supabase
      .from("players")
      .update({
        status: "holding",
        holding_days: 1,
        total_holding_days: 1,
        updated_at: now,
      })
      .eq("id", player.id);
    if (error) throw error;
    console.log(`[set-active-roster] ${player.name} → holding`);
  }

  for (let i = 0; i < 8; i++) {
    const player = targetPlayers[i]!;
    const entry = entries![i]!;
    const score = Number(entry.race_score ?? 0);
    const peak = Math.max(Number(entry.peak_race_score ?? 0), score);

    const { error: promoteErr } = await supabase
      .from("players")
      .update({
        status: "active",
        active_days: Math.max(1, player.active_days ?? 0),
        rookie_until_day: player.rookie_until_day ?? createdDay + 7,
        highest_race_score: Math.max(Number(player.highest_race_score ?? 0), peak),
        updated_at: now,
      })
      .eq("id", player.id);
    if (promoteErr) throw promoteErr;

    const { error: entryErr } = await supabase
      .from("race_entries")
      .update({ player_id: player.id, updated_at: now })
      .eq("id", entry.id);
    if (entryErr) throw entryErr;

    console.log(`[set-active-roster] L${entry.lane}: ${player.name}`);
  }

  const { data: after } = await supabase
    .from("race_entries")
    .select("lane, race_score, current_rank, player:players(name, slug, status)")
    .eq("race_id", race.id)
    .order("current_rank", { ascending: true });

  console.log(`[set-active-roster] race ${race.race_number} roster:`);
  for (const row of after ?? []) {
    const p = Array.isArray(row.player) ? row.player[0] : row.player;
    console.log(
      `  P${row.current_rank} L${row.lane} ${p?.name} (${p?.status}) — ${Number(row.race_score).toFixed(1)}`
    );
  }
}

main().catch((err) => {
  console.error("[set-active-roster] failed:", err);
  process.exit(1);
});
