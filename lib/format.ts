import { CRON_SEGMENT_MS } from "./race-clock";

export function formatRacerName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function stripRaceFromTickerMessage(message: string): string {
  return message
    .replace(/^RACE \d+\s*[—–-]\s*/i, "")
    .replace(/^RACE \d+\s+IS LIVE\s*[—–-]\s*/i, "")
    .replace(/\bWINS RACE \d+!/gi, "WINS!")
    .trim();
}

import { CRON_SEGMENT_MS } from "./race-clock";

export function formatTickerForDisplay(message: string): string {
  const stripped = stripRaceFromTickerMessage(message);
  const lower = stripped.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function formatProgressBar(percent: number, width = 14): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((clamped / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export function formatRemainingTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

export function formatCompactDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatPips(value: number): string {
  const clamped = Math.max(1, Math.min(100, Math.round(value)));
  let filled: number;
  if (clamped <= 20) filled = 1;
  else if (clamped <= 40) filled = 2;
  else if (clamped <= 60) filled = 3;
  else if (clamped <= 80) filled = 4;
  else filled = 5;
  return "●".repeat(filled) + "○".repeat(5 - filled);
}

/** Map 0–100 stat to a block pip string (default 20 segments). */
export function pipCount20(value: number, width = 20): number {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return Math.round((clamped / 100) * width);
}

export function formatPips20(value: number, width = 20): string {
  const filled = pipCount20(value, width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export function ordinal(rank: number): string {
  const n = Math.max(1, Math.floor(rank));
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}TH`;
  switch (n % 10) {
    case 1:
      return `${n}ST`;
    case 2:
      return `${n}ND`;
    case 3:
      return `${n}RD`;
    default:
      return `${n}TH`;
  }
}

export function truncateName(name: string, maxLength = 11): string {
  const upper = name.toUpperCase().trim();
  if (upper.length <= maxLength) return upper;
  return upper.slice(0, maxLength).trimEnd();
}

export function formatStreak(type: string, count: number): string {
  if (type === "win" && count > 0) return `W${count}`;
  if (type === "lose" && count > 0) return `L${count}`;
  return "NONE";
}

import { EASTERN_TZ } from "./eastern-time";

export function formatRaceBegan(date: Date): string {
  const month = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    month: "long",
  })
    .format(date)
    .toUpperCase();
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    day: "numeric",
  }).format(date);
  const year = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .toUpperCase()
    .replace(/\s/g, " ");
  return `${month} ${day}, ${year} (${time} EST)`;
}

export function formatNextRaceBegin(date: Date): string {
  return formatRaceBegan(date);
}

export function formatCurrentRaceLabel(raceNumber: number, rank: number | null): string {
  if (rank == null) {
    return `RACE ${raceNumber}`;
  }
  return `RACE ${raceNumber} (${ordinal(rank)})`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function padName(name: string, width = 11): string {
  const truncated = truncateName(name, width);
  return truncated.padEnd(width, " ");
}

export function formatTickerAge(isoDate: string, now: Date = new Date()): string {
  const then = new Date(isoDate).getTime();
  const diffMs = Math.max(0, now.getTime() - then);
  const mins = Math.floor(diffMs / 60000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Age label from a tick's scheduled wall time (15m cadence), not DB insert time. */
export function formatTickAge(
  raceStartedAt: string | Date,
  tickNumber: number,
  now: Date = new Date(),
  tickIntervalMs: number = CRON_SEGMENT_MS
): string {
  const wallMs = new Date(raceStartedAt).getTime() + tickNumber * tickIntervalMs;
  return formatTickerAge(new Date(wallMs).toISOString(), now);
}

export function formatTickerLine(
  events: Array<{ message: string; created_at: string }>,
  now: Date = new Date()
): string {
  if (!events.length) return "";
  return events
    .map((e) => `${e.message} (${formatTickerAge(e.created_at, now)})`)
    .join(" · ");
}
