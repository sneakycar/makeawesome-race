import { getRaceClock } from "./race-clock";
import { TICKS_PER_RACE, getRaceTickIntervalMs } from "./race-logic";
import {
  applySimTick,
  buildRaceSim,
  rankSimEntries,
  replaySimToTick,
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
  race: Pick<Race, "id" | "day_number" | "started_at" | "ends_at">,
  entries: RaceEntryWithPlayer[],
  now: Date = new Date()
): LiveEntryState[] {
  const startedAt = new Date(race.started_at);
  const endsAt = new Date(race.ends_at);
  const nowMs = now.getTime();
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
  const completedTicks = Math.min(TICKS_PER_RACE, Math.floor((nowMs - startMs) / tickMs));
  const subTick = ((nowMs - startMs) % tickMs) / tickMs;

  const chaosUsed = new Map<string, boolean>();
  const sim = buildRaceSim(
    entries.map((entry) => ({
      player_id: entry.player_id,
      player: entry.player,
      is_injured: entry.is_injured,
      injured_at_tick: entry.injured_at_tick,
      race_score: entry.race_score,
    }))
  );

  replaySimToTick(race, sim, completedTicks, startedAt, endsAt, chaosUsed);

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
      if (!result || result.event_note === "STALLED" || result.event_note === "INJURED") continue;
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
  race: Pick<Race, "id" | "day_number" | "started_at" | "ends_at" | "status">,
  entries: RaceEntryWithPlayer[],
  now: Date = new Date()
): Map<string, LiveEntryState> | null {
  if (race.status !== "active") return null;

  const clock = getRaceClock(new Date(race.started_at), new Date(race.ends_at), now);
  if (clock.phase !== "live") return null;

  const live = simulateLiveEntries(race, entries, now);
  return new Map(live.map((entry) => [entry.player_id, entry]));
}
