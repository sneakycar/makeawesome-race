import { getRaceWeekTempo } from "./race-tempo";
import {
  clampNaturalRaceScore,
  GOD_SCORE,
  NATURAL_SCORE_MAX,
} from "./score";

export interface GodScoreResult {
  score: number;
  godScoreGranted: boolean;
}

/**
 * First time a winner naturally peaks at 239 on an insane week, god pushes to 240.
 * Only happens once per universe (tracked in game_state).
 */
export function resolveWinnerRaceScore(
  rawScore: number,
  raceId: string,
  godScoreAwarded: boolean
): GodScoreResult {
  const natural = clampNaturalRaceScore(Math.round(rawScore));

  if (
    !godScoreAwarded &&
    natural >= NATURAL_SCORE_MAX &&
    getRaceWeekTempo(raceId) >= 1.45
  ) {
    return { score: GOD_SCORE, godScoreGranted: true };
  }

  return { score: natural, godScoreGranted: false };
}
