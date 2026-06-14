import { seededBool, seededInt } from "./seeded-rng";
import type { Player, RaceEntry } from "./types";

export interface FightRollContext {
  tickNumber: number;
  percentComplete: number;
}

export interface FightPairPick {
  playerAId: string;
  playerBId: string;
  durationTicks: number;
}

export function isFightFrozen(
  entry: Pick<RaceEntry, "is_fighting" | "fighting_at_tick" | "fight_end_tick">,
  tickNumber: number
): boolean {
  if (!entry.is_fighting || entry.fighting_at_tick == null || entry.fight_end_tick == null) {
    return false;
  }
  return tickNumber >= entry.fighting_at_tick && tickNumber < entry.fight_end_tick;
}

export function calculateFightChance(ctx: FightRollContext): number {
  if (ctx.percentComplete <= 12 || ctx.percentComplete >= 88) return 0;
  return 0.0075;
}

export function fightTraitMultiplier(players: Player[]): number {
  let mult = 1;
  for (const player of players) {
    if (player.archetype === "GAMBLER") mult *= 1.2;
    if (player.archetype === "GLASS CANNON") mult *= 1.1;
    if (player.archetype === "PROFESSIONAL") mult *= 0.85;
    if (player.traits.includes("DANGEROUS")) mult *= 1.15;
    if (player.traits.includes("CALM")) mult *= 0.9;
    if (player.traits.includes("NERVOUS")) mult *= 1.08;
  }
  return mult;
}

export function shouldStartFight(seed: string, chance: number): boolean {
  return seededBool(seed, Math.min(0.04, chance));
}

export function pickFightPair(
  raceId: string,
  tickNumber: number,
  eligible: Array<{ player_id: string; current_rank: number; player: Player }>
): FightPairPick | null {
  if (eligible.length < 2) return null;

  const sorted = [...eligible].sort((a, b) => a.current_rank - b.current_rank);
  const pairIdx = seededInt(`${raceId}:${tickNumber}:fight-pair`, 0, sorted.length - 2);
  const a = sorted[pairIdx];
  const b = sorted[pairIdx + 1];
  const durationTicks = seededInt(`${raceId}:${tickNumber}:fight-dur`, 2, 8);

  return {
    playerAId: a.player_id,
    playerBId: b.player_id,
    durationTicks,
  };
}

export function clearEndedFights<T extends RaceEntry>(entries: T[], tickNumber: number): T[] {
  return entries.map((entry) => {
    if (
      entry.is_fighting &&
      entry.fight_end_tick != null &&
      tickNumber >= entry.fight_end_tick
    ) {
      return {
        ...entry,
        is_fighting: false,
        fighting_at_tick: null,
        fight_end_tick: null,
        fight_partner_id: null,
        fight_frozen_score: null,
      };
    }
    return entry;
  });
}
