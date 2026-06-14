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
  progress: number;
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
      progress: seededRange(`${race.id}:${entry.player_id}:init`, 0, 6),
      current_rank: entry.current_rank,
    }));
  }

  if (nowMs >= endMs) {
    return entries.map((entry) => ({
      player_id: entry.player_id,
      progress: Number(entry.progress),
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
    progress: seededRange(`${race.id}:${entry.player_id}:init`, 0, 6),
  }));

  const chaosUsed = new Map<string, boolean>();

  const applyTick = (tickNumber: number, fraction: number) => {
    if (fraction <= 0 || tickNumber >= TICKS_PER_RACE) return;

    const tickTime = new Date(startMs + tickNumber * tickMs + fraction * tickMs);
    const percentComplete = calculatePercentComplete(startedAt, endsAt, tickTime);

    const deltas = sim.map((entry) => {
      const result = calculateTickDelta({
        raceId: race.id,
        playerId: entry.player_id,
        tickNumber,
        dayNumber: race.day_number,
        percentComplete,
        player: entry.player,
        currentProgress: entry.progress,
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
      entry.progress = Math.max(0, entry.progress + row.delta);
    }
  };

  for (let t = 0; t < completedTicks; t++) {
    applyTick(t, 1);
  }
  if (completedTicks < TICKS_PER_RACE) {
    applyTick(completedTicks, subTick);
  }

  const ranked = [...sim].sort((a, b) => b.progress - a.progress);
  return ranked.map((entry, index) => ({
    player_id: entry.player_id,
    progress: Math.min(100, entry.progress),
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

export function formatLivePercent(progress: number): string {
  return Math.max(0, Math.min(100, progress)).toFixed(3);
}
