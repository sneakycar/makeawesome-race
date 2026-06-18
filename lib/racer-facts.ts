import type { Player, RaceEntry } from "./types";
import { resolvePlayerGender } from "./player-gender";
import { pickGatedRacerFact } from "./racer-fact-grammar-gate";

export interface RacerFactResult {
  title: string;
  playerName: string;
  fact: string;
  category: string;
}

export function generateRacerFact(
  player: Player,
  _raceEntry: RaceEntry,
  seed: string
): RacerFactResult {
  const gender = player.gender ?? resolvePlayerGender(player.slug, player.seed);
  const fact = pickGatedRacerFact(`${seed}:${player.id}:${player.slug}`, gender);

  return {
    title: "RACER FACT",
    playerName: player.name,
    fact,
    category: "confessional",
  };
}
