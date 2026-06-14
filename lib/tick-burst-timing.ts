/** Keep in sync with tick-burst-* animation durations in app/globals.css */
export const TICK_BURST_RIP_MS = 1100;
/** Headline entrance animation window (stamp phase). */
export const TICK_BURST_STAMP_MS = 2200;
/** Static, fully readable headline hold before exit. */
export const TICK_BURST_HOLD_MS = 12400;
export const TICK_BURST_EXPLODE_MS = 2800;

export const TICK_BURST_TOTAL_MS =
  TICK_BURST_RIP_MS +
  TICK_BURST_STAMP_MS +
  TICK_BURST_HOLD_MS +
  TICK_BURST_EXPLODE_MS;
