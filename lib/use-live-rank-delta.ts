"use client";

import { useMemo } from "react";
import {
  buildLiveScoreMap,
  computeLiveRanks,
  liveRankDeltaSinceCron,
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
      const scores = buildLiveScoreMap(state.entries, liveRace.entries);
      const liveRanks = computeLiveRanks(state.entries, scores);
      for (const entry of state.entries) {
        if (entry.is_injured || entry.is_fighting) continue;
        const liveRank = liveRanks.get(entry.player_id);
        if (liveRank == null) continue;
        const delta = liveRankDeltaSinceCron(entry.current_rank, liveRank);
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
