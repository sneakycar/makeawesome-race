/** Keep in sync with tick-burst-* animation durations in app/globals.css */
export const TICK_BURST_RIP_MS = 370;
/** Headline entrance animation window (stamp phase). */
export const TICK_BURST_STAMP_MS = 730;
/** Static, fully readable headline hold before exit. */
export const TICK_BURST_HOLD_MS = 4130;
/** Overlay exit — headline/vignette fade while the board returns. */
export const TICK_BURST_EXPLODE_MS = 650;
/** Game content fade-in on reveal (snappier than overlay exit). */
export const TICK_BURST_REVEAL_MS = 320;

export const TICK_BURST_TOTAL_MS =
  TICK_BURST_RIP_MS +
  TICK_BURST_STAMP_MS +
  TICK_BURST_HOLD_MS +
  TICK_BURST_EXPLODE_MS;
