import { getRaceClock } from "./race-clock";
import { getRaceEffectiveNow, isRaceDelayed } from "./race-delay";
import { TICKS_PER_RACE, getRaceTickIntervalMs, getTickNumber } from "./race-logic";
import {
  applySimTick,
  buildRaceSim,
  rankSimEntries,
} from "./race-sim";
import type { Race, RaceEntryWithPlayer } from "./types";

export interface LiveEntryState {
  player_id: string;
  /** Current race point total. */
  score: number;
  current_rank: number;
}

export function calculatePrecisePercentComplete(
  startedAt: Date,
  endsAt: Date,
  now: Date = new Date()
): number {
  const total = endsAt.getTime() - startedAt.getTime();
  if (total <= 0) return 100;
  const elapsed = now.getTime() - startedAt.getTime();
  return Math.max(0, Math.min(100, (elapsed / total) * 100));
}

/** Replay the seeded tick engine up to `now`, with smooth sub-tick interpolation. */
export function simulateLiveEntries(
  race: Pick<
    Race,
    | "id"
    | "day_number"
    | "started_at"
    | "ends_at"
    | "delay_until"
    | "delay_started_at"
    | "delay_frozen_percent"
  >,
  entries: RaceEntryWithPlayer[],
  now: Date = new Date(),
  syncedAt?: Date
): LiveEntryState[] {
  const startedAt = new Date(race.started_at);
  const endsAt = new Date(race.ends_at);
  const effectiveNow = getRaceEffectiveNow(race, now);
  const nowMs = effectiveNow.getTime();
  const startMs = startedAt.getTime();
  const endMs = endsAt.getTime();

  if (nowMs <= startMs) {
    return entries.map((entry) => ({
      player_id: entry.player_id,
      score: 0,
      current_rank: entry.current_rank,
    }));
  }

  if (nowMs >= endMs) {
    return entries.map((entry) => ({
      player_id: entry.player_id,
      score: Math.round(Number(entry.race_score)),
      current_rank: entry.current_rank,
    }));
  }

  const tickMs = getRaceTickIntervalMs(startedAt, endsAt);
  const completedTicks = getTickNumber(startedAt, endsAt, effectiveNow);
  const subTick = ((nowMs - startMs) % tickMs) / tickMs;

  const chaosUsed = new Map<string, boolean>();
  for (const entry of entries) {
    if (entry.event_note?.includes("CHAOS SURGE")) {
      chaosUsed.set(entry.player_id, true);
    }
  }

  const sim = buildRaceSim(
    entries.map((entry) => ({
      player_id: entry.player_id,
      player: entry.player,
      lane: entry.lane,
      is_injured: entry.is_injured,
      injured_at_tick: entry.injured_at_tick,
      is_fighting: entry.is_fighting,
      fighting_at_tick: entry.fighting_at_tick,
      fight_end_tick: entry.fight_end_tick,
      fight_frozen_score: entry.fight_frozen_score,
      race_score: entry.race_score,
    }))
  );

  const syncTick = syncedAt
    ? getTickNumber(startedAt, endsAt, getRaceEffectiveNow(race, syncedAt))
    : 0;
  const replayFrom = syncedAt ? syncTick : 0;

  if (syncedAt) {
    for (const entry of sim) {
      const row = entries.find((e) => e.player_id === entry.player_id);
      if (!row) continue;
      if (row.is_injured || row.is_fighting) continue;
      entry.score = Math.max(0, Number(row.race_score));
    }
  }

  for (let t = replayFrom; t < completedTicks; t++) {
    applySimTick(race, sim, t, startedAt, endsAt, chaosUsed);
  }

  if (subTick > 0 && completedTicks < TICKS_PER_RACE) {
    const snapshot = sim.map((entry) => ({
      ...entry,
      score: entry.score,
      stall_ticks_remaining: entry.stall_ticks_remaining,
      restart_pending: entry.restart_pending,
    }));
    const tickResults = applySimTick(
      race,
      snapshot,
      completedTicks,
      startedAt,
      endsAt,
      chaosUsed
    );
    for (const entry of sim) {
      const result = tickResults.find((r) => r.player_id === entry.player_id);
      if (
        !result ||
        result.event_note === "STALLED" ||
        result.event_note === "INJURED" ||
        result.event_note === "FIGHT"
      ) {
        continue;
      }
      entry.score = Math.max(0, entry.score + result.delta * subTick);
    }
  }

  return rankSimEntries(sim).map((entry) => ({
    player_id: entry.player_id,
    score: entry.score,
    current_rank: entry.current_rank,
  }));
}

export function liveEntriesById(
  race: Pick<
    Race,
    | "id"
    | "day_number"
    | "started_at"
    | "ends_at"
    | "status"
    | "delay_until"
    | "delay_started_at"
    | "delay_frozen_percent"
  >,
  entries: RaceEntryWithPlayer[],
  now: Date = new Date(),
  syncedAt?: Date
): Map<string, LiveEntryState> | null {
  if (race.status !== "active") return null;

  const delayOpts =
    race.delay_until && race.delay_frozen_percent != null
      ? { delayUntil: race.delay_until, frozenPercent: race.delay_frozen_percent }
      : null;
  const clock = getRaceClock(
    new Date(race.started_at),
    new Date(race.ends_at),
    now,
    isRaceDelayed(race, now) ? delayOpts : null
  );
  if (clock.phase !== "live" && clock.phase !== "delayed") return null;

  const live = simulateLiveEntries(race, entries, now, syncedAt);
  return new Map(live.map((entry) => [entry.player_id, entry]));
}
