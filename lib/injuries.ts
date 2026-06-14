import { seededBool, seededInt, seededPick, seededRandom } from "./seeded-rng";
import type { Player, Race, RaceEntry } from "./types";

export const INJURY_SEVERITIES = ["MINOR", "NORMAL", "SEVERE", "DISASTER"] as const;
export type InjurySeverity = (typeof INJURY_SEVERITIES)[number];

export const INJURY_ADJECTIVES = [
  "WET", "STATIC", "BAD LUCK", "PAPER", "DUST", "CHAOS", "SOFT", "HOLLOW", "SAD", "COLD",
  "DANGEROUS", "ROTTEN", "LOUD", "STUBBORN", "BURNING", "ODD", "SLEEPY", "FAMOUS", "GROSS",
  "GLASS", "BRICK", "RADIO", "VOID", "PANCAKE", "WINDOW", "MILK", "UNCLE", "GREEDY", "TIRED",
  "BROKEN", "FAITHFUL", "MAGNETIC", "PALE", "HEAVY", "LIGHT", "WILD", "STILL", "HUNGRY",
  "SHARP", "BORING", "TENDER", "FORMAL", "ELEGANT", "PARANOID", "NERVOUS", "BRAVE", "FAST",
  "SLOW", "CLEAN", "ANCIENT", "NEW", "FORGOTTEN", "USELESS", "POLITE", "RUDE", "PLAIN",
] as const;

export const INJURY_NOUNS = [
  "BONE", "PARKING LOT", "FORKLIFT", "MILK", "RADIO", "VOID", "CHAOS", "BAD LUCK", "STATIC",
  "PAPER", "DUST", "WINDOW", "PANCAKE", "UNCLE", "MEAT", "BHOLE", "BRADY", "NEON", "ARCADE",
  "FOOD COURT", "SKATE PARK", "BOWLING", "LASER TAG", "TOW YARD", "BOILER", "FREIGHT",
] as const;

export const BODY_PARTS = [
  "ANKLE", "RIB", "KNEE", "HIP", "HEAD", "BACK", "SHIN", "ELBOW", "THIGH", "WRIST",
  "FOOT", "SHOULDER", "NECK", "TOE", "HAND", "SPINE", "CALF", "HAMSTRING", "HEEL", "JAW",
  "LUNG", "SPRAIN", "FEVER", "NOISE", "ARM", "LEG", "CHEST", "GUT", "CHIN", "KNUCKLE",
] as const;

export interface InjuryRollContext {
  dayNumber: number;
  raceNumber: number;
  tickNumber: number;
  percentComplete: number;
  currentRank: number;
}

export interface InjurySeverityResult {
  severity: InjurySeverity;
  racesMissed: number;
}

export interface RaceInjuryResult {
  injuryName: string;
  severity: InjurySeverity;
  racesMissed: number;
  injuryNote: string;
}

type InjuryPattern = "ADJ_BODY" | "NOUN_BODY" | "WEIRD";

const PATTERNS: InjuryPattern[] = ["ADJ_BODY", "NOUN_BODY", "WEIRD"];

export function generateInjuryName(seed: string): string {
  const pattern = seededPick(`${seed}:pat`, PATTERNS);
  switch (pattern) {
    case "ADJ_BODY":
      return `${seededPick(`${seed}:adj`, [...INJURY_ADJECTIVES])} ${seededPick(`${seed}:body`, [...BODY_PARTS])}`;
    case "NOUN_BODY":
      return `${seededPick(`${seed}:noun`, [...INJURY_NOUNS])} ${seededPick(`${seed}:body`, [...BODY_PARTS])}`;
    case "WEIRD": {
      const variant = seededInt(`${seed}:weird`, 0, 2);
      if (variant === 0) return `${seededPick(`${seed}:adj`, [...INJURY_ADJECTIVES])} ${seededPick(`${seed}:noun`, [...INJURY_NOUNS])}`;
      if (variant === 1) return `${seededPick(`${seed}:body`, [...BODY_PARTS])} ${seededPick(`${seed}:noun`, [...INJURY_NOUNS])}`;
      return `${seededPick(`${seed}:adj`, [...INJURY_ADJECTIVES])} ${seededPick(`${seed}:body`, [...BODY_PARTS])} ${seededPick(`${seed}:noun`, [...INJURY_NOUNS])}`;
    }
    default:
      return `WET ANKLE`;
  }
}

export function rollInjurySeverity(seed: string, player: Player): InjurySeverityResult {
  const roll = seededRandom(`${seed}:sev`);
  let severity: InjurySeverity;
  if (roll < 0.55) severity = "MINOR";
  else if (roll < 0.88) severity = "NORMAL";
  else if (roll < 0.98) severity = "SEVERE";
  else severity = "DISASTER";

  if ((player.traits as string[]).includes("SOFT") && severity !== "MINOR") {
    const down: Record<InjurySeverity, InjurySeverity> = {
      DISASTER: "SEVERE",
      SEVERE: "NORMAL",
      NORMAL: "MINOR",
      MINOR: "MINOR",
    };
    severity = down[severity];
  }

  let racesMissed: number;
  switch (severity) {
    case "MINOR":
      racesMissed = 1;
      break;
    case "NORMAL":
      racesMissed = seededInt(`${seed}:dur`, 2, 4);
      break;
    case "SEVERE":
      racesMissed = seededInt(`${seed}:dur`, 5, 10);
      break;
    case "DISASTER":
      racesMissed = seededInt(`${seed}:dur`, 14, 30);
      break;
  }

  return { severity, racesMissed };
}

