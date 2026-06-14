/** Local sunrise/sunset (SunCalc-style, no dependencies). */

const dayMs = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const rad = Math.PI / 180;
const e = rad * 23.4397; // obliquity

function toJulian(date: Date): number {
  return date.getTime() / dayMs - 0.5 + J1970;
}

function fromJulian(j: number): Date {
  return new Date((j + 0.5 - J1970) * dayMs);
}

function toDays(date: Date): number {
  return toJulian(date) - J2000;
}

function julianCycle(d: number, lw: number): number {
  return Math.round(d - 0.0009 - lw / (2 * Math.PI));
}

function approxTransit(Ht: number, lw: number, n: number): number {
  return 0.0009 + lw / (2 * Math.PI) + n + Ht / (2 * Math.PI);
}

function solarTransitJ(ds: number, M: number, L: number): number {
  return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
}

function hourAngle(h: number, phi: number, d: number): number {
  return Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));
}

function observerAngle(height: number): number {
  return -2.076 * Math.sqrt(height) / 60;
}

export function getLocalSunTimes(
  date: Date,
  latitude: number,
  longitude: number,
  height = 0
): { sunrise: Date; sunset: Date } {
  const lw = rad * -longitude;
  const phi = rad * latitude;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds);
  const sinM = Math.sin(M);
  const L = rad * ((M / rad + 1.9148 * sinM + 0.0200 * Math.sin(2 * M) + 282.9372) % 360);
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const h0 = rad * (0.833 + observerAngle(height));
  const w = hourAngle(h0, phi, dec);

  const sunrise = fromJulian(solarTransitJ(approxTransit(-w, lw, n), M, L));
  const sunset = fromJulian(solarTransitJ(approxTransit(w, lw, n), M, L));

  return { sunrise, sunset };
}

export function isLocalNight(
  now: Date,
  latitude: number,
  longitude: number
): boolean {
  const { sunrise, sunset } = getLocalSunTimes(now, latitude, longitude);
  return now < sunrise || now >= sunset;
}

/** Rough coords from IANA timezone when geolocation is unavailable. */
export function guessCoordsFromTimezone(now = new Date()): { lat: number; lng: number } {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const known: Record<string, { lat: number; lng: number }> = {
    "America/Los_Angeles": { lat: 34.05, lng: -118.24 },
    "America/Phoenix": { lat: 33.45, lng: -112.07 },
    "America/Denver": { lat: 39.74, lng: -104.99 },
    "America/Chicago": { lat: 41.88, lng: -87.63 },
    "America/New_York": { lat: 40.71, lng: -74.01 },
    "America/Detroit": { lat: 42.33, lng: -83.05 },
    "America/Anchorage": { lat: 61.22, lng: -149.9 },
    "Pacific/Honolulu": { lat: 21.31, lng: -157.86 },
    "Europe/London": { lat: 51.51, lng: -0.13 },
    "Europe/Paris": { lat: 48.86, lng: 2.35 },
    "Europe/Berlin": { lat: 52.52, lng: 13.41 },
    "Asia/Tokyo": { lat: 35.68, lng: 139.69 },
    "Australia/Sydney": { lat: -33.87, lng: 151.21 },
  };
  if (known[tz]) return known[tz];

  const offsetHours = -now.getTimezoneOffset() / 60;
  return { lat: 40, lng: offsetHours * 15 - 7.5 };
}

const COORDS_KEY = "race-local-coords";

export function loadCachedCoords(): { lat: number; lng: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(COORDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat: number; lng: number };
    if (typeof parsed.lat === "number" && typeof parsed.lng === "number") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function cacheCoords(coords: { lat: number; lng: number }): void {
  try {
    localStorage.setItem(COORDS_KEY, JSON.stringify(coords));
  } catch {
    /* ignore */
  }
}

export function resolveLocalCoords(now = new Date()): { lat: number; lng: number } {
  return loadCachedCoords() ?? guessCoordsFromTimezone(now);
}
