#!/usr/bin/env tsx
/**
 * Audit scoring for a player/race — inspect DB state and replay sim for comparison.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import {
  TICKS_PER_RACE,
  calculatePercentComplete,
  getTickNumber,
} from "../lib/race-logic";
import { getRaceWeekTempo } from "../lib/race-tempo";
import {
  applyFanLiveBonusToSim,
  applySimTick,
  buildRaceSim,
} from "../lib/race-sim";
import { getRaceEffectiveNow } from "../lib/race-delay";
import type { Player, Race } from "../lib/types";

async function auditPlayer(slug: string) {
  const supabase = createAdminClient();

  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!player) {
    console.error(`Player not found: ${slug}`);
    process.exit(1);
  }

  console.log(`\n=== PLAYER: ${player.name} (${slug}) ===`);
  console.log({
    status: player.status,
    rating: player.rating,
    archetype: player.archetype,
    traits: player.traits,
    total_support_received: player.total_support_received,
    highest_race_score: player.highest_race_score,
  });

  const { data: entries } = await supabase
    .from("race_entries")
    .select("*, race:races(*)")
    .eq("player_id", player.id)
    .order("created_at", { ascending: true });

  for (const entry of entries ?? []) {
    const race = entry.race as Race;
    console.log(`\n--- Race ${race.race_number} (${race.status}) ---`);
    console.log({
      race_score: entry.race_score,
      progress: entry.progress,
      displayed_progress: entry.displayed_progress,
      fan_live_bonus: entry.fan_live_bonus,
      final_rank: entry.final_rank,
      current_rank: entry.current_rank,
      is_injured: entry.is_injured,
      injured_at_tick: entry.injured_at_tick,
      injury_name: entry.injury_name,
      injury_severity: entry.injury_severity,
      is_fighting: entry.is_fighting,
      fighting_at_tick: entry.fighting_at_tick,
      fight_end_tick: entry.fight_end_tick,
      fight_frozen_score: entry.fight_frozen_score,
      event_note: entry.event_note,
      peak_race_score: entry.peak_race_score,
      bad_money_count: entry.bad_money_count,
      last_delta: entry.last_delta,
      recent_deltas: entry.recent_deltas,
    });

    const { data: supports } = await supabase
      .from("race_supports")
      .select("live_score_granted, created_at")
      .eq("race_id", race.id)
      .eq("player_id", player.id);

    console.log(`Encouragement votes: ${supports?.length ?? 0}, live granted: ${(supports ?? []).reduce((s, r) => s + Number(r.live_score_granted), 0)}`);

    const { data: history } = await supabase
      .from("player_history")
      .select("event_type, event_text, progress, finish_rank, day_number")
      .eq("race_id", race.id)
      .eq("player_id", player.id)
      .order("created_at", { ascending: true });

    if (history?.length) {
      console.log("History:");
      for (const h of history) {
        console.log(`  [${h.event_type}] ${h.event_text}${h.progress != null ? ` (${h.progress} pts)` : ""}${h.finish_rank != null ? ` rank ${h.finish_rank}` : ""}`);
      }
    }

    const weekTempo = getRaceWeekTempo(race.id);
    console.log(`Week tempo: ${weekTempo.toFixed(3)} (expected winner ~${Math.round(155 * weekTempo)})`);

    if (race.status === "finalized" || race.status === "active") {
      const startedAt = new Date(race.started_at);
      const endsAt = new Date(race.ends_at);
      const effectiveNow =
        race.status === "finalized"
          ? endsAt
          : getRaceEffectiveNow(race, new Date());
      const tickNumber =
        race.status === "finalized"
          ? TICKS_PER_RACE - 1
          : getTickNumber(startedAt, endsAt, effectiveNow);
      const pct = calculatePercentComplete(startedAt, endsAt, effectiveNow);

      const { data: allEntries } = await supabase
        .from("race_entries")
        .select("*, player:players!race_entries_player_id_fkey(*)")
        .eq("race_id", race.id);

      const chaosUsed = new Map<string, boolean>();
      const sim = buildRaceSim(
        (allEntries ?? []).map((e) => ({
          player_id: e.player_id,
          player: e.player as Player,
          lane: e.lane,
          is_injured: Boolean(e.is_injured),
          injured_at_tick: e.injured_at_tick as number | null,
          is_fighting: Boolean(e.is_fighting),
          fighting_at_tick: e.fighting_at_tick as number | null,
          fight_end_tick: e.fight_end_tick as number | null,
          fight_frozen_score: e.fight_frozen_score as number | null,
          bad_money_count: e.bad_money_count,
        }))
      );

      for (let t = 0; t <= tickNumber; t++) {
        applySimTick(race, sim, t, startedAt, endsAt, chaosUsed, {
          allowNewStalls: t < tickNumber,
        });
      }

      applyFanLiveBonusToSim(
        sim,
        (allEntries ?? []).map((e) => ({
          player_id: e.player_id,
          fan_live_bonus: e.fan_live_bonus,
          is_injured: Boolean(e.is_injured),
          is_fighting: Boolean(e.is_fighting),
          fighting_at_tick: e.fighting_at_tick as number | null,
          fight_end_tick: e.fight_end_tick as number | null,
        })),
        tickNumber
      );

      const simEntry = sim.find((s) => s.player_id === player.id);
      console.log(`Sim replay at tick ${tickNumber} (${pct}%): score=${simEntry?.score}, DB=${entry.race_score}, delta=${Number(simEntry?.score) - Number(entry.race_score)}`);

      if (entry.is_injured && entry.injured_at_tick != null) {
        const preInjurySim = buildRaceSim(
          (allEntries ?? []).map((e) => ({
            player_id: e.player_id,
            player: e.player as Player,
            lane: e.lane,
            is_injured: e.player_id === player.id ? false : Boolean(e.is_injured),
            injured_at_tick: e.player_id === player.id ? null : (e.injured_at_tick as number | null),
            is_fighting: Boolean(e.is_fighting),
            fighting_at_tick: e.fighting_at_tick as number | null,
            fight_end_tick: e.fight_end_tick as number | null,
            fight_frozen_score: e.fight_frozen_score as number | null,
            bad_money_count: e.bad_money_count,
          }))
        );
        const cu = new Map<string, boolean>();
        for (let t = 0; t < TICKS_PER_RACE; t++) {
          applySimTick(race, preInjurySim, t, startedAt, endsAt, cu, { allowNewStalls: t < TICKS_PER_RACE - 1 });
        }
        const healthy = preInjurySim.find((s) => s.player_id === player.id);
        console.log(`Counterfactual (no injury): full-race score=${healthy?.score}`);
      }
    }
  }

  const { data: race1 } = await supabase.from("races").select("*").eq("race_number", 1).maybeSingle();
  if (race1) {
    const { data: r1Entries } = await supabase
      .from("race_entries")
      .select("race_score, final_rank, is_injured, injury_name, fan_live_bonus, player:players!race_entries_player_id_fkey(name, slug)")
      .eq("race_id", race1.id)
      .order("final_rank", { ascending: true });

    console.log("\n=== RACE 1 FINAL STANDINGS ===");
    for (const e of r1Entries ?? []) {
      const p = (Array.isArray(e.player) ? e.player[0] : e.player) as {
        name: string;
        slug: string;
      };
      console.log(
        `P${e.final_rank ?? "?"} ${p.name} (${p.slug}): ${e.race_score}${e.is_injured ? ` INJURED (${e.injury_name})` : ""}${Number(e.fan_live_bonus) > 0 ? ` +${e.fan_live_bonus} fan` : ""}`
      );
    }
  }
}

const slug = process.argv[2] ?? "uncle";
const fullRace = process.argv.includes("--full-race");

async function auditFullRace1() {
  const supabase = createAdminClient();
  const { data: race } = await supabase.from("races").select("*").eq("race_number", 1).single();
  if (!race) return;

  const { data: entries } = await supabase
    .from("race_entries")
    .select("*, player:players!race_entries_player_id_fkey(*)")
    .eq("race_id", race.id);

  const startedAt = new Date(race.started_at);
  const endsAt = new Date(race.ends_at);
  const chaosUsed = new Map<string, boolean>();
  const sim = buildRaceSim(
    (entries ?? []).map((e) => ({
      player_id: e.player_id,
      player: e.player as Player,
      lane: e.lane,
      is_injured: false,
      injured_at_tick: null,
      is_fighting: false,
      bad_money_count: e.bad_money_count,
    }))
  );

  for (let t = 0; t < TICKS_PER_RACE; t++) {
    applySimTick(race as Race, sim, t, startedAt, endsAt, chaosUsed, {
      allowNewStalls: t < TICKS_PER_RACE - 1,
    });
  }

  applyFanLiveBonusToSim(
    sim,
    (entries ?? []).map((e) => ({ player_id: e.player_id, fan_live_bonus: e.fan_live_bonus })),
    TICKS_PER_RACE - 1
  );

  console.log("\n=== RACE 1 HEALTHY FULL REPLAY (no persisted injury/fight) ===");
  const sorted = [...sim].sort((a, b) => b.score - a.score);
  for (const s of sorted) {
    const db = entries!.find((e) => e.player_id === s.player_id)!;
    const p = db.player as Player;
    console.log(
      `${p.slug.padEnd(12)} sim=${s.score.toFixed(1).padStart(6)} db=${String(db.race_score).padStart(6)} peak=${db.peak_race_score} delta=${(s.score - Number(db.race_score)).toFixed(1)}`
    );
  }

  const { data: injuries } = await supabase.from("injury_events").select("*").eq("race_id", race.id);
  console.log("\nInjury events:", injuries?.length ?? 0, injuries);

  const { data: supports } = await supabase
    .from("race_supports")
    .select("player_id, live_score_granted, created_at")
    .eq("race_id", race.id);
  console.log("\nAll race_supports:", supports);
}

if (fullRace) {
  auditFullRace1().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  auditPlayer(slug).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
