import {
  calculatePercentComplete,
  calculateTickDelta,
  getRaceTickIntervalMs,
  type TickDeltaResult,
} from "./race-logic";
import { seededBool, seededInt, seededRange } from "./seeded-rng";
import type { Player, Race } from "./types";

export interface RaceSimEntry {
  player_id: string;
  player: Player;
  lane: number;
  score: number;
  is_injured: boolean;
  injured_at_tick: number | null;
  stall_ticks_remaining: number;
  restart_pending: boolean;
}

export interface SimTickResult {
  player_id: string;
  delta: number;
  event_note: string | null;
  chaos_burst_used: boolean;
}

export function buildRaceSim(
  entries: Array<{
    player_id: string;
    player: Player;
    lane: number;
    is_injured?: boolean;
    injured_at_tick?: number | null;
    race_score?: number;
  }>
): RaceSimEntry[] {
  return entries.map((entry) => ({
    player_id: entry.player_id,
    player: entry.player,
    lane: entry.lane,
    score: entry.is_injured ? Number(entry.race_score ?? 0) : 0,
    is_injured: Boolean(entry.is_injured),
    injured_at_tick: entry.injured_at_tick ?? null,
    stall_ticks_remaining: 0,
    restart_pending: false,
  }));
}

function longStallChance(player: Player, rank: number, percentComplete: number): number {
  let chance = 0.1 + player.drag / 450;
  if (rank <= 2 && percentComplete >= 20) chance += 0.07;
  if (rank >= 5) chance -= 0.02;
  if (player.archetype === "WORKHORSE") chance -= 0.02;
  if (player.archetype === "GLASS CANNON") chance += 0.04;
  if (player.archetype === "GAMBLER") chance += 0.03;
  if (player.traits.includes("TIRED")) chance += 0.03;
  if (player.traits.includes("SLEEPY")) chance += 0.05;
  return Math.max(0.05, Math.min(0.28, chance));
}

export function applySimTick(
  race: Pick<Race, "id" | "day_number">,
  sim: RaceSimEntry[],
  tickNumber: number,
  startedAt: Date,
  endsAt: Date,
  chaosUsed: Map<string, boolean>,
  options: { allowNewStalls?: boolean } = {}
): SimTickResult[] {
  const allowNewStalls = options.allowNewStalls ?? true;
  const tickMs = getRaceTickIntervalMs(startedAt, endsAt);
  const tickTime = new Date(startedAt.getTime() + tickNumber * tickMs);
  const percentComplete = calculatePercentComplete(startedAt, endsAt, tickTime);

  const rankedBefore = [...sim].sort((a, b) => b.score - a.score);
  const rankById = new Map(
    rankedBefore.map((entry, index) => [entry.player_id, index + 1])
  );

  const results: SimTickResult[] = [];

  for (const entry of sim) {
    if (entry.is_injured && entry.injured_at_tick != null && tickNumber >= entry.injured_at_tick) {
      results.push({
        player_id: entry.player_id,
        delta: 0,
        event_note: "INJURED",
        chaos_burst_used: false,
      });
      continue;
    }

    const rank = rankById.get(entry.player_id) ?? sim.length;
    const leaderScore = rankedBefore[0]?.score ?? 0;
    const stallSeed = `${race.id}:${entry.player_id}:${tickNumber}:stall`;

    if (entry.stall_ticks_remaining > 0) {
      entry.stall_ticks_remaining -= 1;
      if (entry.stall_ticks_remaining === 0) {
        entry.restart_pending = true;
      }
      results.push({
        player_id: entry.player_id,
        delta: 0,
        event_note: "STALLED",
        chaos_burst_used: false,
      });
      continue;
    }

    let result: TickDeltaResult = calculateTickDelta({
      raceId: race.id,
      playerId: entry.player_id,
      tickNumber,
      dayNumber: race.day_number,
      percentComplete,
      player: entry.player,
      currentProgress: entry.score,
      currentRank: rank,
      leaderScore,
      chaosBurstUsed: chaosUsed.get(entry.player_id) ?? false,
      lane: entry.lane,
    });

    if (entry.restart_pending) {
      const restart = seededRange(`${stallSeed}:restart`, 8, 18);
      result = {
        ...result,
        delta: result.delta + restart,
        eventNote: result.eventNote ? `${result.eventNote} / RESTART` : "RESTART",
      };
      entry.restart_pending = false;
    }

    if (
      allowNewStalls &&
      result.delta > 0.05 &&
      entry.score > 4 &&
      seededBool(stallSeed, longStallChance(entry.player, rank, percentComplete))
    ) {
      entry.stall_ticks_remaining = seededInt(`${stallSeed}:dur`, 2, 16);
      results.push({
        player_id: entry.player_id,
        delta: 0,
        event_note: "STALLED",
        chaos_burst_used: false,
      });
      continue;
    }

    if (result.chaosBurstUsed) {
      chaosUsed.set(entry.player_id, true);
    }

    entry.score = Math.max(0, entry.score + result.delta);
    results.push({
      player_id: entry.player_id,
      delta: result.delta,
      event_note: result.eventNote,
      chaos_burst_used: result.chaosBurstUsed,
    });
  }

  return results;
}

export function replaySimToTick(
  race: Pick<Race, "id" | "day_number">,
  sim: RaceSimEntry[],
  tickNumber: number,
  startedAt: Date,
  endsAt: Date,
  chaosUsed: Map<string, boolean>
): void {
  for (let t = 0; t < tickNumber; t++) {
    applySimTick(race, sim, t, startedAt, endsAt, chaosUsed);
  }
}

export function rankSimEntries(
  sim: RaceSimEntry[]
): Array<RaceSimEntry & { current_rank: number }> {
  const sorted = [...sim].sort((a, b) => {
    if (a.is_injured !== b.is_injured) return a.is_injured ? 1 : -1;
    return b.score - a.score;
  });
  return sorted.map((entry, index) => ({
    ...entry,
    current_rank: index + 1,
  }));
}
