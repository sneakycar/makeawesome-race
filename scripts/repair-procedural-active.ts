#!/usr/bin/env tsx
/**
 * Swap any active racer with a procedural seed onto holding and pull a holding reserve in.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { isApprovedLeaguePlayerSeed } from "../lib/league-roster";
import { chooseReplacement } from "../lib/race-logic";
import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const supabase = createAdminClient();

  const { data: race, error: raceErr } = await supabase
    .from("races")
    .select("id, race_number, day_number, status")
    .eq("status", "active")
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (raceErr) throw raceErr;
  if (!race) {
    console.log("[repair-procedural-active] no active race");
    return;
  }

  const { data: actives, error: activeErr } = await supabase
    .from("players")
    .select("id, name, slug, seed, status")
    .eq("status", "active");
  if (activeErr) throw activeErr;

  const procedural = (actives ?? []).filter((p) => !isApprovedLeaguePlayerSeed(p.seed));
  if (!procedural.length) {
    console.log("[repair-procedural-active] no procedural actives — OK");
    return;
  }

  const { data: entries, error: entErr } = await supabase
    .from("race_entries")
    .select("id, lane, player_id")
    .eq("race_id", race.id);
  if (entErr) throw entErr;

  const currentIds = (entries ?? []).map((e) => e.player_id);
  const now = new Date().toISOString();

  for (const leaked of procedural) {
    const entry = entries?.find((e) => e.player_id === leaked.id);
    const replacement = await chooseReplacement(supabase, race.day_number, {
      excludePlayerIds: currentIds.filter((id) => id !== leaked.id),
    });

    if (entry) {
      const { error: entryUpdateErr } = await supabase
        .from("race_entries")
        .update({ player_id: replacement.id, updated_at: now })
        .eq("id", entry.id);
      if (entryUpdateErr) throw entryUpdateErr;

      const idx = currentIds.indexOf(leaked.id);
      if (idx >= 0) currentIds[idx] = replacement.id;
      else currentIds.push(replacement.id);

      console.log(
        `[repair-procedural-active] L${entry.lane}: ${leaked.name} → ${replacement.name}`
      );
    } else {
      console.log(
        `[repair-procedural-active] ${leaked.name} not in race ${race.race_number} entries`
      );
    }

    const { error: retireErr } = await supabase
      .from("players")
      .update({ status: "retired", updated_at: now })
      .eq("id", leaked.id);
    if (retireErr) throw retireErr;

    console.log(`[repair-procedural-active] retired procedural racer ${leaked.name}`);
  }

  const { data: after } = await supabase
    .from("race_entries")
    .select("lane, player:players(name, seed, status)")
    .eq("race_id", race.id)
    .order("lane");
  console.log("[repair-procedural-active] race roster:");
  for (const row of after ?? []) {
    const p = Array.isArray(row.player) ? row.player[0] : row.player;
    console.log(`  L${row.lane} ${p?.name} (${p?.seed})`);
  }
}

main().catch((err) => {
  console.error("[repair-procedural-active] failed:", err);
  process.exit(1);
});
