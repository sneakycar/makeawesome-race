"use client";

import { useEffect, useState } from "react";
import { getRaceClock } from "./race-clock";
import {
  calculatePrecisePercentComplete,
  liveEntriesById,
  type LiveEntryState,
} from "./live-progress";
import type { GameStateResponse } from "./types";

export interface LiveRaceSnapshot {
  entries: Map<string, LiveEntryState>;
  raceProgress: number;
}

export function useLiveRace(
  state: GameStateResponse | null,
  enabled: boolean
): LiveRaceSnapshot | null {
  const [snapshot, setSnapshot] = useState<LiveRaceSnapshot | null>(null);

  useEffect(() => {
    if (!state || !enabled || state.race.status !== "active") {
      setSnapshot(null);
      return;
    }

    const recompute = () => {
      const startedAt = new Date(state.race.started_at);
      const endsAt = new Date(state.race.ends_at);
      const now = new Date();
      const clock = getRaceClock(startedAt, endsAt, now);

      if (clock.phase !== "live") {
        setSnapshot(null);
        return;
      }

      const entries = liveEntriesById(state.race, state.entries, now);
      if (!entries) {
        setSnapshot(null);
        return;
      }

      setSnapshot({
        entries,
        raceProgress: calculatePrecisePercentComplete(startedAt, endsAt, now),
      });
    };

    recompute();
    const id = setInterval(recompute, 1000);
    return () => clearInterval(id);
  }, [state, enabled]);

  return snapshot;
}
