import { getLaneProfile } from "./lanes";
import { calculatePlayerOvr } from "./ovr";
import { seededRange } from "./seeded-rng";
import type { OvrRanking, RaceEntryWithPlayer } from "./types";

export interface LiveOddsLine {
  playerId: string;
  name: string;
  slug: string;
  rank: number;
  american: string;
  impliedPct: number;
  isFavorite: boolean;
}

/** Bookie superstitions — not simulation truth. */
const ARCHETYPE_HYPE: Record<string, number> = {
  STAR: 5.5,
  GAMBLER: 2.8,
  "GLASS CANNON": 1.6,
  DOOMED: 1.2,
  GHOST: 0.8,
  COMEBACKER: -0.4,
  "FAN FAVORITE": 1.4,
  PROFESSIONAL: -1.2,
  WORKHORSE: -2.4,
  "IRON LOSER": -3.8,
  CURSED: -1.8,
  RELIC: 0.6,
  "LATE BLOOMER": 0.2,
  MUTANT: 1.0,
};

/** How the grimy book misreads surface traits. */
function traitBookieRead(trait: string): number {
  switch (trait) {
    case "LUCKY":
      return 2.2;
    case "UNLUCKY":
      return 1.4; // book thinks the curse is due to flip
    case "DANGEROUS":
      return 1.8;
    case "FAMOUS":
      return 1.6;
    case "FORGOTTEN":
      return -1.2;
    case "BRAVE":
      return 0.9;
    case "NERVOUS":
      return -0.6;
    case "CALM":
      return 0.4;
    case "FAST":
      return 1.1;
    case "SLOW":
      return -0.8;
    case "HUNGRY":
      return 0.7;
    case "TIRED":
      return -1.4;
    case "SLEEPY":
      return -1.1;
    case "BORING":
      return -2.2; // book sleeps on them
    case "WILD":
      return 1.3;
    case "ODD":
      return 0.5;
    case "MAGNETIC":
      return 1.0;
    case "FAITHFUL":
      return -0.3;
    case "USELESS":
      return -2.6;
    case "ANCIENT":
      return -0.9;
    case "NEW":
      return 0.8;
    default:
      return seededRange(`trait:${trait}:book`, -0.35, 0.35);
  }
}

function sketchyRoundLine(american: number): number {
  const abs = Math.abs(american);
  if (abs >= 2500) return Math.round(abs / 250) * 250;
  if (abs >= 1000) return Math.round(abs / 100) * 100;
  if (abs >= 400) return Math.round(abs / 50) * 50;
  if (abs >= 150) return Math.round(abs / 25) * 25;
  return Math.round(abs / 10) * 10;
}

function formatAmerican(probability: number): string {
  const p = Math.max(0.015, Math.min(0.985, probability));
  let american: number;
  if (p >= 0.5) {
    american = -sketchyRoundLine((p / (1 - p)) * 100);
  } else {
    american = sketchyRoundLine(((1 - p) / p) * 100);
  }
  return american > 0 ? `+${american}` : `${american}`;
}

function bookiePower(
  raceId: string,
  dayNumber: number,
  percentComplete: number,
  entry: RaceEntryWithPlayer,
  leaderScore: number,
  liveScore: number,
  liveRank: number,
  ovr?: OvrRanking
): number {
  const player = entry.player;
  let power = 0;

  // Book trusts position — but not enough to nuke the board.
  power += (9 - liveRank) * 1.85;
  power += liveScore * 0.034;

  const gap = leaderScore - liveScore;
  power -= gap * 0.062;

  if (ovr) {
    power += (ovr.ovr - 52) * 0.11;
    if (ovr.rank <= 2) power += 1.8;
    if (ovr.rank >= 7) power -= 1.2;
  } else {
    power += (calculatePlayerOvr(player) - 52) * 0.09;
  }

  power += ARCHETYPE_HYPE[player.archetype] ?? 0;
  for (const trait of player.traits) {
    power += traitBookieRead(trait);
  }

  // Overweights signature stat, ignores drag half the time.
  const sig = player.signature_stat as keyof typeof player;
  if (typeof player[sig] === "number") {
    power += (player[sig] as number) * 0.11;
  }
  power += player.grit * 0.035 + player.burst * 0.04 + player.luck * 0.03;
  power -= player.drag * 0.018;

  // Lane myth — pole overweighted, outside undervalued until late.
  const lane = getLaneProfile(entry.lane);
  power += lane.bonus * 140;
  if (entry.lane <= 2) power += 1.6;
  if (entry.lane >= 7) power -= 0.8;

  // Recency chasing.
  power += entry.last_rank_change * 1.05;
  power += Math.max(0, Number(entry.last_delta) - 0.5) * 0.35;

  // Career narrative noise.
  if (player.wins >= 2) power += 1.1;
  if (player.current_streak_type === "win") power += player.current_streak_count * 0.45;
  if (player.current_streak_type === "lose") power -= player.current_streak_count * 0.25;
  if (player.total_support_received > 0) power += Math.min(2.2, player.total_support_received * 0.35);

  // Status misreads.
  if (entry.is_injured) power -= 5.5;
  else if (entry.is_fighting) power -= 2.2;

  if (player.archetype === "STAR") power -= player.pressure * 0.12;
  if (player.archetype === "GAMBLER" && liveRank >= 5) power += 2.4;
  if (player.archetype === "COMEBACKER" && liveRank >= 6) power += 1.8;
  if (player.archetype === "DOOMED" && percentComplete > 55) power -= 2.5;

  // Leader bonus scales with margin — small early leads stay bettable.
  if (liveRank === 1) {
    const margin = Math.max(0, leaderScore - liveScore);
    power += Math.min(2.4, margin * 0.22);
    if (percentComplete > 45) power += Math.min(1.6, (percentComplete - 45) * 0.025);
  }

  // Late race — book clings to pre-race chalk, but only deep in the race.
  if (percentComplete > 72 && liveRank > 3) {
    power -= (percentComplete - 72) * 0.05;
  }

  // Seeded drift so lines move without being oracle-accurate.
  power += seededRange(`${raceId}:${dayNumber}:${player.id}:book`, -2.8, 2.8);

  return power;
}

