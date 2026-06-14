"use client";

import type { TickBurstPhase } from "@/lib/use-cron-update";
import {
  TICK_BURST_EXPLODE_MS,
  TICK_BURST_RIP_MS,
  TICK_BURST_STAMP_MS,
} from "@/lib/tick-burst-timing";

export function TickBurstOverlay({
  phase,
  headline,
  isNight,
}: {
  phase: TickBurstPhase;
  headline: string;
  isNight: boolean;
}) {
  if (!phase) return null;

  const burstStyle = {
    "--tick-burst-rip-ms": `${TICK_BURST_RIP_MS}ms`,
    "--tick-burst-stamp-ms": `${TICK_BURST_STAMP_MS}ms`,
    "--tick-burst-explode-ms": `${TICK_BURST_EXPLODE_MS}ms`,
  } as React.CSSProperties;

  return (
    <div
      className={`tick-burst tick-burst--${phase}${isNight ? " is-night" : ""}`}
      style={burstStyle}
      role="status"
      aria-live="assertive"
      aria-label={headline}
    >
      <div className="tick-burst-rip" aria-hidden="true" />
      <div className="tick-burst-vignette" aria-hidden="true" />
      {phase !== "rip" && (
        <div className="tick-burst-stamp">
          <span className="tick-burst-kicker">15m update</span>
          <p className="tick-burst-headline">{headline}</p>
        </div>
      )}
    </div>
  );
}
