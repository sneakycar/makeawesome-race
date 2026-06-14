"use client";

import type { TickBurstPhase } from "@/lib/use-cron-update";

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

  return (
    <div
      className={`tick-burst tick-burst--${phase}${isNight ? " is-night" : ""}`}
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
