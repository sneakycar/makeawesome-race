import { seededBool, seededPick } from "./seeded-rng";

export type RaceWeatherType = "rain" | "wind" | "storm" | "heat" | "fog";

export interface RaceWeatherState {
  type: RaceWeatherType;
  label: string;
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

export const WEATHER_CYCLE_MS = 100_000;
export const WEATHER_PHASE_START = 0.18;
export const WEATHER_PHASE_END = 0.72;
export const WEATHER_SHOW_PROB = 0.42;

function weatherForSlot(raceId: string, slot: number): RaceWeatherEventRecord | null {
  const seed = `${raceId}:wx:${slot}`;
  if (!seededBool(`${seed}:show`, WEATHER_SHOW_PROB)) return null;

  const type = seededPick(`${seed}:type`, WEATHER_TYPES);
  const slotStart = slot * WEATHER_CYCLE_MS;
  return {
    slot,
    type,
    label: WEATHER_LABELS[type],
    startedAt: new Date(slotStart + WEATHER_PHASE_START * WEATHER_CYCLE_MS),
    endedAt: new Date(slotStart + WEATHER_PHASE_END * WEATHER_CYCLE_MS),
  };
}

/** All weather bursts overlapping [from, to] for a race (deterministic). */
export function enumerateRaceWeatherEvents(
  raceId: string,
  from: Date,
  to: Date
): RaceWeatherEventRecord[] {
  if (to <= from) return [];

  const fromMs = from.getTime();
  const toMs = to.getTime();
  const firstSlot = Math.floor(fromMs / WEATHER_CYCLE_MS);
  const lastSlot = Math.floor(toMs / WEATHER_CYCLE_MS);
  const events: RaceWeatherEventRecord[] = [];

  for (let slot = firstSlot; slot <= lastSlot; slot++) {
    const evt = weatherForSlot(raceId, slot);
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

/** Deterministic race weather — on ~40% of 100s windows for ~45s at a time. */
export function getRaceWeather(raceId: string, now = new Date()): RaceWeatherState | null {
  const slot = Math.floor(now.getTime() / WEATHER_CYCLE_MS);
  const evt = weatherForSlot(raceId, slot);
  if (!evt) return null;
  if (now < evt.startedAt || now > evt.endedAt) return null;
  return { type: evt.type, label: evt.label };
}

export const WEATHER_ART: Record<
  RaceWeatherType,
  { layerA: string; layerB: string }
> = {
  rain: {
    layerA: "' | ' | ' | ' | ' | ' | ' | ' |",
    layerB: " . / . \\ . / . \\ . / . \\ . / .",
  },
  wind: {
    layerA: "≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈",
    layerB: "  ~~~~>>  ~~~~>>  ~~~~>>  ~~~~>>",
  },
  storm: {
    layerA: "' / \\ | ' / \\ | ' / \\ | ' / \\ |",
    layerB: " . | . \\ . | . / . | . \\ . | . /",
  },
  heat: {
    layerA: "~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~",
    layerB: "  ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~",
  },
  fog: {
    layerA: "·   ·    ·   ·    ·   ·    ·   ·",
    layerB: "   ·    ·   ·    ·   ·    ·   ·",
  },
};
