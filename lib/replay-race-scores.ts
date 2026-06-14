import type { SupabaseClient } from "@supabase/supabase-js";
import { getRaceTickCount } from "./race-logic";
import {
  applyFanLiveBonusToSim,
  applySimTick,
  buildRaceSim,
  rankSimEntries,
} from "./race-sim";
import { normalizePeakRaceScore, roundRaceScore } from "./score";
import type { Player, Race, RaceEntryWithPlayer } from "./types";

export interface ReplayRaceScoresOptions {
  /** Ignore persisted injury/fight flags — use for repairing corrupted finalized races. */
  ignoreStatusFlags?: boolean;
}

/** Deterministic full-race replay matching finalizeRace sim path. */
export function replayRaceScores(
  race: Race,
  entries: RaceEntryWithPlayer[],
  options: ReplayRaceScoresOptions = {}
) {
  const startedAt = new Date(race.started_at);
  const endsAt = new Date(race.ends_at);
  const chaosUsed = new Map<string, boolean>();

  for (const entry of entries) {
    if (entry.event_note?.includes("CHAOS SURGE")) {
      chaosUsed.set(entry.player_id, true);
    }
  }

  const sim = buildRaceSim(
    entries.map((entry) => ({
      player_id: entry.player_id,
      player: entry.player as Player,
      lane: entry.lane,
      is_injured: options.ignoreStatusFlags ? false : Boolean(entry.is_injured),
      injured_at_tick: options.ignoreStatusFlags
        ? null
        : (entry.injured_at_tick as number | null),
      is_fighting: options.ignoreStatusFlags ? false : Boolean(entry.is_fighting),
      fighting_at_tick: options.ignoreStatusFlags
        ? null
        : (entry.fighting_at_tick as number | null),
      fight_end_tick: options.ignoreStatusFlags
        ? null
        : (entry.fight_end_tick as number | null),
      fight_frozen_score: options.ignoreStatusFlags
        ? null
        : (entry.fight_frozen_score as number | null),
      race_score: entry.race_score,
      bad_money_count: entry.bad_money_count,
    }))
  );

  const tickCount = getRaceTickCount(startedAt, endsAt);

  for (let t = 0; t < tickCount; t++) {
    applySimTick(race, sim, t, startedAt, endsAt, chaosUsed, {
      allowNewStalls: t < tickCount - 1,
    });
  }

  applyFanLiveBonusToSim(
    sim,
    entries.map((entry) => ({
      player_id: entry.player_id,
      fan_live_bonus: entry.fan_live_bonus,
      is_injured: options.ignoreStatusFlags ? false : Boolean(entry.is_injured),
      is_fighting: options.ignoreStatusFlags ? false : Boolean(entry.is_fighting),
      fighting_at_tick: options.ignoreStatusFlags
        ? null
        : (entry.fighting_at_tick as number | null),
      fight_end_tick: options.ignoreStatusFlags
        ? null
        : (entry.fight_end_tick as number | null),
    })),
    tickCount - 1
  );

  return rankSimEntries(sim);
}

export async function repairFinalizedRaceScores(
  supabase: SupabaseClient,
  raceNumber: number,
  options: ReplayRaceScoresOptions = {}
): Promise<Record<string, number>> {
  const { data: race, error: raceErr } = await supabase
    .from("races")
    .select("*")
    .eq("race_number", raceNumber)
    .maybeSingle();

  if (raceErr) throw raceErr;
  if (!race) throw new Error(`Race ${raceNumber} not found`);
  if (race.status !== "finalized") {
    throw new Error(`Race ${raceNumber} is not finalized`);
  }

  const { data: entries, error: entriesErr } = await supabase
    .from("race_entries")
    .select("*, player:players!race_entries_player_id_fkey(*)")
    .eq("race_id", race.id);

  if (entriesErr) throw entriesErr;
  if (!entries?.length) throw new Error("No race entries");

  const typedRace = race as Race;
  const typedEntries = entries as RaceEntryWithPlayer[];
  const ranked = replayRaceScores(typedRace, typedEntries, options);
  const now = new Date().toISOString();
  const scores: Record<string, number> = {};

  for (const simRanked of ranked) {
    const entry = typedEntries.find((e) => e.player_id === simRanked.player_id)!;
    const score = roundRaceScore(simRanked.score);
    const peakRaceScore = normalizePeakRaceScore(Number(entry.peak_race_score ?? 0), score);
    scores[entry.player_id] = score;

    const { error: entryErr } = await supabase
      .from("race_entries")
      .update({
        race_score: score,
        progress: score,
        displayed_progress: Math.round(score),
        current_rank: simRanked.current_rank,
        final_rank: simRanked.current_rank,
        peak_race_score: peakRaceScore,
        updated_at: now,
      })
      .eq("id", entry.id);

    if (entryErr) {
      throw new Error(`repair race_entries update failed (${entry.id}): ${entryErr.message}`);
    }

    const player = entry.player as Player;
    await supabase
      .from("players")
      .update({
        highest_race_score: Math.max(
          normalizePeakRaceScore(Number(player.highest_race_score ?? 0), 0),
          score
        ),
        updated_at: now,
      })
      .eq("id", player.id);
  }

  return scores;
}
