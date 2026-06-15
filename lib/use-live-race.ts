"use client";

import { useEffect, useState } from "react";
import { getRaceClock } from "./race-clock";
import { isRaceDelayed } from "./race-delay";
import {
  getCronSegmentProgress,
  getRollingTickAnimationState,
  type RollingTickAnimationState,
} from "./hybrid-live-score";
import { calculatePrecisePercentComplete } from "./live-progress";
import type { GameStateResponse } from "./types";

export interface LiveEntryState extends RollingTickAnimationState {
  player_id: string;
}

export interface LiveRaceSnapshot {
  entries: Map<string, LiveEntryState>;
  raceProgress: number;
  segmentProgress: number;
}

/** Progress through the current 15m cron window since the last tick write. */
function getSegmentProgress(lastTickAt: string | null, now: Date): number {
  return getCronSegmentProgress(lastTickAt, now);
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

      const segmentProgress = getSegmentProgress(
        state.gameState.last_tick_at,
        now
      );
      const entries = new Map<string, LiveEntryState>();

      for (const entry of state.entries) {
        if (entry.is_injured || entry.is_fighting) {
          const frozen = Math.max(
            0,
            Number(entry.fight_frozen_score ?? entry.race_score)
          );
          entries.set(entry.player_id, {
            player_id: entry.player_id,
            score: frozen,
            confirmedScore: frozen,
            hardenedScore: frozen,
            recentDeltas: [],
            segmentProgress: 1,
            animatingDelta: 0,
          });
          continue;
        }

        const lastDelta = Number(entry.last_delta ?? 0);
        const deltas = Math.abs(lastDelta) > 0.001 ? [lastDelta] : [];
        const rolling = getRollingTickAnimationState(
          Number(entry.race_score),
          deltas,
          segmentProgress
        );

        entries.set(entry.player_id, {
          player_id: entry.player_id,
          ...rolling,
        });
      }

      const progress =
        clock.phase === "delayed" && state.race.delay_frozen_percent != null
          ? state.race.delay_frozen_percent
          : calculatePrecisePercentComplete(startedAt, endsAt, now);

      setSnapshot({
        entries,
        raceProgress: progress,
        segmentProgress,
      });
    };

    recompute();
    const id = setInterval(recompute, 100);
    return () => clearInterval(id);
  }, [state, enabled]);

  return snapshot;
}
