"use client";

import { useEffect, useState } from "react";
import type { EncouragementState } from "@/lib/types";

export function useEncourageCooldown(encouragement: EncouragementState | null | undefined): boolean {
  const [ready, setReady] = useState(true);

  useEffect(() => {
    if (!encouragement?.nextVoteAt) {
      setReady(true);
      return;
    }

    const unlockAt = new Date(encouragement.nextVoteAt).getTime();
    const tick = () => setReady(Date.now() >= unlockAt);
    tick();

    const remaining = unlockAt - Date.now();
    if (remaining <= 0) return;

    const id = window.setTimeout(tick, remaining + 50);
    const interval = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(id);
      window.clearInterval(interval);
    };
  }, [encouragement?.nextVoteAt]);

  return ready;
}
