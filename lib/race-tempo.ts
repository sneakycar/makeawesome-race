import { seededRange } from "./seeded-rng";

/**
 * Per-race week tempo — scales the whole field together.
 * ~120–190 most nights; linear tails toward 50 and 230; rare 30 / 239 ceilings.
 */
export function getRaceWeekTempo(raceId: string): number {
  const roll = seededRange(`${raceId}:week-tempo`, 0, 1);

  if (roll < 0.04) {
    return seededRange(`${raceId}:week-tempo-freeze`, 0.19, 0.32);
  }
  if (roll < 0.12) {
    return seededRange(`${raceId}:week-tempo-cold`, 0.32, 0.77);
  }
  if (roll < 0.88) {
    return seededRange(`${raceId}:week-tempo-normal`, 0.77, 1.23);
  }
  if (roll < 0.96) {
    return seededRange(`${raceId}:week-tempo-hot`, 1.23, 1.48);
  }
  return seededRange(`${raceId}:week-tempo-insane`, 1.48, 1.54);
}

/** Small per-racer modifier within a shared race week. */
export function getPlayerRaceTempo(raceId: string, playerId: string): number {
  return seededRange(`${raceId}:${playerId}:player-tempo`, 0.93, 1.07);
}

export function getCombinedRaceTempo(raceId: string, playerId: string): number {
  return getRaceWeekTempo(raceId) * getPlayerRaceTempo(raceId, playerId);
}
