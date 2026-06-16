/** Keep in sync with tick-burst-* animation durations in app/globals.css */
export const TICK_BURST_RIP_MS = 220;
/** Headline entrance animation window (stamp phase). */
export const TICK_BURST_STAMP_MS = 480;
/** Brief read time — long enough to parse, short enough to stay in the race. */
export const TICK_BURST_HOLD_MS = 1400;
/** Overlay exit while the board snaps back. */
export const TICK_BURST_EXPLODE_MS = 520;
/** Game content fade-in on reveal (synced with overlay exit). */
export const TICK_BURST_REVEAL_MS = 480;

export const TICK_BURST_TOTAL_MS =
  TICK_BURST_RIP_MS +
  TICK_BURST_STAMP_MS +
  TICK_BURST_HOLD_MS +
  TICK_BURST_EXPLODE_MS;
