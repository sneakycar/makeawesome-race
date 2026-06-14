import { getRaceClock } from "./race-clock";
import {
  TICKS_PER_RACE,
  calculatePercentComplete,
  calculateTickDelta,
  getRaceTickIntervalMs,
} from "./race-logic";
import { seededRange } from "./seeded-rng";
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
      score: Number(entry.race_score),
      current_rank: entry.current_rank,
    }));
  }

  const elapsedMs = nowMs - startMs;
  const tickMs = getRaceTickIntervalMs(startedAt, endsAt);
  const completedTicks = Math.min(TICKS_PER_RACE, Math.floor(elapsedMs / tickMs));
  const subTick = (elapsedMs % tickMs) / tickMs;

  const sim = entries.map((entry) => ({
    player_id: entry.player_id,
    player: entry.player,
    score: entry.is_injured ? Number(entry.race_score) : 0,
    is_injured: Boolean(entry.is_injured),
  }));

  const chaosUsed = new Map<string, boolean>();

  const applyTick = (tickNumber: number, fraction: number) => {
    if (fraction <= 0 || tickNumber >= TICKS_PER_RACE) return;

    const tickTime = new Date(startMs + tickNumber * tickMs + fraction * tickMs);
    const percentComplete = calculatePercentComplete(startedAt, endsAt, tickTime);

    const rankedBefore = [...sim].sort((a, b) => b.score - a.score);
    const rankById = new Map(
      rankedBefore.map((entry, index) => [entry.player_id, index + 1])
    );

    const deltas = sim.map((entry) => {
      if (entry.is_injured) {
        return {
          player_id: entry.player_id,
          delta: 0,
          chaosBurstUsed: false,
        };
      }
      const result = calculateTickDelta({
        raceId: race.id,
        playerId: entry.player_id,
        tickNumber,
        dayNumber: race.day_number,
        percentComplete,
        player: entry.player,
        currentProgress: entry.score,
        currentRank: rankById.get(entry.player_id) ?? sim.length,
        chaosBurstUsed: chaosUsed.get(entry.player_id) ?? false,
      });
      return {
        player_id: entry.player_id,
        delta: result.delta * fraction,
        chaosBurstUsed: result.chaosBurstUsed,
      };
    });

    for (const row of deltas) {
      if (row.chaosBurstUsed) chaosUsed.set(row.player_id, true);
    }

    for (const entry of sim) {
      const row = deltas.find((d) => d.player_id === entry.player_id)!;
      entry.score = Math.max(0, entry.score + row.delta);
    }
  };

  for (let t = 0; t < completedTicks; t++) {
    applyTick(t, 1);
  }
  if (completedTicks < TICKS_PER_RACE) {
    applyTick(completedTicks, subTick);
  }

  const ranked = [...sim].sort((a, b) => {
    if (a.is_injured !== b.is_injured) return a.is_injured ? 1 : -1;
    return b.score - a.score;
  });
  return ranked.map((entry, index) => ({
    player_id: entry.player_id,
    score: entry.score,
    current_rank: index + 1,
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
