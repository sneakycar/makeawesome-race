export const EASTERN_TZ = "America/New_York";
export const RACE_START_HOUR = 9;
export const RACE_END_HOUR = 21;

type CalendarParts = { year: number; month: number; day: number };

function readParts(parts: Intl.DateTimeFormatPart[]): CalendarParts & {
  hour: number;
  minute: number;
  second: number;
} {
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)!.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

export function getEasternCalendarDate(ref: Date = new Date()): CalendarParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(ref);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)!.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Convert an Eastern wall-clock time on a calendar day to a UTC Date. */
export function easternWallClockToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  for (let i = 0; i < 4; i++) {
    const got = readParts(formatter.formatToParts(utc));
    const gotMs = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second);
    const wantMs = Date.UTC(year, month - 1, day, hour, minute, second);
    utc = new Date(utc.getTime() + (wantMs - gotMs));
  }
  return utc;
}

export function getRaceDayBoundsForDate(
  year: number,
  month: number,
  day: number
): { startedAt: Date; endsAt: Date } {
  return {
    startedAt: easternWallClockToDate(year, month, day, RACE_START_HOUR, 0, 0),
    endsAt: easternWallClockToDate(year, month, day, RACE_END_HOUR, 0, 0),
  };
}

export function getRaceDayBounds(date: Date = new Date()): { startedAt: Date; endsAt: Date } {
  const { year, month, day } = getEasternCalendarDate(date);
  return getRaceDayBoundsForDate(year, month, day);
}

export function getNextRaceDayBounds(afterDate: Date): { startedAt: Date; endsAt: Date } {
  const { year, month, day } = getEasternCalendarDate(afterDate);
  const anchor = easternWallClockToDate(year, month, day, 12, 0, 0);
  const nextDay = new Date(anchor.getTime() + 24 * 60 * 60 * 1000);
  const next = getEasternCalendarDate(nextDay);
  return getRaceDayBoundsForDate(next.year, next.month, next.day);
}

/** Race 1 anchor — June 13, 2026, 9:00 AM Eastern */
export function getRaceOneBounds(): { startedAt: Date; endsAt: Date } {
  return getRaceDayBoundsForDate(2026, 6, 13);
}