function scoreRankPrior(
  liveRank: number,
  liveScore: number,
  leaderScore: number,
  fieldSize: number
): number {
  const rankFactor = Math.pow((fieldSize - liveRank + 1) / fieldSize, 1.35);
  const scoreFactor = liveScore / Math.max(leaderScore, liveScore, 1);
  return rankFactor * 0.58 + scoreFactor * 0.42;
}

function softmaxTemperature(percentComplete: number, fieldSize: number): number {
  // Hotter early / larger fields — stops one leader from eating 100% of the book.
  const earlyBoost = (1 - percentComplete / 100) * 4.5;
  const fieldBoost = Math.max(0, fieldSize - 6) * 0.35;
  return 8.5 + earlyBoost + fieldBoost;
}

function capFavoriteShare(implied: number[], favoriteIdx: number, percentComplete: number): number[] {
  const maxShare = Math.min(0.9, 0.42 + percentComplete * 0.0045);
  if (implied[favoriteIdx]! <= maxShare) return implied;

  const capped = [...implied];
  const excess = capped[favoriteIdx]! - maxShare;
  capped[favoriteIdx] = maxShare;

  const restIdx = capped.map((_, i) => i).filter((i) => i !== favoriteIdx);
  const restSum = restIdx.reduce((sum, i) => sum + capped[i]!, 0);
  if (restSum <= 0) {
    const each = (1 - maxShare) / restIdx.length;
    for (const i of restIdx) capped[i] = each;
    return capped;
  }

  for (const i of restIdx) {
    capped[i] = capped[i]! + excess * (capped[i]! / restSum);
  }
  return capped;
}

function applyBookieJuice(fair: number[]): number[] {
  return fair.map((p) => {
    if (p >= 0.22) return p * 1.07;
    if (p <= 0.06) return p * 0.78;
    return p * 0.96;
  });
}

/**
 * Grimy in-play odds from rank, stats, traits, and bad bookie heuristics.
 * Roughly plausible, intentionally imperfect.
 */
export function calculateLiveOdds(
  raceId: string,
  dayNumber: number,
  percentComplete: number,
  entries: RaceEntryWithPlayer[],
  scoresByPlayerId: Map<string, number>,
  ranksByPlayerId: Map<string, number>,
  ovrByPlayerId: Record<string, OvrRanking>
): LiveOddsLine[] {
  if (entries.length === 0) return [];

  const leaderScore = Math.max(
    ...entries.map((e) => scoresByPlayerId.get(e.player_id) ?? Number(e.race_score))
  );

  const powers = entries.map((entry) => {
    const liveScore = scoresByPlayerId.get(entry.player_id) ?? Number(entry.race_score);
    const liveRank = ranksByPlayerId.get(entry.player_id) ?? entry.current_rank;
    return bookiePower(
      raceId,
      dayNumber,
      percentComplete,
      entry,
      leaderScore,
      liveScore,
      liveRank,
      ovrByPlayerId[entry.player_id]
    );
  });

  const temperature = softmaxTemperature(percentComplete, entries.length);
  const maxPower = Math.max(...powers);
  const expPowers = powers.map((p) => Math.exp((p - maxPower) / temperature));
  const modelSum = expPowers.reduce((a, b) => a + b, 0);
  const modelFair = expPowers.map((e) => e / modelSum);

  const priors = entries.map((entry) => {
    const liveScore = scoresByPlayerId.get(entry.player_id) ?? Number(entry.race_score);
    const liveRank = ranksByPlayerId.get(entry.player_id) ?? entry.current_rank;
    return scoreRankPrior(liveRank, liveScore, leaderScore, entries.length);
  });
  const priorSum = priors.reduce((a, b) => a + b, 0);
  const priorFair = priors.map((p) => p / priorSum);

  const priorWeight = 0.38 + (1 - percentComplete / 100) * 0.12;
  const fair = modelFair.map((p, i) => p * (1 - priorWeight) + priorFair[i]! * priorWeight);

  const juiced = applyBookieJuice(fair);
  const juicedSum = juiced.reduce((a, b) => a + b, 0);
  let implied = juiced.map((p) => p / juicedSum);

  const favoriteIdx = implied.indexOf(Math.max(...implied));
  implied = capFavoriteShare(implied, favoriteIdx, percentComplete);

  const lines = entries.map((entry, i) => ({
    playerId: entry.player_id,
    name: entry.player.name,
    slug: entry.player.slug,
    rank: ranksByPlayerId.get(entry.player_id) ?? entry.current_rank,
    american: formatAmerican(implied[i]),
    impliedPct: Math.round(implied[i] * 1000) / 10,
    isFavorite: false,
  }));

  lines.sort((a, b) => b.impliedPct - a.impliedPct || a.rank - b.rank);
  if (lines.length > 0) lines[0].isFavorite = true;

  return lines;
}
