/** Max +1 taps per visitor per race (24h window). */
export const MAX_VOTES_PER_VISITOR = 6;

/** Minimum gap between taps — spam/bot friction, not a hard daily lock. */
export const VOTE_COOLDOWN_MS = 10 * 60 * 1000;

/** Live race points granted per vote (before caps). */
export const LIVE_SCORE_PER_VOTE = 1;

/** Max live race points one fan can add to today's scoreboard. */
export const MAX_LIVE_SCORE_FROM_FAN = 3;

/** Max live race points all fans combined can add to one racer this race. */
export const MAX_LIVE_SCORE_PER_RACER = 5;

/** Max live race points all fans combined can add across the whole field. */
export const MAX_LIVE_SCORE_RACE_TOTAL = 12;

/** Extra growth roll chance per vote after the first (+2% each, cap +10%). */
export const DEDICATION_GROWTH_BONUS_PER_VOTE = 0.02;
export const DEDICATION_GROWTH_BONUS_CAP = 0.1;

export interface LiveScoreGrantResult {
  granted: number;
  fanTotal: number;
  racerTotal: number;
  raceTotal: number;
}

export function computeLiveScoreGrant(options: {
  fanLiveSoFar: number;
  racerLiveSoFar: number;
  raceLiveSoFar: number;
}): LiveScoreGrantResult {
  const { fanLiveSoFar, racerLiveSoFar, raceLiveSoFar } = options;

  if (fanLiveSoFar >= MAX_LIVE_SCORE_FROM_FAN) {
    return { granted: 0, fanTotal: fanLiveSoFar, racerTotal: racerLiveSoFar, raceTotal: raceLiveSoFar };
  }
  if (racerLiveSoFar >= MAX_LIVE_SCORE_PER_RACER) {
    return { granted: 0, fanTotal: fanLiveSoFar, racerTotal: racerLiveSoFar, raceTotal: raceLiveSoFar };
  }
  if (raceLiveSoFar >= MAX_LIVE_SCORE_RACE_TOTAL) {
    return { granted: 0, fanTotal: fanLiveSoFar, racerTotal: racerLiveSoFar, raceTotal: raceLiveSoFar };
  }

  const fanRoom = MAX_LIVE_SCORE_FROM_FAN - fanLiveSoFar;
  const racerRoom = MAX_LIVE_SCORE_PER_RACER - racerLiveSoFar;
  const raceRoom = MAX_LIVE_SCORE_RACE_TOTAL - raceLiveSoFar;
  const granted = Math.min(LIVE_SCORE_PER_VOTE, fanRoom, racerRoom, raceRoom);

  return {
    granted,
    fanTotal: fanLiveSoFar + granted,
    racerTotal: racerLiveSoFar + granted,
    raceTotal: raceLiveSoFar + granted,
  };
}

export function computeNextVoteAt(lastVoteAt: Date | null, now = new Date()): Date | null {
  if (!lastVoteAt) return null;
  const unlock = new Date(lastVoteAt.getTime() + VOTE_COOLDOWN_MS);
  return unlock > now ? unlock : null;
}

export function isOnVoteCooldown(lastVoteAt: Date | null, now = new Date()): boolean {
  return computeNextVoteAt(lastVoteAt, now) != null;
}
