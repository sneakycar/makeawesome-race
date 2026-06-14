/** Midpoint winning total — actual outcomes spread ~50–215 via tempo + variance. */
export const TARGET_WINNER_SCORE = 125;
export const MIN_WINNER_SCORE = 50;
/** Soft ceiling — pace math never pushes a racer above this in normal play. */
export const MAX_WINNER_SCORE = 200;
/** Extra leash above the tempo curve at the checkered flag. */
export const PACE_CAP_BUFFER = 15;
/** Natural race ceiling (pace cap at 100%). Always below HARD_SCORE_CAP. */
export const NATURAL_SCORE_CEILING = MAX_WINNER_SCORE + PACE_CAP_BUFFER;
/** Absolute point total — safety rail only; sim pace math stays under this. */
export const HARD_SCORE_CAP = 240;
/** Race row bars: fixed track length; one pip per point, always this many slots. */
export const SCORE_TRACK_SLOTS = HARD_SCORE_CAP;

const scoreFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/** Clamp stored / displayed race points to [0, HARD_SCORE_CAP]. */
export function clampRaceScore(score: number): number {
  return Math.max(0, Math.min(HARD_SCORE_CAP, score));
}

/** Tempo-aware soft cap for a tick (never exceeds NATURAL_SCORE_CEILING). */
export function getPaceCap(
  percentComplete: number,
  raceTempo: number,
  paceLeash: number
): number {
  const expectedScore = (percentComplete / 100) * TARGET_WINNER_SCORE * raceTempo;
  return Math.min(NATURAL_SCORE_CEILING, expectedScore + paceLeash);
}

/** Format a race point total for display (e.g. 135, 1,024). */
export function formatRaceScore(score: number): string {
  return scoreFormatter.format(Math.round(clampRaceScore(score)));
}

/** Per-pip fill: desaturated at low scores, richer saturation as points climb. */
export function getScorePipBackground(index: number, count: number, night = false): string {
  const t = count <= 1 ? 1 : index / (count - 1);
  const sat = Math.round(8 + t * 82);
  const hue = night ? 210 : 225;

  if (night) {
    const top = Math.round(74 - t * 16);
    const mid = Math.round(68 - t * 18);
    const bot = Math.round(62 - t * 20);
    return `linear-gradient(165deg, hsl(${hue} ${sat}% ${top + 4}%) 0%, hsl(${hue} ${sat}% ${mid}%) 45%, hsl(${hue} ${sat}% ${bot}%) 100%)`;
  }

  const top = Math.round(56 - t * 22);
  const mid = Math.round(48 - t * 26);
  const bot = Math.round(40 - t * 28);
  return `linear-gradient(165deg, hsl(${hue} ${sat}% ${top + 4}%) 0%, hsl(${hue} ${sat}% ${mid}%) 45%, hsl(${hue} ${sat}% ${bot}%) 100%)`;
}

export const SCORE_PIP_SLOTS = 20;

/** Filled diagonal pips within the pill (0–SCORE_PIP_SLOTS). */
export function scorePipFillCount(
  points: number,
  minScore: number,
  leaderScore: number,
  slots = SCORE_PIP_SLOTS
): number {
  const min = Math.max(0, Math.round(minScore));
  const leader = Math.max(min, Math.round(leaderScore));
  const pts = Math.max(0, Math.round(points));
  const spread = leader - min;
  if (spread <= 0) return pts > 0 ? slots : 0;
  return Math.max(0, Math.min(slots, Math.round(((pts - min) / spread) * slots)));
}

/** @deprecated use formatRaceScore */
export function formatLiveScore(score: number): string {
  return formatRaceScore(score);
}

/** @deprecated use formatRaceScore */
export function formatStoredScore(score: number): string {
  return formatRaceScore(score);
}

/** @deprecated scores are stored as points, not derived from progress */
export function progressToScore(_progress: number): number {
  return 0;
}
