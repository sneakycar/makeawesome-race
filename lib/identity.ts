import { seededBool, seededInt, seededPick, seededRandom, seededRange } from "./seeded-rng";
import type { Player } from "./types";

export const SIGNATURE_STATS = ["grit", "chaos", "nerve", "luck", "burst", "drag"] as const;
export type SignatureStat = (typeof SIGNATURE_STATS)[number];
export type GrowthStat = Exclude<SignatureStat, "drag">;

export const ARCHETYPE_IDS = [
  "WORKHORSE",
  "GAMBLER",
  "CURSED",
  "COMEBACKER",
  "RELIC",
  "LATE BLOOMER",
  "GLASS CANNON",
  "IRON LOSER",
  "STAR",
  "GHOST",
  "MUTANT",
  "PROFESSIONAL",
  "FAN FAVORITE",
  "DOOMED",
] as const;

export type ArchetypeId = (typeof ARCHETYPE_IDS)[number];

export const TRAIT_IDS = [
  "LOUD", "QUIET", "STUBBORN", "DUSTY", "PARANOID", "ELEGANT", "UNLUCKY", "LUCKY",
  "SUSPICIOUS", "FORMAL", "COLD", "GREEDY", "TIRED", "WET", "HOLLOW", "BRAVE",
  "SMALL", "HUGE", "NERVOUS", "CALM", "RUDE", "POLITE", "ANCIENT", "NEW",
  "SAD", "FAST", "SLOW", "SHARP", "SOFT", "ROTTEN", "CLEAN", "BROKEN",
  "FAITHFUL", "USELESS", "FAMOUS", "FORGOTTEN", "DANGEROUS", "BORING", "TENDER",
  "GROSS", "MAGNETIC", "PALE", "HEAVY", "LIGHT", "ODD", "PLAIN", "WILD",
  "STILL", "HUNGRY", "SLEEPY",
] as const;

export type TraitId = (typeof TRAIT_IDS)[number];

export interface PlayerIdentity {
  archetype: ArchetypeId;
  traits: TraitId[];
  signature_stat: SignatureStat;
}

interface ArchetypeDef {
  description: string;
  statBias: Partial<Record<SignatureStat, number>>;
  preferredGrowth: SignatureStat[];
  startingRating?: number;
  startingPressure?: number;
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  WORKHORSE: {
    description: "Reliable, hard to kill, rarely spectacular.",
    statBias: { grit: 8, nerve: 6, chaos: -6, burst: -4 },
    preferredGrowth: ["grit", "nerve"],
  },
  GAMBLER: {
    description: "Can win from nowhere, can collapse from first.",
    statBias: { chaos: 10, luck: 8, grit: -6, nerve: -4 },
    preferredGrowth: ["chaos", "luck"],
  },
  CURSED: {
    description: "Talented but something always goes wrong.",
    statBias: { burst: 8, chaos: 6, luck: -8, nerve: -6 },
    preferredGrowth: ["burst", "chaos"],
  },
  COMEBACKER: {
    description: "Mediocre when safe, dangerous after exile.",
    statBias: { nerve: 8, luck: 6 },
    preferredGrowth: ["nerve", "luck"],
  },
  RELIC: {
    description: "Starts powerful, ages badly.",
    statBias: { grit: 6, nerve: 6, burst: -6 },
    preferredGrowth: ["grit", "nerve"],
    startingRating: 12,
  },
  "LATE BLOOMER": {
    description: "Bad or average early, dangerous later.",
    statBias: { nerve: 8 },
    preferredGrowth: ["nerve", "grit", "burst"],
    startingRating: -11,
  },
  "GLASS CANNON": {
    description: "Extremely fast, extremely breakable.",
    statBias: { burst: 12, chaos: 8, grit: -8, nerve: -6 },
    preferredGrowth: ["burst", "chaos"],
  },
  "IRON LOSER": {
    description: "Keeps surviving despite being bad.",
    statBias: { grit: 10, drag: 8 },
    preferredGrowth: ["grit", "drag"],
    startingRating: -8,
  },
  STAR: {
    description: "Clearly gifted, but carries pressure.",
    statBias: { burst: 8, luck: 6 },
    preferredGrowth: ["burst", "luck"],
    startingRating: 10,
    startingPressure: 10,
  },
  GHOST: {
    description: "Invisible until suddenly relevant.",
    statBias: { luck: 8, nerve: 6, chaos: -6 },
    preferredGrowth: ["luck", "nerve"],
  },
  MUTANT: {
    description: "Unstable long-term evolution.",
    statBias: { drag: 10, chaos: 8 },
    preferredGrowth: ["chaos", "drag"],
  },
  PROFESSIONAL: {
    description: "Clean, efficient, boringly competent.",
    statBias: { grit: 6, nerve: 6, chaos: -8 },
    preferredGrowth: ["grit", "nerve"],
  },
  "FAN FAVORITE": {
    description: "Not necessarily great, but support changes their life.",
    statBias: { luck: 6, nerve: 4 },
    preferredGrowth: ["luck", "nerve"],
  },
  DOOMED: {
    description: "Powerful, tragic, probably temporary.",
    statBias: { burst: 10, chaos: 8, nerve: -8, drag: 6 },
    preferredGrowth: ["burst", "chaos"],
    startingRating: 6,
  },
};

