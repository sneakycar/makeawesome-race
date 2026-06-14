"use client";

import { useEffect, useState } from "react";
import { getRaceClock } from "./race-clock";
import { isRaceDelayed } from "./race-delay";
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
      const delayOpts =
        state.race.delay_until && state.race.delay_frozen_percent != null
          ? {
              delayUntil: state.race.delay_until,
              frozenPercent: state.race.delay_frozen_percent,
            }
          : null;
      const clock = getRaceClock(
        startedAt,
        endsAt,
        now,
        isRaceDelayed(state.race, now) ? delayOpts : null
      );

      if (clock.phase !== "live" && clock.phase !== "delayed") {
        setSnapshot(null);
        return;
      }

      const entries = liveEntriesById(
        state.race,
        state.entries,
        now,
        new Date(state.serverTime)
      );
      if (!entries) {
        setSnapshot(null);
        return;
      }

      const progress =
        clock.phase === "delayed" && state.race.delay_frozen_percent != null
          ? state.race.delay_frozen_percent
          : calculatePrecisePercentComplete(startedAt, endsAt, now);

      setSnapshot({
        entries,
        raceProgress: progress,
      });
    };

    recompute();
    const id = setInterval(recompute, 100);
    return () => clearInterval(id);
  }, [state, enabled]);

  return snapshot;
}
