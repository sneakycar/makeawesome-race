"use client";

import { useEffect, useRef, useState } from "react";

/** Wall clock anchored to the last API `serverTime` (avoids client clock skew). */
export function useServerAnchoredNow(serverTime: string | undefined): Date {
  const anchorRef = useRef({ serverMs: Date.now(), clientMs: Date.now() });

  useEffect(() => {
    if (!serverTime) return;
    anchorRef.current = {
      serverMs: new Date(serverTime).getTime(),
      clientMs: Date.now(),
    };
  }, [serverTime]);

  const [now, setNow] = useState(() =>
    serverTime ? new Date(serverTime) : new Date()
  );

  useEffect(() => {
    const tick = () => {
      const { serverMs, clientMs } = anchorRef.current;
      setNow(new Date(serverMs + (Date.now() - clientMs)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return now;
}
