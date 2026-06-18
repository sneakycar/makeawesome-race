#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { slugify } from "../lib/format";
import { B3S_SEED_ACTIVE_NAMES } from "../lib/name-generator";
import { createAdminClient } from "../lib/supabase/admin";

const RENAME_MAP: Record<string, string> = {
  "1": "gerald",
  "2": "rob",
  "3": "sam",
  "4": "danz",
  "5": "emily",
  "6": "tacosaurus",
  "7": "daven3",
  "8": "kara",
};

async function patchNameInRows(
  supabase: ReturnType<typeof createAdminClient>,
  table: "race_ticker_events" | "player_history",
  playerId: string,
  oldName: string,
  newName: string
) {
  const textCol = table === "race_ticker_events" ? "message" : "event_text";
  const { data: rows, error } = await supabase
    .from(table)
    .select(`id, ${textCol}`)
    .eq("player_id", playerId);

  if (error) throw error;

  for (const row of rows ?? []) {
    const before = row[textCol as keyof typeof row] as string;
    if (!before.includes(oldName)) continue;
    const after = before.split(oldName).join(newName);
    if (after === before) continue;
    const { error: updateErr } = await supabase
      .from(table)
      .update({ [textCol]: after })
      .eq("id", row.id);
    if (updateErr) throw updateErr;
  }
}

async function main() {
  const supabase = createAdminClient();

  for (const [oldSlug, newName] of Object.entries(RENAME_MAP)) {
    const expectedOldName = B3S_SEED_ACTIVE_NAMES[Number(oldSlug) - 1];
    const newSlug = slugify(newName);

    const { data: player, error: findErr } = await supabase
      .from("players")
      .select("id, name, slug, status")
      .eq("slug", oldSlug)
      .eq("status", "active")
      .maybeSingle();

    if (findErr) throw findErr;
    if (!player) {
      console.warn(`[rename-b3s] skip slug "${oldSlug}" — not found`);
      continue;
    }

    const { data: slugTaken } = await supabase
      .from("players")
      .select("id, name")
      .eq("slug", newSlug)
      .maybeSingle();

    if (slugTaken && slugTaken.id !== player.id) {
      throw new Error(`slug "${newSlug}" taken by ${slugTaken.name}`);
    }

    const oldName = player.name;
    const { error: updateErr } = await supabase
      .from("players")
      .update({
        name: newName,
        slug: newSlug,
        updated_at: new Date().toISOString(),
      })
      .eq("id", player.id);
    if (updateErr) throw updateErr;

    for (const from of [oldName, expectedOldName].filter(
      (v, i, a) => v && a.indexOf(v) === i
    )) {
      await patchNameInRows(supabase, "race_ticker_events", player.id, from, newName);
      await patchNameInRows(supabase, "player_history", player.id, from, newName);
    }

    console.log(`[rename-b3s] ${oldSlug} → ${newName} (${newSlug})`);
  }

  const { data: roster } = await supabase
    .from("players")
    .select("name, slug, archetype")
    .eq("status", "active")
    .order("name", { ascending: true });

  console.log("[rename-b3s] active roster:", roster);
}

main().catch((err) => {
  console.error("[rename-b3s] failed:", err);
  process.exit(1);
});
