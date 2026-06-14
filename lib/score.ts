/** Midpoint winning total — typical winners land ~120–190 via week tempo. */
export const TARGET_WINNER_SCORE = 155;
export const MIN_WINNER_SCORE = 30;
/** Hot-tail reference before the once-per-universe god score. */
export const MAX_WINNER_SCORE = 230;
/** Natural ceiling every race — nobody reaches 240 without the god event. */
export const NATURAL_SCORE_MAX = 239;
export const GOD_SCORE = 240;
/** Absolute point total — safety rail + pip track length. */
export const HARD_SCORE_CAP = GOD_SCORE;
/** Race row bars: fixed track length; one pip per point, always this many slots. */
export const SCORE_TRACK_SLOTS = HARD_SCORE_CAP;
/** Sim ticks per race — pip performance bands group this many slots. */
export const RACE_PIP_TICKS = 48;

/** @deprecated use NATURAL_SCORE_MAX */
export const PACE_CAP_BUFFER = 0;
/** @deprecated use NATURAL_SCORE_MAX */
export const NATURAL_SCORE_CEILING = NATURAL_SCORE_MAX;

const scoreFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/** Clamp to the natural race ceiling (239). */
export function clampNaturalRaceScore(score: number): number {
  return Math.max(0, Math.min(NATURAL_SCORE_MAX, score));
}

/** Clamp stored / displayed race points to [0, HARD_SCORE_CAP]. */
export function clampRaceScore(score: number): number {
  return Math.max(0, Math.min(HARD_SCORE_CAP, score));
}

/** Tempo-aware soft cap for a tick (never exceeds NATURAL_SCORE_MAX). */
export function getPaceCap(
  percentComplete: number,
  raceTempo: number,
  paceLeash: number
): number {
  const expectedScore = (percentComplete / 100) * TARGET_WINNER_SCORE * raceTempo;
  return Math.min(NATURAL_SCORE_MAX, expectedScore + paceLeash);
}

/** Round to nearest tenth for stored / live race points. */
export function roundRaceScore(score: number): number {
  return Math.round(clampRaceScore(score) * 10) / 10;
}

const liveRaceScoreFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Live race row label — always one decimal so every row shares the same width. */
export function formatLiveRaceScore(score: number): string {
  return liveRaceScoreFormatter.format(roundRaceScore(score));
}

/** Format a race point total for display (e.g. 135, 1,024). */
export function formatRaceScore(score: number): string {
  return scoreFormatter.format(Math.round(clampRaceScore(score)));
}

/** Smooth left→right fill for the score bar (single layer, no micro-pip ribbing). */
export function getScoreTrackFillGradient(points: number, night = false): string {
  const t = Math.max(0, Math.min(1, points / HARD_SCORE_CAP));
  const hue = night ? 210 : 225;
  const sat = Math.round(12 + t * 76);
  const start = night ? 58 : 42;
  const end = night ? 70 : 52;
  const from = Math.round(start + t * (end - start) * 0.35);
  const to = Math.round(start + t * (end - start));
  return `linear-gradient(90deg, hsl(${hue} ${Math.max(8, sat - 12)}% ${from}%) 0%, hsl(${hue} ${sat}% ${to}%) 100%)`;
}

/** @deprecated race rows use getScoreTrackFillGradient — kept for any legacy callers */
export function getScorePipBackground(index: number, count: number, night = false): string {
  const t = count <= 1 ? 1 : index / (count - 1);
  const sat = Math.round(10 + t * 78);
  const hue = night ? 210 : 225;
  const light = night ? Math.round(64 - t * 12) : Math.round(46 - t * 18);
  return `hsl(${hue} ${sat}% ${light}%)`;
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

/** Fix legacy peaks stored at 10× scale after score corruption. */
export function normalizePeakRaceScore(peak: number, score: number): number {
  const p = Number(peak ?? 0);
  if (p > Math.max(300, score * 2.5)) {
    return Math.max(score, Math.round(p / 10));
  }
  return Math.max(score, Math.round(p));
}
