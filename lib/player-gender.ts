import { seededRandom } from "./seeded-rng";
import type { PlayerGender } from "./player-gender-types";

export type { PlayerGender } from "./player-gender-types";

/** Fixed genders for named B3S racers (slug → gender). */
export const PLAYER_GENDER_BY_SLUG: Record<string, PlayerGender> = {
  // Female
  kara: "F",
  corsakti: "F",
  emily: "F",
  sam: "F",
  nicole: "F",
  // Male — seed roster
  gerald: "M",
  rob: "M",
  danz: "M",
  tacosaurus: "M",
  daven23: "M",
  // Legacy names (retired)
  walhof: "M",
  "jon-penn": "M",
  chrisman: "M",
  "chris-vogel": "M",
  ace: "M",
  bhole: "M",
  pal: "M",
  noah: "M",
  kimber: "M",
  lacie: "M",
  uncle: "M",
};

/** Seeded M/F for legacy procedural name generation only. */
export function generateGender(seed: string): PlayerGender {
  return seededRandom(`${seed}:gender`) < 0.5 ? "M" : "F";
}

/** B3S league default — male unless listed above. */
export function resolvePlayerGender(slug: string, seed?: string): PlayerGender {
  if (slug in PLAYER_GENDER_BY_SLUG) return PLAYER_GENDER_BY_SLUG[slug]!;
  return seed ? generateGender(seed) : "M";
}

export function formatPlayerGender(gender: PlayerGender | null | undefined): string {
  return gender === "F" ? "F" : "M";
}

/** Rewrite male-default confessional copy for female racers. */
export function adaptRacerFactForGender(
  fact: string,
  gender: PlayerGender | null | undefined
): string {
  if (gender !== "F") return fact;

  return fact
    .replace(/\bhe'd\b/g, "she'd")
    .replace(/\bhe's\b/g, "she's")
    .replace(/\bHe's\b/g, "She's")
    .replace(/\bHe'd\b/g, "She'd")
    .replace(/\bhimself\b/g, "herself")
    .replace(/\bHimself\b/g, "Herself")
    .replace(/\bhis\b/g, "her")
    .replace(/\bHis\b/g, "Her")
    .replace(/\bhim\b/g, "her")
    .replace(/\bHim\b/g, "Her")
    .replace(/\bhe\b/g, "she")
    .replace(/\bHe\b/g, "She")
    .replace(/\bmen\b/g, "women")
    .replace(/\bMen\b/g, "Women")
    .replace(/\bman\b/g, "woman")
    .replace(/\bMan\b/g, "Woman");
}
