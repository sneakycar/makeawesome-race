export const EASTERN_TZ = "America/New_York";
/** Every race starts at 9:00 AM Eastern. */
export const RACE_START_HOUR = 9;

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

function getNextEasternCalendarDay(
  year: number,
  month: number,
  day: number
): CalendarParts {
  const anchor = easternWallClockToDate(year, month, day, 12, 0, 0);
  const nextDay = new Date(anchor.getTime() + 24 * 60 * 60 * 1000);
  return getEasternCalendarDate(nextDay);
}

/** 9:00 AM Eastern on `day` → 9:00 AM Eastern the next calendar day (always 24h). */
export function getRaceWindowForEasternDay(
  year: number,
  month: number,
  day: number
): { startedAt: Date; endsAt: Date } {
  const startedAt = easternWallClockToDate(year, month, day, RACE_START_HOUR, 0, 0);
  const next = getNextEasternCalendarDay(year, month, day);
  const endsAt = easternWallClockToDate(
    next.year,
    next.month,
    next.day,
    RACE_START_HOUR,
    0,
    0
  );
  return { startedAt, endsAt };
}

export function getRaceDayBoundsForDate(
  year: number,
  month: number,
  day: number
): { startedAt: Date; endsAt: Date } {
  return getRaceWindowForEasternDay(year, month, day);
}

export function getRaceDayBounds(date: Date = new Date()): { startedAt: Date; endsAt: Date } {
  const { year, month, day } = getEasternCalendarDate(date);
  return getRaceWindowForEasternDay(year, month, day);
}

/** Expected end time for a race that started on this Eastern day (24h window). */
export function getExpectedRaceEndsAt(startedAt: Date): Date {
  const { year, month, day } = getEasternCalendarDate(startedAt);
  return getRaceWindowForEasternDay(year, month, day).endsAt;
}

export function getNextRaceDayBounds(afterDate: Date): { startedAt: Date; endsAt: Date } {
  const { year, month, day } = getEasternCalendarDate(afterDate);
  let window = getRaceWindowForEasternDay(year, month, day);

  if (afterDate.getTime() >= window.endsAt.getTime()) {
    const next = getNextEasternCalendarDay(year, month, day);
    window = getRaceWindowForEasternDay(next.year, next.month, next.day);
  }

  return window;
}

/** First / current race window: today 9:00 AM → tomorrow 9:00 AM Eastern. */
export function getFirstRaceLiveBounds(now: Date = new Date()): { startedAt: Date; endsAt: Date } {
  const { year, month, day } = getEasternCalendarDate(now);
  return getRaceWindowForEasternDay(year, month, day);
}

/** Race 1 anchor — June 13, 2026, 9:00 AM Eastern → June 14, 9:00 AM Eastern. */
export function getRaceOneBounds(): { startedAt: Date; endsAt: Date } {
  return getRaceWindowForEasternDay(2026, 6, 13);
}
