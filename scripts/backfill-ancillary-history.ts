#!/usr/bin/env tsx
/** Backfill support, fight, bad money, and return rows in player_history from source tables. */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import { parseFightTickerMessage } from "../lib/race-fight-tick";
import { getBadMoneyFlavorLine } from "../lib/bad-money";

async function main() {
  const supabase = createAdminClient();
  const inserts: Array<Record<string, unknown>> = [];

  const { data: races } = await supabase
    .from("races")
    .select("id, race_number, day_number, status")
    .order("race_number", { ascending: true });
  const raceById = new Map((races ?? []).map((r) => [r.id, r]));

  const { data: existing } = await supabase
    .from("player_history")
    .select("event_type, race_id, player_id, event_text");
  const hasEvent = (type: string, raceId: string | null, playerId: string, text?: string) =>
    (existing ?? []).some(
      (row) =>
        row.event_type === type &&
        row.race_id === raceId &&
        row.player_id === playerId &&
        (text == null || row.event_text === text)
    );

  const { data: supports } = await supabase
    .from("race_supports")
    .select("race_id, player_id");
  const supportCounts = new Map<string, number>();
  for (const row of supports ?? []) {
    const key = `${row.race_id}:${row.player_id}`;
    supportCounts.set(key, (supportCounts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of supportCounts) {
    const [raceId, playerId] = key.split(":");
    const race = raceById.get(raceId);
    if (!race || race.status === "active") continue;
    if (hasEvent("support", raceId, playerId)) continue;
    inserts.push({
      player_id: playerId,
      race_id: raceId,
      day_number: race.day_number,
      event_type: "support",
      event_text: `Received ${count} fan vote${count === 1 ? "" : "s"}`,
      finish_rank: null,
      progress: null,
    });
  }

  const { data: bets } = await supabase.from("race_bets").select("race_id, player_id");
  for (const bet of bets ?? []) {
    const race = raceById.get(bet.race_id);
    if (!race || race.status === "active") continue;
    const text = getBadMoneyFlavorLine(`${bet.race_id}:${bet.player_id}`);
    if (hasEvent("bad_money", bet.race_id, bet.player_id, text)) continue;
    inserts.push({
      player_id: bet.player_id,
      race_id: bet.race_id,
      day_number: race.day_number,
      event_type: "bad_money",
      event_text: text,
      finish_rank: null,
      progress: null,
    });
  }

  const { data: fightRows } = await supabase
    .from("race_ticker_events")
    .select("race_id, message")
    .eq("event_type", "fight");
  const fightSeen = new Set<string>();
  for (const row of fightRows ?? []) {
    const race = raceById.get(row.race_id);
    if (!race || race.status === "active") continue;
    const parsed = parseFightTickerMessage(row.message ?? "");
    if (!parsed) continue;
    const key = `${row.race_id}:${parsed.a.toLowerCase()}:${parsed.b.toLowerCase()}`;
    if (fightSeen.has(key)) continue;
    fightSeen.add(key);

    const text = `${parsed.a} vs ${parsed.b}`;
    const { data: playerA } = await supabase
      .from("players")
      .select("id")
      .ilike("name", parsed.a)
      .maybeSingle();
    if (!playerA || hasEvent("fight", row.race_id, playerA.id, text)) continue;

    inserts.push({
      player_id: playerA.id,
      race_id: row.race_id,
      day_number: race.day_number,
      event_type: "fight",
      event_text: text,
      finish_rank: null,
      progress: null,
    });
  }

  // UNCLE returned from holding for race 3.
  const { data: race3 } = await supabase
    .from("races")
    .select("id, day_number")
    .eq("race_number", 3)
    .single();
  const { data: uncle } = await supabase.from("players").select("id").eq("name", "UNCLE").single();
  if (race3 && uncle && !hasEvent("returned", null, uncle.id)) {
    inserts.push({
      player_id: uncle.id,
      race_id: null,
      day_number: race3.day_number,
      event_type: "returned",
      event_text: "RETURNED FROM HOLDING",
      finish_rank: null,
      progress: null,
    });
  }

  // CHRISMAN growth from race 2 support finalize (known from prior session).
  const { data: race2 } = await supabase.from("races").select("id, day_number").eq("race_number", 2).single();
  const { data: chrisman } = await supabase.from("players").select("id").eq("name", "CHRISMAN").single();
  if (race2 && chrisman) {
    for (const text of ["NERVE +1", "CHAOS +1"]) {
      if (hasEvent("growth", race2.id, chrisman.id, text)) continue;
      inserts.push({
        player_id: chrisman.id,
        race_id: race2.id,
        day_number: race2.day_number,
        event_type: "growth",
        event_text: text,
        finish_rank: null,
        progress: null,
      });
    }
  }

  const { data: unclePlayer } = await supabase.from("players").select("id").eq("name", "UNCLE").single();
  const { data: race1 } = await supabase.from("races").select("id, day_number").eq("race_number", 1).single();
  if (race1 && unclePlayer && !hasEvent("growth", race1.id, unclePlayer.id, "GRIT +1")) {
    inserts.push({
      player_id: unclePlayer.id,
      race_id: race1.id,
      day_number: race1.day_number,
      event_type: "growth",
      event_text: "GRIT +1",
      finish_rank: null,
      progress: null,
    });
  }

  console.log(`[backfill-ancillary-history] inserting ${inserts.length} rows`);
  if (inserts.length) {
    const { error } = await supabase.from("player_history").insert(inserts);
    if (error) throw error;
  }

  if (uncle) {
    await supabase.from("players").update({ returns: 1, updated_at: new Date().toISOString() }).eq("id", uncle.id);
  }

  console.log("[backfill-ancillary-history] complete");
}

main().catch((err) => {
  console.error("[backfill-ancillary-history] failed:", err);
  process.exit(1);
});
