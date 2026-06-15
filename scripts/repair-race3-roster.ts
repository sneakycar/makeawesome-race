#!/usr/bin/env tsx
/**
 * One-off: LACIE was eliminated from race 2 but immediately returned as her own
 * replacement. Move her to holding and swap in a fresh racer for race 3.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import { chooseReplacement } from "../lib/race-logic";

const LACIE_ID = "6a25a574-5cfa-4ad0-b181-fc484ea2d90a";
const RACE_3_ID = "3e1921d4-75bf-4a7c-a721-3f1f35a98828";

async function main() {
  const supabase = createAdminClient();

  const { data: race3, error: raceErr } = await supabase
    .from("races")
    .select("id, race_number, day_number, status")
    .eq("id", RACE_3_ID)
    .single();
  if (raceErr || !race3) throw raceErr ?? new Error("race 3 missing");
  if (race3.status !== "active") throw new Error("race 3 is not active");

  const { data: entries, error: entErr } = await supabase
    .from("race_entries")
    .select("id, lane, player_id")
    .eq("race_id", RACE_3_ID);
  if (entErr) throw entErr;

  const lacieEntry = entries?.find((e) => e.player_id === LACIE_ID);
  if (!lacieEntry) throw new Error("LACIE not in race 3");

  const currentIds = (entries ?? []).map((e) => e.player_id);
  const replacement = await chooseReplacement(supabase, race3.day_number, {
    excludePlayerIds: currentIds,
  });

  if (currentIds.includes(replacement.id)) {
    throw new Error(`Replacement ${replacement.name} is already on the race 3 roster`);
  }

  const { data: lacie, error: lacieErr } = await supabase
    .from("players")
    .select("*")
    .eq("id", LACIE_ID)
    .single();
  if (lacieErr || !lacie) throw lacieErr ?? new Error("LACIE missing");

  const now = new Date().toISOString();

  const { error: lacieUpdateErr } = await supabase
    .from("players")
    .update({
      status: "holding",
      holding_days: Math.max(1, lacie.holding_days),
      updated_at: now,
    })
    .eq("id", LACIE_ID);
  if (lacieUpdateErr) throw lacieUpdateErr;

  const { error: entryUpdateErr } = await supabase
    .from("race_entries")
    .update({
      player_id: replacement.id,
      updated_at: now,
    })
    .eq("id", lacieEntry.id);
  if (entryUpdateErr) throw entryUpdateErr;

  console.log(
    `[repair-race3-roster] Replaced LACIE (L${lacieEntry.lane}) with ${replacement.name} (${replacement.slug})`
  );

  const { data: after } = await supabase
    .from("race_entries")
    .select("lane, player:players(name, status)")
    .eq("race_id", RACE_3_ID)
    .order("lane");
  for (const row of after ?? []) {
    const p = Array.isArray(row.player) ? row.player[0] : row.player;
    console.log(`  L${row.lane} ${p?.name} (${p?.status})`);
  }
}

main().catch((err) => {
  console.error("[repair-race3-roster] failed:", err);
  process.exit(1);
});
