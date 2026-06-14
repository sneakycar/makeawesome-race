"use client";

import { useEffect, useState } from "react";
import { getRaceWeather, type RaceWeatherState } from "./race-weather";

export function useRaceWeather(
  raceId: string | undefined,
  startedAt: string | undefined,
  endsAt: string | undefined,
  active: boolean
): RaceWeatherState | null {
  const [weather, setWeather] = useState<RaceWeatherState | null>(null);

  useEffect(() => {
    if (!raceId || !startedAt || !endsAt || !active) {
      setWeather(null);
      return;
    }

    const raceStart = new Date(startedAt);
    const raceEnd = new Date(endsAt);

    const refresh = () => setWeather(getRaceWeather(raceId, raceStart, raceEnd));
    refresh();
    const id = setInterval(refresh, 100);
    return () => clearInterval(id);
  }, [raceId, startedAt, endsAt, active]);

  return weather;
}
