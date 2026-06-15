import { seededBool, seededInt, seededPick } from "./seeded-rng";

export type RaceWeatherType = "rain" | "wind" | "storm" | "heat" | "fog";

export interface RaceWeatherState {
  type: RaceWeatherType;
  label: string;
  /** 0–1 envelope: eases in/out at episode edges, full strength in the middle. */
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

import { getRaceTickIntervalMs, TICKS_PER_RACE } from "./race-logic";

/** Chance a sim tick starts a new weather episode (~35%). */
export const WEATHER_SHOW_PROB = 0.35;
/** Each episode spans several ticks so rain/storm does not flicker off every tick. */
const WEATHER_EPISODE_MIN_TICKS = 3;
const WEATHER_EPISODE_MAX_TICKS = 7;
/** Fraction of the full episode used for fade-in / fade-out at each edge. */
export const WEATHER_FADE_FRACTION = 0.1;

interface WeatherEpisode extends RaceWeatherEventRecord {
  durationTicks: number;
}

/** Opacity within an episode: 0 outside, ramps at edges, 1 in the middle. */
export function weatherOpacityForEpisodeProgress(progress: number): number {
  if (progress <= 0 || progress >= 1) return 0;

  const fade = WEATHER_FADE_FRACTION;
  const smooth = (x: number) => {
    const c = Math.max(0, Math.min(1, x));
    return c * c * (3 - 2 * c);
  };

  if (progress <= fade) return smooth(progress / fade);
  if (progress >= 1 - fade) return smooth((1 - progress) / fade);
  return 1;
}

/** @deprecated Use weatherOpacityForEpisodeProgress — kept for callers on tick progress. */
export function weatherOpacityForTickProgress(tickProgress: number): number {
  return weatherOpacityForEpisodeProgress(tickProgress);
}

function weatherEpisodeStartingAt(
  raceId: string,
  slot: number,
  raceStartedAt: Date,
  tickMs: number,
  tickCount: number
): WeatherEpisode | null {
  if (slot >= tickCount) return null;

  const seed = `${raceId}:wx:${slot}`;
  if (!seededBool(`${seed}:show`, WEATHER_SHOW_PROB)) return null;

  const type = seededPick(`${seed}:type`, WEATHER_TYPES);
  const durationTicks = seededInt(`${seed}:dur`, WEATHER_EPISODE_MIN_TICKS, WEATHER_EPISODE_MAX_TICKS);
  const endSlotExclusive = Math.min(tickCount, slot + durationTicks);
  const startMs = raceStartedAt.getTime() + slot * tickMs;
  const endMs = raceStartedAt.getTime() + endSlotExclusive * tickMs;

  return {
    slot,
    type,
    label: WEATHER_LABELS[type],
    startedAt: new Date(startMs),
    endedAt: new Date(endMs),
    durationTicks,
  };
}

/** Non-overlapping weather episodes for a full race (deterministic). */
function buildWeatherEpisodeSchedule(
  raceId: string,
  raceStartedAt: Date,
  raceEndsAt: Date
): WeatherEpisode[] {
  const tickMs = getRaceTickIntervalMs(raceStartedAt, raceEndsAt);
  const tickCount = TICKS_PER_RACE;
  const episodes: WeatherEpisode[] = [];
  let slot = 0;

  while (slot < tickCount) {
    const episode = weatherEpisodeStartingAt(raceId, slot, raceStartedAt, tickMs, tickCount);
    if (episode) {
      episodes.push(episode);
      slot += episode.durationTicks;
    } else {
      slot += 1;
    }
  }

  return episodes;
}

/** All weather episodes overlapping [from, to] within a race. */
export function enumerateRaceWeatherEvents(
  raceId: string,
  raceStartedAt: Date,
  raceEndsAt: Date,
  from: Date,
  to: Date
): RaceWeatherEventRecord[] {
  if (to <= from) return [];

  const raceStartMs = raceStartedAt.getTime();
  const raceEndMs = raceEndsAt.getTime();
  const fromMs = Math.max(from.getTime(), raceStartMs);
  const toMs = Math.min(to.getTime(), raceEndMs);
  if (toMs <= fromMs) return [];

  const episodes = buildWeatherEpisodeSchedule(raceId, raceStartedAt, raceEndsAt);
  const events: RaceWeatherEventRecord[] = [];

  for (const episode of episodes) {
    const startMs = Math.max(episode.startedAt.getTime(), fromMs);
    const endMs = Math.min(episode.endedAt.getTime(), toMs);
    if (endMs <= startMs) continue;

    events.push({
      slot: episode.slot,
      type: episode.type,
      label: episode.label,
      startedAt: new Date(startMs),
      endedAt: new Date(endMs),
    });
  }

  return events;
}

/** Deterministic race weather — multi-tick episodes with smooth fade at edges. */
export function getRaceWeather(
  raceId: string,
  raceStartedAt: Date,
  raceEndsAt: Date,
  now = new Date()
): RaceWeatherState | null {
  if (now < raceStartedAt || now >= raceEndsAt) return null;

  const episodes = buildWeatherEpisodeSchedule(raceId, raceStartedAt, raceEndsAt);
  const nowMs = now.getTime();

  for (const episode of episodes) {
    const startMs = episode.startedAt.getTime();
    const endMs = episode.endedAt.getTime();
    if (nowMs < startMs || nowMs >= endMs) continue;

    const progress = (nowMs - startMs) / (endMs - startMs);
    const opacity = weatherOpacityForEpisodeProgress(progress);
    if (opacity <= 0) return null;

    return { type: episode.type, label: episode.label, opacity };
  }

  return null;
}