export interface RaceModifierContext {
  percentComplete: number;
  currentRank: number;
  currentProgress: number;
  dayNumber: number;
  entryCount?: number;
}

export interface GrowthModifierContext {
  finish: number;
  isWinner: boolean;
  currentDay: number;
  isTop3AllTime: boolean;
}

const STAT_KEYS: SignatureStat[] = ["grit", "chaos", "nerve", "luck", "burst", "drag"];
const GROWTH_STATS: GrowthStat[] = ["grit", "chaos", "nerve", "luck", "burst"];

function hasTrait(player: Player, trait: TraitId): boolean {
  return (player.traits as string[]).includes(trait);
}

function pickUniqueTraits(seed: string, count: number): TraitId[] {
  const pool = [...TRAIT_IDS];
  const picked: TraitId[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = seededInt(`${seed}:trait:${i}`, 0, pool.length - 1);
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

export function generateIdentity(seed: string): PlayerIdentity {
  const archetype = seededPick(`${seed}:archetype`, [...ARCHETYPE_IDS]) as ArchetypeId;
  const traitCount = seededInt(`${seed}:traitcount`, 2, 3);
  const traits = pickUniqueTraits(`${seed}:traits`, traitCount);
  const signature_stat = seededPick(`${seed}:signature`, [...SIGNATURE_STATS]) as SignatureStat;
  return { archetype, traits, signature_stat };
}

export function rollBaseStats(seed: string): Record<SignatureStat, number> & { volatility: number } {
  return {
    grit: seededInt(`${seed}:grit`, 25, 80),
    chaos: seededInt(`${seed}:chaos`, 25, 80),
    nerve: seededInt(`${seed}:nerve`, 25, 80),
    luck: seededInt(`${seed}:luck`, 25, 80),
    burst: seededInt(`${seed}:burst`, 25, 80),
    drag: seededInt(`${seed}:drag`, 5, 60),
    volatility: seededInt(`${seed}:volatility`, 20, 80),
  };
}

function applyTraitStartingBias(
  stats: Record<SignatureStat, number>,
  traits: TraitId[]
): void {
  for (const trait of traits) {
    switch (trait) {
      case "ELEGANT":
        stats.nerve += 3;
        break;
      case "UNLUCKY":
        stats.luck -= 4;
        break;
      case "LUCKY":
        stats.luck += 4;
        break;
      case "BROKEN":
      case "USELESS":
        stats.grit -= 2;
        stats.luck -= 2;
        break;
      case "WET":
        stats.chaos += 3;
        stats.drag += 3;
        break;
      case "TIRED":
        stats.grit -= 2;
        break;
      case "NERVOUS":
        stats.nerve -= 3;
        break;
      case "CALM":
        stats.nerve += 3;
        break;
      case "DANGEROUS":
        stats.burst += 3;
        stats.chaos += 2;
        stats.drag += 2;
        break;
      default:
        break;
    }
  }
}

function clampStat(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

export function calculateRating(stats: Pick<Player, SignatureStat>): number {
  const raw =
    stats.grit * 0.22 +
    stats.chaos * 0.14 +
    stats.nerve * 0.2 +
    stats.luck * 0.14 +
    stats.burst * 0.2 -
    stats.drag * 0.1;
  return Math.max(1, Math.min(100, Math.round(raw)));
}

export function applyArchetypeStartingStats(
  draft: Record<SignatureStat, number> & { volatility: number },
  identity: PlayerIdentity
): Record<SignatureStat, number> & { volatility: number; rating: number; pressure: number } {
  const def = ARCHETYPES[identity.archetype];
  for (const [stat, delta] of Object.entries(def.statBias) as [SignatureStat, number][]) {
    draft[stat] = clampStat(draft[stat] + delta);
  }

  applyTraitStartingBias(draft, identity.traits);

  const sigBoost = seededInt(`${identity.archetype}:sig:${identity.signature_stat}`, 10, 22);
  draft[identity.signature_stat] = clampStat(draft[identity.signature_stat] + sigBoost);

  for (const stat of STAT_KEYS) {
    draft[stat] = clampStat(draft[stat]);
  }

  let rating = calculateRating(draft);
  if (def.startingRating) {
    rating = clampStat(rating + def.startingRating);
  }

  return {
    ...draft,
    rating,
    pressure: def.startingPressure ?? 0,
  };
}

export function buildPlayerStatsFromSeed(seed: string, identity: PlayerIdentity) {
  const base = rollBaseStats(seed);
  return applyArchetypeStartingStats(base, identity);
}

export function formatTraitsDisplay(traits: string[]): string {
  if (!traits.length) return "—";
  return traits.join(" / ");
}

export function getIdentityText(player: Pick<Player, "archetype" | "traits">): string {
  const def = ARCHETYPES[player.archetype as ArchetypeId];
  const base = def?.description ?? "An unknown racer.";
  if (!player.traits.length) return base;
  return `${base} ${formatTraitsDisplay(player.traits as TraitId[]).toLowerCase()}.`;
}

export function getArchetypeRaceModifier(player: Player, ctx: RaceModifierContext): number {
  const arch = player.archetype as ArchetypeId;
  let mod = 0;

  switch (arch) {
    case "WORKHORSE":
      mod += 2;
      break;
    case "GAMBLER":
      mod += seededRange(`${player.id}:${ctx.dayNumber}:gamb`, -4, 4);
      break;
    case "CURSED":
      mod += ctx.percentComplete < 80 ? 3 : -6;
      break;
    case "COMEBACKER":
      if (player.comeback_until_day != null && ctx.dayNumber <= player.comeback_until_day) {
        mod += seededRange(`${player.id}:cb`, 10, 18);
      }
      break;
    case "RELIC":
      if (player.active_days <= 30) mod += 5;
      break;
    case "LATE BLOOMER":
      if (player.active_days < 20) mod -= 5;
      else if (player.active_days >= 80) mod += 8;
      else if (player.active_days >= 40) mod += 4;
      break;
    case "GLASS CANNON":
      mod += 4;
      break;
    case "IRON LOSER":
      if (ctx.percentComplete >= 60 && ctx.currentRank >= 7) mod += 4;
      break;
    case "STAR":
      mod += 3;
      break;
    case "GHOST":
      mod += ctx.percentComplete < 70 ? -3 : 6;
      break;
    case "MUTANT":
      mod += seededRange(`${player.id}:mutr`, -3, 3);
      break;
    case "PROFESSIONAL":
      mod += 2;
      break;
    case "FAN FAVORITE":
      mod += player.total_support_received > 10 ? 2 : 0;
      break;
    case "DOOMED":
      if (player.active_days <= 15) mod += 10;
      else mod -= 2;
      break;
    default:
      break;
  }

  return mod;
}

export function getTraitRaceModifier(player: Player, ctx: RaceModifierContext): number {
  let mod = 0;
  if (hasTrait(player, "BRAVE") && ctx.currentRank > 1 && ctx.percentComplete >= 70) mod += 4;
  if (hasTrait(player, "FAST") && ctx.percentComplete < 40) mod += 3;
  if (hasTrait(player, "SLOW") && ctx.percentComplete < 40) mod -= 3;
  if (hasTrait(player, "SLOW") && ctx.percentComplete >= 70) mod += 3;
  if (hasTrait(player, "SLEEPY") && ctx.percentComplete < 35) mod -= 3;
  if (hasTrait(player, "SLEEPY") && ctx.percentComplete >= 75) mod += 3;
  if (hasTrait(player, "FORGOTTEN") && player.comeback_until_day != null) mod += 4;
  if (hasTrait(player, "BORING")) mod += 2;
  if (hasTrait(player, "MAGNETIC")) mod += 1;
  if (hasTrait(player, "ODD")) mod += seededRange(`${player.id}:odd`, -2, 2);
  return mod;
}

export function getChaosRangeMultiplier(player: Player): number {
  let mult = 1;
  const arch = player.archetype as ArchetypeId;
  if (arch === "GAMBLER") mult += 0.4;
  if (arch === "MUTANT") mult += 0.2;
  if (arch === "WORKHORSE") mult -= 0.25;
  if (arch === "PROFESSIONAL") mult -= 0.25;
  if (hasTrait(player, "LOUD")) mult += 0.08;
  if (hasTrait(player, "WET")) mult += 0.1;
  if (hasTrait(player, "DANGEROUS")) mult += 0.12;
  if (hasTrait(player, "SHARP")) mult += 0.1;
  if (hasTrait(player, "FORMAL")) mult -= 0.08;
  if (hasTrait(player, "CALM")) mult -= 0.06;
  return Math.max(0.3, mult);
}

export function getWildSwingMultiplier(player: Player): number {
  let mult = 1;
  if (player.archetype === "WORKHORSE") mult *= 0.75;
  if (player.archetype === "PROFESSIONAL") mult *= 0.75;
  if (player.archetype === "GAMBLER") mult *= 1.15;
  if (hasTrait(player, "LOUD")) mult *= 1.08;
  return mult;
}

export function getBurstChanceMultiplier(player: Player): number {
  let mult = 1;
  const arch = player.archetype as ArchetypeId;
  if (arch === "GAMBLER") mult += 0.25;
  if (arch === "GLASS CANNON") mult += 0.35;
  if (arch === "WORKHORSE") mult -= 0.2;
  if (arch === "PROFESSIONAL") mult -= 0.15;
  if (hasTrait(player, "SHARP")) mult += 0.12;
  if (hasTrait(player, "FORMAL")) mult -= 0.1;
  if (hasTrait(player, "CALM")) mult -= 0.08;
  return Math.max(0.1, mult);
}

export function getCollapseChanceMultiplier(
  player: Player,
  ctx: RaceModifierContext
): number {
  let mult = 1;
  const arch = player.archetype as ArchetypeId;
  if (arch === "GAMBLER") mult += 0.25;
  if (arch === "GLASS CANNON") mult += 0.2;
  if (arch === "WORKHORSE") mult -= 0.25;
  if (arch === "PROFESSIONAL") mult -= 0.2;
  if (arch === "CURSED" && ctx.percentComplete >= 80 && ctx.currentRank === 1) mult += 0.2;
  if (arch === "DOOMED" && player.fatigue > 40) mult += 0.3;
  if (hasTrait(player, "ELEGANT")) mult -= 0.1;
  if (hasTrait(player, "SHARP")) mult += 0.15;
  if (hasTrait(player, "SOFT")) mult -= 0.08;
  if (hasTrait(player, "STUBBORN")) mult -= 0.12;
  return Math.max(0.05, mult);
}

export function getMaxTickDelta(player: Player): number {
  return player.archetype === "GLASS CANNON" ? 5.2 : 4.5;
}

export function getArchetypeFatigueModifier(
  player: Player,
  ctx: { isWinner: boolean; finish: number }
): number {
  let delta = 0;
  const arch = player.archetype as ArchetypeId;
  if (arch === "WORKHORSE") delta -= 1;
  if (arch === "GLASS CANNON") delta += 2;
  if (arch === "DOOMED") delta += 2;
  if (arch === "IRON LOSER") delta -= 1;
  if (hasTrait(player, "GREEDY") && ctx.isWinner) delta += 2;
  if (hasTrait(player, "TIRED")) delta += 1;
  if (hasTrait(player, "FAST")) delta += 1;
  if (hasTrait(player, "SOFT")) delta -= 1;
  if (hasTrait(player, "HUNGRY")) delta += 1;
  return delta;
}

export function getArchetypePressureModifier(
  player: Player,
  ctx: { isWinner: boolean; finish: number; isTop3AllTime: boolean }
): number {
  let delta = 0;
  const arch = player.archetype as ArchetypeId;
  if (arch === "STAR" && ctx.isWinner) delta += 3;
  if (arch === "STAR") delta += 1;
  if (arch === "FAN FAVORITE") delta += 1;
  if (hasTrait(player, "LOUD")) delta += 1;
  if (hasTrait(player, "FAMOUS")) delta += 2;
  if (hasTrait(player, "QUIET")) delta -= 1;
  if (hasTrait(player, "FORGOTTEN")) delta -= 2;
  if (hasTrait(player, "HOLLOW")) delta -= 1;
  if (hasTrait(player, "CALM")) delta -= 1;
  return delta;
}

export function getPressurePenaltyMultiplier(player: Player, percentComplete: number): number {
  let mult = 1;
  const arch = player.archetype as ArchetypeId;
  if (arch === "GAMBLER") mult += 0.1;
  if (arch === "STAR") mult += 0.2;
  if (arch === "CURSED" && percentComplete >= 80) mult += 0.35;
  if (arch === "PROFESSIONAL") mult -= 0.2;
  if (hasTrait(player, "PARANOID")) mult += 0.12;
  if (hasTrait(player, "NERVOUS")) mult += 0.1;
  if (hasTrait(player, "CALM")) mult -= 0.12;
  if (hasTrait(player, "HOLLOW")) mult -= 0.08;
  return Math.max(0.2, mult);
}

export function getArchetypeGrowthChanceBonus(
  player: Player,
  ctx: GrowthModifierContext
): number {
  let bonus = 0;
  const arch = player.archetype as ArchetypeId;
  if (arch === "WORKHORSE") bonus -= 0.05;
  if (arch === "GAMBLER" && (ctx.finish === 1 || ctx.finish === 8)) bonus += 0.1;
  if (arch === "CURSED" && ctx.finish === 8) bonus += 0.15;
  if (arch === "LATE BLOOMER") bonus += 0.2;
  if (arch === "IRON LOSER" && ctx.finish >= 5) bonus += 0.1;
  if (arch === "STAR" && ctx.isWinner) bonus += 0.1;
  if (arch === "GHOST" && player.wins === 0 && player.races >= 20) bonus += 0.1;
  if (arch === "RELIC") bonus -= 0.15;
  if (arch === "DOOMED" && player.active_days <= 30) bonus += 0.1;
  if (arch === "DOOMED" && player.active_days > 50) bonus -= 0.2;
  if (hasTrait(player, "UNLUCKY") && ctx.finish === 8) bonus += 0.06;
  if (hasTrait(player, "LUCKY")) bonus -= 0.04;
  if (hasTrait(player, "HOLLOW")) bonus -= 0.08;
  if (hasTrait(player, "HUNGRY") && ctx.finish >= 6) bonus += 0.06;
  if (hasTrait(player, "ROTTEN")) bonus += 0.04;
  return bonus;
}

export function getPostRaceMutationChance(player: Player): number {
  let chance = 0.06;
  const arch = player.archetype as ArchetypeId;
  if (arch === "MUTANT") chance += 0.3;
  if (arch === "COMEBACKER") chance += 0.05;
  if (hasTrait(player, "ROTTEN")) chance += 0.08;
  if (hasTrait(player, "CLEAN")) chance -= 0.03;
  return Math.min(0.65, Math.max(0.02, chance));
}

export function getHoldingMutationChance(player: Player): number {
  let chance = 0.05;
  const arch = player.archetype as ArchetypeId;
  if (arch === "MUTANT") chance += 0.4;
  if (arch === "COMEBACKER") chance += 0.2;
  if (hasTrait(player, "DUSTY")) chance += 0.03;
  if (hasTrait(player, "ROTTEN")) chance += 0.05;
  if (hasTrait(player, "CLEAN")) chance -= 0.02;
  if (player.signature_stat === "drag") chance += 0.05;
  return Math.min(0.75, Math.max(0.02, chance));
}

export function getMutationDelta(player: Player, seed: string): number {
  const arch = player.archetype as ArchetypeId;
  const positiveBias = arch === "MUTANT" ? 0.75 : 0.85;
  const positive = seededBool(`${seed}:mutsign`, positiveBias);
  return seededInt(`${seed}:mutd`, positive ? 0 : -2, positive ? 3 : 0);
}

export function getDecayChance(player: Player, currentDay: number): number {
  let chance = 0;
  const arch = player.archetype as ArchetypeId;
  if (player.active_days > 60) chance = 0.08;
  if (player.active_days > 120) chance = 0.12;
  if (arch === "RELIC" && player.active_days > 80) chance += 0.15;
  if (arch === "RELIC" && player.active_days > 140) chance += 0.3;
  if (arch === "DOOMED" && player.active_days > 50) chance += 0.25;
  if (arch === "WORKHORSE") chance -= 0.03;
  if (arch === "LATE BLOOMER" && player.active_days < 60) chance -= 0.04;
  if (arch === "GLASS CANNON") chance += 0.06;
  if (hasTrait(player, "ROTTEN")) chance += 0.06;
  if (hasTrait(player, "ANCIENT")) chance += 0.04;
  return Math.min(0.55, Math.max(0, chance));
}

export function getSupportGrowthChanceBonus(player: Player): number {
  let bonus = 0;
  const arch = player.archetype as ArchetypeId;
  if (arch === "FAN FAVORITE") bonus += 0.25;
  if (arch === "LATE BLOOMER") bonus += 0.1;
  if (hasTrait(player, "FAITHFUL")) bonus += 0.1;
  if (hasTrait(player, "USELESS")) bonus += 0.15;
  if (hasTrait(player, "FAMOUS")) bonus += 0.1;
  if (hasTrait(player, "QUIET")) bonus -= 0.05;
  if (hasTrait(player, "COLD")) bonus -= 0.05;
  if (hasTrait(player, "SUSPICIOUS")) bonus -= 0.05;
  return bonus;
}

export function getMaxSupportGainsPerRace(player: Player): number {
  return player.archetype === "FAN FAVORITE" ? 3 : 2;
}

export function getStatGrowthWeights(player: Player): Record<GrowthStat, number> {
  const weights: Record<GrowthStat, number> = {
    grit: 1,
    chaos: 1,
    nerve: 1,
    luck: 1,
    burst: 1,
  };

  const sig = player.signature_stat as GrowthStat;
  if (sig in weights) weights[sig] *= 2;

  const def = ARCHETYPES[player.archetype as ArchetypeId];
  if (def) {
    for (const stat of def.preferredGrowth) {
      if (stat in weights) {
        weights[stat as GrowthStat] *= 1.5;
      }
    }
  }

  if (player.archetype === "GLASS CANNON") {
    weights.burst *= 1.15;
    weights.grit *= 0.9;
    weights.nerve *= 0.9;
  }

  return weights;
}

export function pickWeightedGrowthStat(seed: string, player: Player): GrowthStat {
  const weights = getStatGrowthWeights(player);
  const total = GROWTH_STATS.reduce((sum, s) => sum + weights[s], 0);
  let roll = seededRandom(`${seed}:wg`) * total;
  for (const stat of GROWTH_STATS) {
    roll -= weights[stat];
    if (roll <= 0) return stat;
  }
  return GROWTH_STATS[0];
}

export function pickWeightedAnyStat(seed: string, player: Player): SignatureStat {
  const weights: Record<SignatureStat, number> = {
    grit: 1,
    chaos: 1,
    nerve: 1,
    luck: 1,
    burst: 1,
    drag: player.signature_stat === "drag" ? 1.8 : 0.3,
  };
  const sig = player.signature_stat as SignatureStat;
  weights[sig] *= 2;
  const total = STAT_KEYS.reduce((sum, s) => sum + weights[s], 0);
  let roll = seededRandom(`${seed}:wa`) * total;
  for (const stat of STAT_KEYS) {
    roll -= weights[stat];
    if (roll <= 0) return stat;
  }
  return "grit";
}

export function getSignatureStatGrowthModifier(player: Player, statName: string): number {
  return player.signature_stat === statName ? 2 : 1;
}

export function getHoldingPressureRecovery(player: Player): number {
  let recovery = 2;
  if (hasTrait(player, "FORGOTTEN")) recovery += 1;
  if (player.archetype === "DOOMED") recovery += 1;
  if (player.archetype === "STAR") recovery -= 1;
  return Math.max(0, recovery);
}

export function getHoldingFatigueRecovery(player: Player): number {
  let recovery = 3;
  if (hasTrait(player, "TIRED")) recovery += 1;
  if (player.archetype === "RELIC") recovery += 1;
  return recovery;
}

export function recalculateRatingFromPartial(player: Partial<Player> & Pick<Player, SignatureStat>): number {
  return calculateRating({
    grit: player.grit ?? 0,
    chaos: player.chaos ?? 0,
    nerve: player.nerve ?? 0,
    luck: player.luck ?? 0,
    burst: player.burst ?? 0,
    drag: player.drag ?? 0,
  });
}

/** @deprecated use specific modifier getters */
export function getArchetypeGrowthModifier(player: Player, ctx: GrowthModifierContext): number {
  return getArchetypeGrowthChanceBonus(player, ctx);
}

/** @deprecated use getArchetypeFatigueModifier */
export function getTraitGrowthModifier(_player: Player, _ctx: GrowthModifierContext): number {
  return 0;
}
