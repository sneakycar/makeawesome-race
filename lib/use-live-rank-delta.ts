"use client";

import { useMemo } from "react";
import type { GameStateResponse } from "./types";

/** Rank change since last server update (from cron `last_rank_change`). */
export function useLiveRankDelta(
  state: GameStateResponse | null,
  raceActive: boolean
): Map<string, number> {
  return useMemo(() => {
    const deltas = new Map<string, number>();
    if (!state || !raceActive) return deltas;

    for (const entry of state.entries) {
      if (entry.is_injured || entry.is_fighting) continue;
      if (entry.last_rank_change !== 0) {
        deltas.set(entry.player_id, entry.last_rank_change);
      }
    }

    return deltas;
  }, [state, raceActive]);
}

export function formatRankDelta(delta: number): string | null {
  if (delta > 0) return `▲${delta}`;
  if (delta < 0) return `▼${Math.abs(delta)}`;
  return null;
}
