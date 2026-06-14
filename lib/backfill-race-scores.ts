import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculatePercentComplete,
  getRaceTickIntervalMs,
  getTickNumber,
} from "./race-logic";
import { getRaceEffectiveNow } from "./race-delay";
import { applySimTick, applyFanLiveBonusToSim, buildRaceSim, rankSimEntries } from "./race-sim";
import type { Player, Race, RaceEntryWithPlayer } from "./types";

import { normalizePeakRaceScore, roundRaceScore } from "./score";

export async function backfillActiveRaceScores(
  supabase: SupabaseClient
): Promise<{ raceNumber: number; tickNumber: number; scores: Record<string, number> } | null> {
  const { data: race, error: raceErr } = await supabase
    .from("races")
    .select("*")
    .eq("status", "active")
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (raceErr) throw raceErr;
  if (!race) return null;

  const { data: entries, error: entriesErr } = await supabase
    .from("race_entries")
    .select("*, player:players!race_entries_player_id_fkey(*)")
    .eq("race_id", race.id);

  if (entriesErr) throw entriesErr;
  if (!entries?.length) throw new Error("No race entries");

  const typedRace = race as Race;
  const typedEntries = entries as RaceEntryWithPlayer[];
  const startedAt = new Date(typedRace.started_at);
  const endsAt = new Date(typedRace.ends_at);
  const effectiveNow = getRaceEffectiveNow(typedRace, new Date());
  const tickNumber = getTickNumber(startedAt, endsAt, effectiveNow);

  const sim = buildRaceSim(
    typedEntries.map((entry) => ({
      player_id: entry.player_id,
      player: entry.player as Player,
      lane: entry.lane,
      is_injured: Boolean(entry.is_injured),
      injured_at_tick: entry.injured_at_tick as number | null,
      is_fighting: Boolean(entry.is_fighting),
      fighting_at_tick: entry.fighting_at_tick as number | null,
      fight_end_tick: entry.fight_end_tick as number | null,
      fight_frozen_score: entry.fight_frozen_score as number | null,
      race_score: entry.race_score,
    }))
  );

  const chaosUsed = new Map<string, boolean>();
  const tickDeltas = new Map<string, number[]>();
  const fightFrozenById = new Map<string, number>();

  for (let tick = 0; tick <= tickNumber; tick++) {
    for (const entry of typedEntries) {
      const simEntry = sim.find((s) => s.player_id === entry.player_id);
      if (!simEntry) continue;

      if (entry.is_injured && entry.injured_at_tick != null && tick >= entry.injured_at_tick) {
        simEntry.is_injured = true;
        simEntry.injured_at_tick = entry.injured_at_tick as number;
      }

      if (
        entry.is_fighting &&
        entry.fighting_at_tick != null &&
        entry.fight_end_tick != null
      ) {
        if (tick === entry.fighting_at_tick) {
          const frozen = roundRaceScore(simEntry.score);
          fightFrozenById.set(entry.player_id, frozen);
          simEntry.is_fighting = true;
          simEntry.fighting_at_tick = entry.fighting_at_tick as number;
          simEntry.fight_end_tick = entry.fight_end_tick as number;
          simEntry.fight_frozen_score = frozen;
          simEntry.score = frozen;
        } else if (tick > entry.fighting_at_tick && tick < entry.fight_end_tick) {
          simEntry.is_fighting = true;
          simEntry.fighting_at_tick = entry.fighting_at_tick as number;
          simEntry.fight_end_tick = entry.fight_end_tick as number;
          const frozen = fightFrozenById.get(entry.player_id) ?? roundRaceScore(simEntry.score);
          simEntry.fight_frozen_score = frozen;
          simEntry.score = frozen;
        } else if (tick >= entry.fight_end_tick) {
          simEntry.is_fighting = false;
        }
      }
    }

    const results = applySimTick(
      typedRace,
      sim,
      tick,
      startedAt,
      endsAt,
      chaosUsed,
      { allowNewStalls: tick < tickNumber }
    );

    for (const result of results) {
      if (result.event_note === "FIGHT" || result.event_note === "INJURED") continue;
      const prev = tickDeltas.get(result.player_id) ?? [];
      tickDeltas.set(result.player_id, [...prev, result.delta]);
    }
  }

  applyFanLiveBonusToSim(
    sim,
    typedEntries.map((entry) => ({
      player_id: entry.player_id,
      fan_live_bonus: entry.fan_live_bonus,
      is_injured: Boolean(entry.is_injured),
      is_fighting: Boolean(entry.is_fighting),
      fighting_at_tick: entry.fighting_at_tick as number | null,
      fight_end_tick: entry.fight_end_tick as number | null,
    })),
    tickNumber
  );

  const ranked = rankSimEntries(sim);
  const now = new Date().toISOString();
  const percentComplete = calculatePercentComplete(startedAt, endsAt, effectiveNow);
  const scores: Record<string, number> = {};

  for (const simRanked of ranked) {
    const entry = typedEntries.find((e) => e.player_id === simRanked.player_id)!;
    const deltas = tickDeltas.get(entry.player_id) ?? [];
    const lastDelta = deltas.length ? deltas[deltas.length - 1] : 0;
    const fighting =
      entry.is_fighting &&
      entry.fighting_at_tick != null &&
      entry.fight_end_tick != null &&
      tickNumber >= entry.fighting_at_tick &&
      tickNumber < entry.fight_end_tick;
    const score = fighting
      ? fightFrozenById.get(entry.player_id) ??
        roundRaceScore(Number(entry.fight_frozen_score ?? simRanked.score))
      : roundRaceScore(simRanked.score);
    const peakRaceScore = normalizePeakRaceScore(Number(entry.peak_race_score ?? 0), score);
    const frozenScore = fighting ? score : entry.fight_frozen_score;

    scores[entry.player_id] = score;

    await supabase
      .from("race_entries")
      .update({
        race_score: score,
        progress: score,
        displayed_progress: score,
        current_rank: simRanked.current_rank,
        last_delta: fighting || entry.is_injured ? 0 : lastDelta,
        recent_deltas: fighting || entry.is_injured ? [] : deltas.slice(-3),
        peak_race_score: peakRaceScore,
        fight_frozen_score: frozenScore,
        updated_at: now,
      })
      .eq("id", entry.id);

    await supabase
      .from("players")
      .update({
        highest_race_score: Math.max(
          normalizePeakRaceScore(Number(entry.player.highest_race_score ?? 0), 0),
          score
        ),
        updated_at: now,
      })
      .eq("id", entry.player_id);
  }

  await supabase
    .from("races")
    .update({ percent_complete: percentComplete, updated_at: now })
    .eq("id", typedRace.id);

  return { raceNumber: typedRace.race_number, tickNumber, scores };
}
