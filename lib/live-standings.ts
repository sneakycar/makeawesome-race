import { roundRaceScore } from "./score";
import type { RaceEntryWithPlayer } from "./types";

/** Display score for a standings row (matches home page pip + number). */
export function getEntryDisplayScore(
  entry: RaceEntryWithPlayer,
  liveScore?: number
): number {
  if (entry.is_injured) return roundRaceScore(Number(entry.race_score));
  if (entry.is_fighting) {
    return roundRaceScore(Number(entry.fight_frozen_score ?? entry.race_score));
  }
  return roundRaceScore(liveScore ?? Number(entry.race_score));
}

/** Same rules as server `rankEntries`: healthy by score desc, then injured. */
export function computeLiveRanks(
  entries: RaceEntryWithPlayer[],
  scoreByPlayerId: Map<string, number>
): Map<string, number> {
  const healthy = entries
    .filter((e) => !e.is_injured)
    .sort(
      (a, b) =>
        (scoreByPlayerId.get(b.player_id) ?? 0) - (scoreByPlayerId.get(a.player_id) ?? 0)
    );
  const injured = entries
    .filter((e) => e.is_injured)
    .sort(
      (a, b) =>
        (scoreByPlayerId.get(b.player_id) ?? 0) - (scoreByPlayerId.get(a.player_id) ?? 0)
    );

  const ranks = new Map<string, number>();
  [...healthy, ...injured].forEach((entry, index) => {
    ranks.set(entry.player_id, index + 1);
  });
  return ranks;
}

/** Positive = moved up since last cron snapshot (`last_rank_change` convention). */
export function liveRankDeltaSinceCron(dbRank: number, liveRank: number): number {
  return dbRank - liveRank;
}

export function buildLiveScoreMap(
  entries: RaceEntryWithPlayer[],
  liveScores?: Map<string, { score: number; confirmedScore?: number }>
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const entry of entries) {
    const live = liveScores?.get(entry.player_id);
    scores.set(
      entry.player_id,
      getEntryDisplayScore(entry, live?.score ?? live?.confirmedScore)
    );
  }
  return scores;
}
