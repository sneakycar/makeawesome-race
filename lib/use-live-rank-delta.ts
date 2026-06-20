"use client";

import { useMemo } from "react";
import {
  buildLiveAnimatedScoreMap,
  buildLiveHardenedScoreMap,
  computeLiveRanks,
} from "./live-standings";
import type { LiveRaceSnapshot } from "./use-live-race";
import type { GameStateResponse } from "./types";

/** Rank change since last cron tick — uses live rank when available. */
export function useLiveRankDelta(
  state: GameStateResponse | null,
  raceActive: boolean,
  liveRace: LiveRaceSnapshot | null
): Map<string, number> {
  return useMemo(() => {
    const deltas = new Map<string, number>();
    if (!state || !raceActive) return deltas;

    if (liveRace) {
      const animatedScores = buildLiveAnimatedScoreMap(
        state.entries,
        liveRace.entries
      );
      const hardenedScores = buildLiveHardenedScoreMap(
        state.entries,
        liveRace.entries
      );
      const animatedRanks = computeLiveRanks(state.entries, animatedScores);
      const baselineRanks = computeLiveRanks(state.entries, hardenedScores);
      const inSegment = liveRace.segmentProgress < 1;

      for (const entry of state.entries) {
        if (entry.is_injured || entry.is_fighting) continue;
        const tickDelta = Number(entry.last_rank_change ?? 0);
        const baselineRank = baselineRanks.get(entry.player_id);
        const rankFromHardened =
          baselineRank != null ? baselineRank - entry.current_rank : 0;
        let delta = tickDelta !== 0 ? tickDelta : rankFromHardened;

        if (inSegment) {
          const animatedRank = animatedRanks.get(entry.player_id);
          if (animatedRank != null && baselineRank != null) {
            const segmentDelta = baselineRank - animatedRank;
            if (segmentDelta !== 0) delta = segmentDelta;
          }
        }

        if (delta !== 0) deltas.set(entry.player_id, delta);
      }
      return deltas;
    }

    for (const entry of state.entries) {
      if (entry.is_injured || entry.is_fighting) continue;
      if (entry.last_rank_change !== 0) {
        deltas.set(entry.player_id, entry.last_rank_change);
      }
    }

    return deltas;
  }, [state, raceActive, liveRace]);
}

export function formatRankDelta(delta: number): string | null {
  if (delta > 0) return `▲${delta}`;
  if (delta < 0) return `▼${Math.abs(delta)}`;
  return null;
}