function hasTrait(player: Player, trait: string): boolean {
  return (player.traits as string[]).includes(trait);
}

function archetypeMult(player: Player, ctx: InjuryRollContext): number {
  const arch = player.archetype;
  let mult = 1;
  switch (arch) {
    case "WORKHORSE":
      mult *= 0.75;
      break;
    case "PROFESSIONAL":
      mult *= 0.8;
      break;
    case "GLASS CANNON":
      mult *= 1.35;
      break;
    case "DOOMED":
      mult *= 1.3;
      break;
    case "GAMBLER":
      mult *= 1.15;
      break;
    case "MUTANT":
      mult *= 1.15;
      break;
    case "RELIC":
      if (player.active_days > 80) mult *= 1.2;
      break;
    case "IRON LOSER":
      mult *= 0.9;
      break;
    case "STAR":
      if (player.pressure > 40) mult *= 1.1;
      break;
    case "CURSED":
      if (ctx.currentRank === 1 && ctx.percentComplete >= 70) mult *= 1.2;
      break;
    case "GHOST":
      mult *= 0.9;
      break;
    default:
      break;
  }
  return mult;
}

function traitMult(player: Player, ctx: InjuryRollContext): number {
  let mult = 1;
  if (hasTrait(player, "BROKEN")) mult *= 1.2;
  if (hasTrait(player, "TIRED")) mult *= 1.15;
  if (hasTrait(player, "WET")) mult *= 1.1;
  if (hasTrait(player, "ROTTEN")) mult *= 1.1;
  if (hasTrait(player, "STUBBORN")) mult *= 0.9;
  if (hasTrait(player, "CLEAN")) mult *= 0.9;
  if (hasTrait(player, "DANGEROUS")) mult *= 1.1;
  if (hasTrait(player, "CALM")) mult *= 0.95;
  if (hasTrait(player, "NERVOUS")) mult *= 1.05;
  if (hasTrait(player, "BRAVE") && ctx.percentComplete >= 80) mult *= 1.05;
  return mult;
}

export function calculateInjuryChance(
  player: Player,
  entry: Pick<RaceEntry, "is_injured">,
  ctx: InjuryRollContext
): number {
  if (entry.is_injured) return 0;
  if (player.status !== "active") return 0;
  if (ctx.percentComplete <= 10) return 0;

  let chance =
    0.0025 +
    player.fatigue * 0.00006 +
    player.drag * 0.000025 +
    player.chaos * 0.000015 -
    player.grit * 0.000015 -
    player.nerve * 0.00001;

  chance *= archetypeMult(player, ctx);
  chance *= traitMult(player, ctx);

  return Math.max(0.0005, Math.min(0.025, chance));
}

export function shouldInjure(seed: string, chance: number): boolean {
  return seededBool(seed, chance);
}

export function rollRaceInjury(
  race: Pick<Race, "id">,
  player: Player,
  ctx: InjuryRollContext
): RaceInjuryResult {
  const nameSeed = `${race.id}:${player.id}:${ctx.tickNumber}:injury-name`;
  const sevSeed = `${race.id}:${player.id}:${ctx.tickNumber}:injury-severity`;
  const injuryName = generateInjuryName(nameSeed);
  const { severity, racesMissed } = rollInjurySeverity(sevSeed, player);
  const injuryNote =
    severity === "DISASTER"
      ? "CATASTROPHIC INJURY"
      : severity === "SEVERE"
        ? "SEVERE INJURY"
        : "INJURED";
  return { injuryName, severity, racesMissed, injuryNote };
}

export function getRecoveryMutationChance(player: Player): number {
  let chance = 0.2;
  if (player.archetype === "MUTANT") chance += 0.25;
  if (hasTrait(player, "ROTTEN")) chance += 0.1;
  if (hasTrait(player, "BROKEN")) chance += 0.05;
  return Math.min(0.65, chance);
}

export function getRecoveryPositiveChance(player: Player): number {
  let chance = 0.7;
  if (player.archetype === "COMEBACKER") chance += 0.15;
  if (hasTrait(player, "BROKEN")) chance += 0.15;
  if (player.archetype === "RELIC") chance -= 0.15;
  if (player.archetype === "DOOMED") chance -= 0.15;
  if (player.archetype === "GLASS CANNON") chance -= 0.1;
  if (player.archetype === "WORKHORSE") chance -= 0.1;
  return Math.max(0.15, Math.min(0.95, chance));
}

export function getSupportRecoveryBonus(player: Player): number {
  let bonus = 0;
  if (hasTrait(player, "FAITHFUL")) bonus += 0.05;
  if (player.archetype === "FAN FAVORITE") bonus += 0.05;
  return bonus;
}
