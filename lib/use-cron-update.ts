"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  pickTickBurstHeadline,
  shouldPlayTickBurst,
} from "./tick-burst-headline";
import {
  TICK_BURST_EXPLODE_MS,
  TICK_BURST_HOLD_MS,
  TICK_BURST_RIP_MS,
  TICK_BURST_STAMP_MS,
} from "./tick-burst-timing";
import { getMsUntilNextUpdate } from "./race-clock";
import { vibrateTickBurst } from "./nope-feedback";
import { playTickBurstSound } from "./tick-burst-sound";
import type { GameStateResponse } from "./types";

export type TickBurstPhase = "rip" | "stamp" | "hold" | "explode";

export interface TickBurst {
  phase: TickBurstPhase;
  headline: string;
}

const CRON_RETRY_MS = 2500;
const BACKGROUND_REFRESH_MS = 15_000;

export interface CronUpdateOptions {
  getPrevState: () => GameStateResponse | null;
  onApplyState: (state: GameStateResponse) => void;
}

export function useCronUpdate(
  fetchState: () => Promise<GameStateResponse | null>,
  options: CronUpdateOptions
) {
  const [nextUpdateMs, setNextUpdateMs] = useState(() => getMsUntilNextUpdate());
  const [tickBurst, setTickBurst] = useState<TickBurst | null>(null);
  const fetchStateRef = useRef(fetchState);
  const optionsRef = useRef(options);
  const pendingStateRef = useRef<GameStateResponse | null>(null);
  const burstTimersRef = useRef<number[]>([]);
  const burstActiveRef = useRef(false);
  const seenTickAtRef = useRef<string | null>(null);

  fetchStateRef.current = fetchState;
  optionsRef.current = options;

  const markSeenTickAt = useCallback((lastTickAt: string | null | undefined) => {
    seenTickAtRef.current = lastTickAt ?? null;
  }, []);

  const clearBurstTimers = useCallback(() => {
    for (const id of burstTimersRef.current) {
      window.clearTimeout(id);
    }
    burstTimersRef.current = [];
  }, []);

  const applyPendingState = useCallback(() => {
    const pending = pendingStateRef.current;
    if (pending) {
      optionsRef.current.onApplyState(pending);
      pendingStateRef.current = null;
    }
  }, []);

  const finishBurst = useCallback(() => {
    clearBurstTimers();
    burstActiveRef.current = false;
    applyPendingState();
    setTickBurst(null);
  }, [applyPendingState, clearBurstTimers]);

  const startBurst = useCallback(
    (headline: string, next: GameStateResponse) => {
      clearBurstTimers();
      pendingStateRef.current = next;
      burstActiveRef.current = true;
      markSeenTickAt(next.gameState.last_tick_at);
      vibrateTickBurst();
      playTickBurstSound();
      setTickBurst({ phase: "rip", headline });

      burstTimersRef.current.push(
        window.setTimeout(() => {
          applyPendingState();
          setTickBurst((current) =>
            current ? { ...current, phase: "stamp" } : null
          );
        }, TICK_BURST_RIP_MS)
      );

      burstTimersRef.current.push(
        window.setTimeout(() => {
          setTickBurst((current) =>
            current ? { ...current, phase: "hold" } : null
          );
        }, TICK_BURST_RIP_MS + TICK_BURST_STAMP_MS)
      );

      burstTimersRef.current.push(
        window.setTimeout(() => {
          setTickBurst((current) =>
            current ? { ...current, phase: "explode" } : null
          );
        }, TICK_BURST_RIP_MS + TICK_BURST_STAMP_MS + TICK_BURST_HOLD_MS)
      );

      burstTimersRef.current.push(
        window.setTimeout(() => {
          finishBurst();
        },
        TICK_BURST_RIP_MS +
          TICK_BURST_STAMP_MS +
          TICK_BURST_HOLD_MS +
          TICK_BURST_EXPLODE_MS)
      );
    },
    [clearBurstTimers, finishBurst, applyPendingState, markSeenTickAt]
  );

  const runUpdate = useCallback(async () => {
    const prev = optionsRef.current.getPrevState();
    const next = await fetchStateRef.current();
    if (!next) return;

    const nextTickAt = next.gameState.last_tick_at ?? null;

    if (!prev) {
      markSeenTickAt(nextTickAt);
      optionsRef.current.onApplyState(next);
      return;
    }

    const tickAdvanced =
      shouldPlayTickBurst(prev, next) &&
      nextTickAt != null &&
      nextTickAt !== seenTickAtRef.current;

    if (tickAdvanced) {
      startBurst(pickTickBurstHeadline(prev, next), next);
    } else if (!burstActiveRef.current) {
      markSeenTickAt(nextTickAt);
      optionsRef.current.onApplyState(next);
    } else {
      pendingStateRef.current = next;
    }

    window.setTimeout(async () => {
      const retry = await fetchStateRef.current();
      if (!retry) return;
      if (burstActiveRef.current) {
        pendingStateRef.current = retry;
        return;
      }
      markSeenTickAt(retry.gameState.last_tick_at);
      optionsRef.current.onApplyState(retry);
    }, CRON_RETRY_MS);
  }, [startBurst, markSeenTickAt]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const scheduleNext = () => {
      if (timeoutId != null) clearTimeout(timeoutId);
      const ms = Math.max(0, getMsUntilNextUpdate());
      setNextUpdateMs(ms);
      timeoutId = setTimeout(() => {
        void runUpdate().finally(scheduleNext);
      }, ms);
    };

    scheduleNext();
    intervalId = setInterval(() => setNextUpdateMs(getMsUntilNextUpdate()), 1000);
    const refreshId = setInterval(() => {
      void runUpdate();
    }, BACKGROUND_REFRESH_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void runUpdate();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timeoutId != null) clearTimeout(timeoutId);
      if (intervalId != null) clearInterval(intervalId);
      clearInterval(refreshId);
      document.removeEventListener("visibilitychange", onVisible);
      clearBurstTimers();
    };
  }, [runUpdate, clearBurstTimers]);

  return { nextUpdateMs, tickBurst, markSeenTickAt };
}
