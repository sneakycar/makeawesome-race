"use client";

import { useEffect, useMemo, useRef } from "react";
import type { LiveRaceSnapshot } from "./use-live-race";
import type { GameStateResponse } from "./types";

/** Rank change since last server update: positive = moved up, negative = moved down. */
export function useLiveRankDelta(
  state: GameStateResponse | null,
  liveRace: LiveRaceSnapshot | null,
  raceActive: boolean
): Map<string, number> {
  const baselineRef = useRef<Map<string, number>>(new Map());
  const serverTimeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state) return;
    if (serverTimeRef.current === state.serverTime) return;
    serverTimeRef.current = state.serverTime;
    const next = new Map<string, number>();
    for (const entry of state.entries) {
      next.set(entry.player_id, entry.current_rank);
    }
    baselineRef.current = next;
  }, [state]);

  return useMemo(() => {
    const deltas = new Map<string, number>();
    if (!state) return deltas;

    for (const entry of state.entries) {
      if (entry.is_injured) continue;
      if (entry.is_fighting) continue;

      const baseline =
        baselineRef.current.get(entry.player_id) ?? entry.current_rank;
      const liveRank = liveRace?.entries.get(entry.player_id)?.current_rank;
      const currentRank = liveRank ?? entry.current_rank;
      const liveDelta = baseline - currentRank;

      if (liveDelta !== 0) {
        deltas.set(entry.player_id, liveDelta);
      } else if (raceActive && entry.last_rank_change !== 0) {
        deltas.set(entry.player_id, entry.last_rank_change);
      }
    }

    return deltas;
  }, [state, liveRace, raceActive]);
}

export function formatRankDelta(delta: number): string | null {
  if (delta > 0) return `▲${delta}`;
  if (delta < 0) return `▼${Math.abs(delta)}`;
  return null;
}
