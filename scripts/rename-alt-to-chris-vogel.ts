#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";

const NEW_NAME = "chris vogel";
const NEW_SLUG = "chris-vogel";
const OLD_SLUG = "alt";

async function main() {
  const supabase = createAdminClient();

  const { data: alt, error: altErr } = await supabase
    .from("players")
    .select("id, name, slug, status, races, wins")
    .eq("slug", OLD_SLUG)
    .maybeSingle();

  if (altErr) throw altErr;
  if (!alt) {
    console.log(`[rename-alt] no player with slug "${OLD_SLUG}" — already renamed?`);
    return;
  }

  const { data: slugTaken } = await supabase
    .from("players")
    .select("id, name, slug")
    .eq("slug", NEW_SLUG)
    .maybeSingle();

  if (slugTaken && slugTaken.id !== alt.id) {
    throw new Error(
      `slug "${NEW_SLUG}" already used by ${slugTaken.name} (${slugTaken.id})`
    );
  }

  const oldName = alt.name;
  const playerId = alt.id;

  const { error: updateErr } = await supabase
    .from("players")
    .update({
      name: NEW_NAME,
      slug: NEW_SLUG,
      gender: "M",
      updated_at: new Date().toISOString(),
    })
    .eq("id", playerId);

  if (updateErr) throw updateErr;

  const nameVariants = [
    oldName,
    oldName.toUpperCase(),
    oldName.toLowerCase(),
    "Alt",
    "ALT",
    "alt",
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  for (const from of nameVariants) {
    const { data: tickerRows } = await supabase
      .from("race_ticker_events")
      .select("id, message")
      .eq("player_id", playerId)
      .ilike("message", `%${from}%`);

    for (const row of tickerRows ?? []) {
      const message = row.message.split(from).join(NEW_NAME);
      if (message === row.message) continue;
      const { error } = await supabase
        .from("race_ticker_events")
        .update({ message })
        .eq("id", row.id);
      if (error) throw error;
    }

    const { data: historyRows } = await supabase
      .from("player_history")
      .select("id, event_text")
      .eq("player_id", playerId)
      .ilike("event_text", `%${from}%`);

    for (const row of historyRows ?? []) {
      const event_text = row.event_text.split(from).join(NEW_NAME);
      if (event_text === row.event_text) continue;
      const { error } = await supabase
        .from("player_history")
        .update({ event_text })
        .eq("id", row.id);
      if (error) throw error;
    }
  }

  const { data: verify } = await supabase
    .from("players")
    .select("id, name, slug, status, races, wins")
    .eq("id", playerId)
    .single();

  console.log("[rename-alt] done:", verify);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
