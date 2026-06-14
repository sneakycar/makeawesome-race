"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMsUntilNextUpdate } from "./race-clock";

const FLICKER_MS = 720;
const CRON_RETRY_MS = 2500;

export function useCronUpdate(onUpdate: () => void | Promise<void>) {
  const [nextUpdateMs, setNextUpdateMs] = useState(() => getMsUntilNextUpdate());
  const [isFlickering, setIsFlickering] = useState(false);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const runUpdate = useCallback(async () => {
    setIsFlickering(true);
    try {
      await onUpdateRef.current();
      window.setTimeout(() => {
        void onUpdateRef.current();
      }, CRON_RETRY_MS);
    } finally {
      window.setTimeout(() => setIsFlickering(false), FLICKER_MS);
    }
  }, []);

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

    return () => {
      if (timeoutId != null) clearTimeout(timeoutId);
      if (intervalId != null) clearInterval(intervalId);
    };
  }, [runUpdate]);

  return { nextUpdateMs, isFlickering };
}
