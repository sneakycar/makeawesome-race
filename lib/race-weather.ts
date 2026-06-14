import { seededBool, seededPick } from "./seeded-rng";

export type RaceWeatherType = "rain" | "wind" | "storm" | "heat" | "fog";

export interface RaceWeatherState {
  type: RaceWeatherType;
  label: string;
  /** 0–1 envelope: eases in/out at tick edges, full strength in the middle. */
  opacity: number;
}

export interface RaceWeatherEventRecord {
  slot: number;
  type: RaceWeatherType;
  label: string;
  startedAt: Date;
  endedAt: Date;
}

const WEATHER_LABELS: Record<RaceWeatherType, string> = {
  rain: "RAIN",
  wind: "GUSTS",
  storm: "STORM",
  heat: "HEAT",
  fog: "FOG",
};

const WEATHER_TYPES: RaceWeatherType[] = ["rain", "wind", "storm", "heat", "fog"];

const TICKS_PER_RACE = 48;

/** Chance a sim tick gets weather (~40% of ticks). */
export const WEATHER_SHOW_PROB = 0.42;
/** Brief gap after tick boundary before weather rolls in. */
export const WEATHER_PHASE_START = 0.04;
/** Weather clears just before the next tick (~88% of tick window). */
export const WEATHER_PHASE_END = 0.92;
/** Fraction of the active weather window used for fade-in / fade-out at each edge. */
export const WEATHER_FADE_FRACTION = 0.14;

function getRaceTickIntervalMs(startedAt: Date, endsAt: Date): number {
  return Math.max(1, endsAt.getTime() - startedAt.getTime()) / TICKS_PER_RACE;
}

/** Opacity within a tick: 0 outside the window, ramps at edges, 1 in the middle. */
export function weatherOpacityForTickProgress(tickProgress: number): number {
  if (tickProgress < WEATHER_PHASE_START || tickProgress > WEATHER_PHASE_END) return 0;

  const span = WEATHER_PHASE_END - WEATHER_PHASE_START;
  const t = (tickProgress - WEATHER_PHASE_START) / span;
  const fade = WEATHER_FADE_FRACTION;
  const smooth = (x: number) => {
    const c = Math.max(0, Math.min(1, x));
    return c * c * (3 - 2 * c);
  };

  if (t <= fade) return smooth(t / fade);
  if (t >= 1 - fade) return smooth((1 - t) / fade);
  return 1;
}

function weatherForTickSlot(
  raceId: string,
  slot: number,
  raceStartedAt: Date,
  tickMs: number
): RaceWeatherEventRecord | null {
  const seed = `${raceId}:wx:${slot}`;
  if (!seededBool(`${seed}:show`, WEATHER_SHOW_PROB)) return null;

  const type = seededPick(`${seed}:type`, WEATHER_TYPES);
  const slotStartMs = raceStartedAt.getTime() + slot * tickMs;
  return {
    slot,
    type,
    label: WEATHER_LABELS[type],
    startedAt: new Date(slotStartMs + WEATHER_PHASE_START * tickMs),
    endedAt: new Date(slotStartMs + WEATHER_PHASE_END * tickMs),
  };
}

/** All weather bursts overlapping [from, to] within a race (deterministic per tick). */
export function enumerateRaceWeatherEvents(
  raceId: string,
  raceStartedAt: Date,
  raceEndsAt: Date,
  from: Date,
  to: Date
): RaceWeatherEventRecord[] {
  if (to <= from) return [];

  const tickMs = getRaceTickIntervalMs(raceStartedAt, raceEndsAt);
  const raceStartMs = raceStartedAt.getTime();
  const raceEndMs = raceEndsAt.getTime();
  const fromMs = Math.max(from.getTime(), raceStartMs);
  const toMs = Math.min(to.getTime(), raceEndMs);
  if (toMs <= fromMs) return [];

  const firstSlot = Math.max(0, Math.floor((fromMs - raceStartMs) / tickMs));
  const lastSlot = Math.min(
    TICKS_PER_RACE - 1,
    Math.floor((toMs - raceStartMs) / tickMs)
  );
  const events: RaceWeatherEventRecord[] = [];

  for (let slot = firstSlot; slot <= lastSlot; slot++) {
    const evt = weatherForTickSlot(raceId, slot, raceStartedAt, tickMs);
    if (!evt) continue;

    const startMs = Math.max(evt.startedAt.getTime(), fromMs);
    const endMs = Math.min(evt.endedAt.getTime(), toMs);
    if (endMs <= startMs) continue;

    events.push({
      ...evt,
      startedAt: new Date(startMs),
      endedAt: new Date(endMs),
    });
  }

  return events;
}

/** Deterministic race weather — tied to sim ticks, fades in/out at tick edges. */
export function getRaceWeather(
  raceId: string,
  raceStartedAt: Date,
  raceEndsAt: Date,
  now = new Date()
): RaceWeatherState | null {
  if (now < raceStartedAt || now >= raceEndsAt) return null;

  const tickMs = getRaceTickIntervalMs(raceStartedAt, raceEndsAt);
  const elapsed = now.getTime() - raceStartedAt.getTime();
  const slot = Math.min(TICKS_PER_RACE - 1, Math.floor(elapsed / tickMs));
  const tickProgress = (elapsed % tickMs) / tickMs;
  const opacity = weatherOpacityForTickProgress(tickProgress);
  if (opacity <= 0) return null;

  const evt = weatherForTickSlot(raceId, slot, raceStartedAt, tickMs);
  if (!evt) return null;

  return { type: evt.type, label: evt.label, opacity };
}
