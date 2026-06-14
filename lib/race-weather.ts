import { seededBool, seededPick } from "./seeded-rng";

export type RaceWeatherType = "rain" | "wind" | "storm" | "heat" | "fog";

export interface RaceWeatherState {
  type: RaceWeatherType;
  label: string;
}

const WEATHER_LABELS: Record<RaceWeatherType, string> = {
  rain: "RAIN",
  wind: "GUSTS",
  storm: "STORM",
  heat: "HEAT",
  fog: "FOG",
};

const WEATHER_TYPES: RaceWeatherType[] = ["rain", "wind", "storm", "heat", "fog"];

/** Deterministic race weather — on ~40% of 100s windows for ~45s at a time. */
export function getRaceWeather(raceId: string, now = new Date()): RaceWeatherState | null {
  const cycleMs = 100_000;
  const slot = Math.floor(now.getTime() / cycleMs);
  const phase = (now.getTime() % cycleMs) / cycleMs;
  const seed = `${raceId}:wx:${slot}`;

  if (!seededBool(`${seed}:show`, 0.42)) return null;
  if (phase < 0.18 || phase > 0.72) return null;

  const type = seededPick(`${seed}:type`, WEATHER_TYPES);
  return { type, label: WEATHER_LABELS[type] };
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
