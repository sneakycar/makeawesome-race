"use client";

import { useEffect, useState } from "react";
import { getRaceWeather, type RaceWeatherState } from "./race-weather";

export function useRaceWeather(raceId: string | undefined, active: boolean): RaceWeatherState | null {
  const [weather, setWeather] = useState<RaceWeatherState | null>(() =>
    raceId && active ? getRaceWeather(raceId) : null
  );

  useEffect(() => {
    if (!raceId || !active) {
      setWeather(null);
      return;
    }

    const refresh = () => setWeather(getRaceWeather(raceId));
    refresh();
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [raceId, active]);

  return weather;
}
