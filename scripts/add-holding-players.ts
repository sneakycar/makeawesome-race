#!/usr/bin/env tsx
/**
 * Add approved names to holding with rolled archetypes/stats.
 * Seed prefix holding-reserve-* protects them from cleanup-seed-holding.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { slugify } from "../lib/format";
import type { PlayerIdentity } from "../lib/identity";
import { buildPlayerInsert } from "../lib/race-logic";
import { createAdminClient } from "../lib/supabase/admin";

const HOLDING_NAMES = [
  "inge",
  "fwis",
  "pierratt",
  "francisco",
  "skurk",
  "omar",
  "noktulo",
  "jacob",
  "skaw",
  "matt_kicks",
  "speedball",
  "jack",
  "reemer",
] as const;

const HOLDING_IDENTITY_OVERRIDES: Partial<Record<(typeof HOLDING_NAMES)[number], PlayerIdentity>> = {
  omar: {
    archetype: "IRON LOSER",
    traits: ["SAD", "UNLUCKY", "USELESS"],
    signature_stat: "drag",
  },
};

async function main() {
  const supabase = createAdminClient();

  const { data: gameState, error: gsErr } = await supabase
    .from("game_state")
    .select("current_day")
    .eq("id", 1)
    .maybeSingle();
  if (gsErr) throw gsErr;

  const createdDay = gameState?.current_day ?? 1;
  const added: string[] = [];
  const skipped: string[] = [];

  for (const name of HOLDING_NAMES) {
    const slug = slugify(name);
    const seed = `holding-reserve-${slug}`;

    const { data: existing, error: findErr } = await supabase
      .from("players")
      .select("id, name, slug, status, archetype")
      .eq("slug", slug)
      .maybeSingle();
    if (findErr) throw findErr;

    if (existing) {
      if (existing.status === "holding") {
        skipped.push(`${name} (already holding, ${existing.archetype})`);
        continue;
      }
      if (existing.status === "active" || existing.status === "injured") {
        skipped.push(`${name} (currently ${existing.status})`);
        continue;
      }

      const identity = HOLDING_IDENTITY_OVERRIDES[name];
    const insert = buildPlayerInsert(name, slug, "holding", createdDay, seed, identity);
      const { data: updated, error: updateErr } = await supabase
        .from("players")
        .update({
          ...insert,
          status: "holding",
          races: 0,
          wins: 0,
          eliminations: 0,
          returns: 0,
          holding_days: 0,
          total_holding_days: 0,
          rookie_until_day: null,
          comeback_until_day: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("name, slug, status, archetype, traits, signature_stat")
        .single();
      if (updateErr) throw updateErr;
      added.push(`${updated!.name} → ${updated!.archetype} (reactivated)`);
      continue;
    }

    const identity = HOLDING_IDENTITY_OVERRIDES[name];
    const insert = buildPlayerInsert(name, slug, "holding", createdDay, seed, identity);
    const { data: inserted, error: insertErr } = await supabase
      .from("players")
      .insert(insert)
      .select("name, slug, status, archetype, traits, signature_stat")
      .single();
    if (insertErr) throw insertErr;
    added.push(
      `${inserted!.name} → ${inserted!.archetype} / ${inserted!.traits.join(", ")} / ${inserted!.signature_stat}`
    );
  }

  const { data: holding, error: holdErr } = await supabase
    .from("players")
    .select("name, archetype, races")
    .eq("status", "holding")
    .order("name");
  if (holdErr) throw holdErr;

  console.log("[add-holding-players] added:");
  for (const line of added) console.log(`  + ${line}`);
  if (skipped.length) {
    console.log("[add-holding-players] skipped:");
    for (const line of skipped) console.log(`  - ${line}`);
  }
  console.log("[add-holding-players] holding pool:");
  for (const p of holding ?? []) {
    console.log(`  ${p.name} (${p.archetype}, races=${p.races})`);
  }
}

main().catch((err) => {
  console.error("[add-holding-players] failed:", err);
  process.exit(1);
});
