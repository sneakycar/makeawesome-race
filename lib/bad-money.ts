import { seededBool, seededRange } from "./seeded-rng";
import {
  pickWeightedGrowthStat,
  recalculateRatingFromPartial,
  type GrowthStat,
} from "./identity";
import { GROWTH_STATS } from "./support-logic";
import type { Player } from "./types";

export function getBadMoneyMagnitude(badMoneyCount: number): number {
  const count = Math.max(0, Number(badMoneyCount));
  if (count <= 0) return 0;
  return Math.min(0.015, Math.sqrt(count) * 0.0025);
}

export function getBadMoneySwing(
  raceId: string,
  playerId: string,
  tickNumber: number,
  badMoneyCount: number
): number {
  const magnitude = getBadMoneyMagnitude(badMoneyCount);
  if (magnitude <= 0) return 0;
  return seededRange(
    `${raceId}:${playerId}:${tickNumber}:bad-money-swing`,
    -magnitude,
    magnitude * 1.25
  );
}

export function applyBadMoneyToDelta(
  delta: number,
  raceId: string,
  playerId: string,
  tickNumber: number,
  percentComplete: number,
  badMoneyCount: number
): number {
  if (badMoneyCount <= 0 || delta === 0) return delta;

  const swing = getBadMoneySwing(raceId, playerId, tickNumber, badMoneyCount);
  let adjusted = delta * (1 + swing);

  if (percentComplete > 75) {
    const pressureDuringRace = badMoneyCount * 0.01;
    adjusted *= 1 - Math.min(0.01, pressureDuringRace * 0.001);
  }

  return adjusted;
}

export function getBadMoneyGrowthChance(betCount: number): number {
  return Math.min(0.05, Math.sqrt(Math.max(0, betCount)) * 0.006);
}

export function getBadMoneyRegressionChance(betCount: number): number {
  return Math.min(0.035, Math.sqrt(Math.max(0, betCount)) * 0.004);
}

export function pickBadMoneyGrowthStat(seed: string, player: Player): GrowthStat {
  if (seededBool(`${seed}:sig`, 0.65)) {
    const sig = player.signature_stat as GrowthStat;
    if (GROWTH_STATS.includes(sig)) return sig;
  }
  return pickWeightedGrowthStat(`${seed}:grow`, player);
}

export function pickBadMoneyRegressionStat(seed: string, player: Player): GrowthStat {
  const sig = player.signature_stat as GrowthStat;
  const candidates = GROWTH_STATS.filter((s) => s !== sig);
  const pool = candidates.length ? candidates : [...GROWTH_STATS];
  let roll = seededRange(`${seed}:reg`, 0, pool.length);
  const idx = Math.min(pool.length - 1, Math.floor(roll));
  return pool[idx] ?? "grit";
}

export function applyBadMoneyStatDelta(
  player: Player,
  stat: GrowthStat,
  delta: number
): Partial<Player> {
  const current = player[stat];
  const next = Math.max(1, Math.min(100, current + delta));
  const updates: Partial<Player> = { [stat]: next };
  updates.rating = recalculateRatingFromPartial({ ...player, ...updates });
  return updates;
}

export function getBadMoneyPressureBump(betCount: number): number {
  return Math.ceil(Math.sqrt(Math.max(0, betCount)));
}

export function getBadMoneyPlayerPressure(betCount: number): number {
  return Math.min(3, Math.ceil(Math.sqrt(Math.max(0, betCount)) / 2));
}

export function getBadMoneyFlavorLine(total: number): string {
  if (total <= 0) return "NO MONEY HAS FOUND THEM.";
  if (total <= 9) return "SMALL MONEY FOLLOWS THEM.";
  if (total <= 49) return "THEY ARE KNOWN TO MONEY.";
  if (total <= 199) return "THE MONEY KEEPS RETURNING.";
  return "THE MONEY HAS A CLAIM.";
}
