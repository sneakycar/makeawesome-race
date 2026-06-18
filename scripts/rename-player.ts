#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { slugify } from "../lib/format";
import { createAdminClient } from "../lib/supabase/admin";

const OLD_SLUG = "woketruther";
const NEW_NAME = "corsakti";

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
    if (!before.toLowerCase().includes(oldName.toLowerCase())) continue;
    const re = new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const after = before.replace(re, newName);
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
  const newSlug = slugify(NEW_NAME);

  const { data: player, error: findErr } = await supabase
    .from("players")
    .select("id, name, slug, status")
    .eq("slug", OLD_SLUG)
    .maybeSingle();

  if (findErr) throw findErr;
  if (!player) {
    console.log(`[rename-player] no player with slug "${OLD_SLUG}"`);
    return;
  }

  const { data: slugTaken } = await supabase
    .from("players")
    .select("id, name")
    .eq("slug", newSlug)
    .maybeSingle();

  if (slugTaken && slugTaken.id !== player.id) {
    throw new Error(`slug "${newSlug}" already used by ${slugTaken.name}`);
  }

  const oldName = player.name;
  const { error: updateErr } = await supabase
    .from("players")
    .update({
      name: NEW_NAME,
      slug: newSlug,
      updated_at: new Date().toISOString(),
    })
    .eq("id", player.id);
  if (updateErr) throw updateErr;

  for (const from of [oldName, "woKetRuTheR", "woketruther"]) {
    await patchNameInRows(supabase, "race_ticker_events", player.id, from, NEW_NAME);
    await patchNameInRows(supabase, "player_history", player.id, from, NEW_NAME);
  }

  const { data: verify } = await supabase
    .from("players")
    .select("name, slug, status, archetype")
    .eq("id", player.id)
    .single();

  console.log("[rename-player] done:", verify);
}

main().catch((err) => {
  console.error("[rename-player] failed:", err);
  process.exit(1);
});
