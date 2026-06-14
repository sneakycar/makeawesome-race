"use client";

import { useEffect, useState } from "react";
import {
  cacheCoords,
  guessCoordsFromTimezone,
  isLocalNight,
  loadCachedCoords,
  resolveLocalCoords,
} from "./local-sun";

export function useDayNight(): boolean {
  const [isNight, setIsNight] = useState(() => {
    if (typeof window === "undefined") return false;
    const coords = resolveLocalCoords();
    return isLocalNight(new Date(), coords.lat, coords.lng);
  });

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      const coords = resolveLocalCoords();
      setIsNight(isLocalNight(new Date(), coords.lat, coords.lng));
    };

    refresh();

    if (!loadCachedCoords() && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          cacheCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          refresh();
        },
        () => {
          if (cancelled) return;
          cacheCoords(guessCoordsFromTimezone());
          refresh();
        },
        { timeout: 5000, maximumAge: 86400000, enableHighAccuracy: false }
      );
    }

    const interval = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return isNight;
}

export function useHomeDayNightTheme(isNight: boolean): void {
  useEffect(() => {
    const theme = isNight ? "night" : "day";
    document.body.dataset.homeTheme = theme;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", isNight ? "#0a0a0a" : "#fafafa");
    }

    return () => {
      delete document.body.dataset.homeTheme;
      if (meta) meta.setAttribute("content", "#fafafa");
    };
  }, [isNight]);
}
