import { seededRandom } from "./seeded-rng";

export type PlayerGender = "M" | "F";

/** Fixed genders for named roster racers (slug → gender). */
export const PLAYER_GENDER_BY_SLUG: Record<string, PlayerGender> = {
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

/** Seeded M/F for procedurally generated racers. */
export function generateGender(seed: string): PlayerGender {
  return seededRandom(`${seed}:gender`) < 0.5 ? "M" : "F";
}

export function resolvePlayerGender(slug: string, seed: string): PlayerGender {
  return PLAYER_GENDER_BY_SLUG[slug] ?? generateGender(seed);
}

export function formatPlayerGender(gender: PlayerGender | null | undefined): string {
  return gender === "F" ? "F" : "M";
}
