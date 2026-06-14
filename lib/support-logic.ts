import { seededBool, seededInt } from "./seeded-rng";
import type { Player } from "./types";
import {
  getMaxSupportGainsPerRace,
  getSupportGrowthChanceBonus,
  pickWeightedGrowthStat,
  recalculateRatingFromPartial,
  type GrowthStat,
} from "./identity";
import {
  DEDICATION_GROWTH_BONUS_CAP,
  DEDICATION_GROWTH_BONUS_PER_VOTE,
} from "./support-limits";

export const GROWTH_STATS = ["grit", "chaos", "nerve", "luck", "burst"] as const;
export type { GrowthStat };

const BASE_GROWTH_CHANCE = 0.25;

export function isBottom3AllTime(player: Player, allPlayers: Player[]): boolean {
  if (allPlayers.length < 3) return player.wins === 0;
  const sorted = [...allPlayers].sort((a, b) => {
    if (a.wins !== b.wins) return a.wins - b.wins;
    if (b.races !== a.races) return b.races - a.races;
    const aWorst = a.worst_finish ?? 0;
    const bWorst = b.worst_finish ?? 0;
    if (bWorst !== aWorst) return bWorst - aWorst;
    return b.created_day - a.created_day;
  });
  const bottom3 = new Set(sorted.slice(0, 3).map((p) => p.id));
  return bottom3.has(player.id);
}

export function hasRecentReturn(player: Player, currentDay: number): boolean {
  if (player.comeback_until_day == null) return false;
  const returnDay = player.comeback_until_day - 3;
  return currentDay - returnDay <= 5;
}

export function computeGrowthChance(
  player: Player,
  currentDay: number,
  allPlayers: Player[]
): number {
  let chance = BASE_GROWTH_CHANCE * (1 - player.rating / 200);

  if (player.wins === 0 || isBottom3AllTime(player, allPlayers)) {
    chance += 0.15;
  }

  if (hasRecentReturn(player, currentDay)) {
    chance += 0.1;
  }

  chance += getSupportGrowthChanceBonus(player);

  return Math.min(1, Math.max(0, chance));
}

export interface GrowthRollResult {
  stat: GrowthStat;
  label: string;
}

export function rollGrowthGains(
  raceId: string,
  playerId: string,
  player: Player,
  supportCount: number,
  currentDay: number,
  allPlayers: Player[]
): GrowthRollResult[] {
  const chance = computeGrowthChance(player, currentDay, allPlayers);
  const gains: GrowthRollResult[] = [];
  const maxGains = getMaxSupportGainsPerRace(player);

  for (let i = 0; i < supportCount && gains.length < maxGains; i++) {
    const seed = `${raceId}:${playerId}:support:${i}:growth`;
    const dedicationBonus = Math.min(
      DEDICATION_GROWTH_BONUS_CAP,
      Math.max(0, i) * DEDICATION_GROWTH_BONUS_PER_VOTE
    );
    const rollChance = Math.min(1, Math.max(0, chance + dedicationBonus));
    if (seededBool(seed, rollChance)) {
      const stat = pickWeightedGrowthStat(`${seed}:stat`, player);
      const isSignature = stat === player.signature_stat;
      gains.push({
        stat,
        label: isSignature ? `SIGNATURE ${stat.toUpperCase()} +1` : `${stat.toUpperCase()} +1`,
      });
    }
  }

  return gains;
}

export function applyGrowthToPlayer(
  player: Player,
  gains: GrowthRollResult[]
): Partial<Player> {
  const updates: Partial<Player> = {};
  for (const gain of gains) {
    const current = player[gain.stat];
    updates[gain.stat] = Math.min(100, ((updates[gain.stat] as number) ?? current) + 1);
  }
  if (gains.length > 0) {
    updates.rating = recalculateRatingFromPartial({ ...player, ...updates });
  }
  return updates;
}
