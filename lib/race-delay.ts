import type { SupabaseClient } from "@supabase/supabase-js";
import { seededBool, seededInt } from "./seeded-rng";
import { saveTickerEvents } from "./ticker-db";
import type { Race, RaceDelayInfo } from "./types";

export type { RaceDelayInfo };

export interface DelayEventCopy {
  title: string;
  body: string;
  ticker: string;
}

const DELAY_EVENTS: DelayEventCopy[] = [
  {
    title: "TRACK FLOODING",
    body: "HEAVY RAIN HAS SWAMPED THE LOWER STRAIGHT. CREWS ARE PUMPING WATER OFF THE SURFACE. ALL RACING IS HALTED UNTIL THE TRACK IS CLEARED.",
    ticker: "RACE DELAYED — TRACK FLOODING. CREWS WORKING TO CLEAR THE SURFACE.",
  },
  {
    title: "POWER OUTAGE",
    body: "A GRID FAILURE KNOCKED OUT TIMING SYSTEMS AND LIGHTING. OFFICIALS CANNOT SAFELY CONTINUE UNTIL FULL POWER IS RESTORED.",
    ticker: "RACE DELAYED — POWER OUTAGE. TIMING SYSTEMS OFFLINE.",
  },
  {
    title: "DEBRIS ON TRACK",
    body: "LOOSE MATERIAL FROM THE OUTFIELD HAS COVERED THE RACING LINE. SAFETY CREW IS SWEEPING THE FULL CIRCUIT BEFORE COMPETITION RESUMES.",
    ticker: "RACE DELAYED — DEBRIS ON TRACK. SAFETY CREW SWEEPING.",
  },
  {
    title: "SEVERE WEATHER",
    body: "LIGHTNING HAS BEEN DETECTED WITHIN THE VENUE PERIMETER. ALL PERSONNEL HAVE BEEN CLEARED FROM THE TRACK UNTIL THE STORM PASSES.",
    ticker: "RACE DELAYED — SEVERE WEATHER. LIGHTNING IN THE AREA.",
  },
  {
    title: "TIMING MALFUNCTION",
    body: "THE SCORING SERVER HAS CRASHED MID-RACE. TECH CREW IS REBUILDING THE LOG FROM BACKUP TAPES BEFORE ANYONE MOVES ANOTHER INCH.",
    ticker: "RACE DELAYED — TIMING MALFUNCTION. SCORES BEING REBUILT.",
  },
  {
    title: "WILDLIFE INCIDENT",
    body: "A LARGE ANIMAL HAS WANDERED ONTO THE COURSE. ANIMAL CONTROL IS ON SCENE. THE RACE WILL NOT RESTART UNTIL THE TRACK IS SECURE.",
    ticker: "RACE DELAYED — WILDLIFE ON COURSE. ANIMAL CONTROL EN ROUTE.",
  },
  {
    title: "EQUIPMENT FAILURE",
    body: "THE STARTING GATE MECHANISM IS JAMMED AND CANNOT BE RESET. MECHANICS ARE DISASSEMBLING THE UNIT FOR EMERGENCY REPAIRS.",
    ticker: "RACE DELAYED — STARTING GATE FAILURE. REPAIRS UNDERWAY.",
  },
  {
    title: "MEDICAL EMERGENCY",
    body: "A MEDICAL INCIDENT IN THE PIT AREA HAS FORCED A FULL STOP. PARAMEDICS ARE ON SCENE. RACING WILL RESUME ONCE THE AREA IS CLEARED.",
    ticker: "RACE DELAYED — MEDICAL EMERGENCY IN PIT AREA.",
  },
];

export function isRaceDelayed(
  race: Pick<Race, "delay_until">,
  now: Date = new Date()
): boolean {
  if (!race.delay_until) return false;
  return now.getTime() < new Date(race.delay_until).getTime();
}

export function getRaceEffectiveNow(
  race: Pick<Race, "delay_until" | "delay_started_at">,
  now: Date = new Date()
): Date {
  if (isRaceDelayed(race, now) && race.delay_started_at) {
    return new Date(race.delay_started_at);
  }
  return now;
}

export function getRaceDelayInfo(race: Race, now: Date = new Date()): RaceDelayInfo {
  const active = isRaceDelayed(race, now);
  return {
    active,
    until: race.delay_until,
    title: race.delay_title,
    body: race.delay_body,
    frozenPercent: race.delay_frozen_percent,
    resumesInMs:
      active && race.delay_until
        ? Math.max(0, new Date(race.delay_until).getTime() - now.getTime())
        : null,
  };
}

/** Race delays are ticker flavor only — never halt the 15m scoring pipeline. */
export function shouldTriggerRaceDelay(
  _raceId: string,
  _tickNumber: number,
  _percentComplete: number,
  _hasActiveDelay: boolean
): boolean {
  return false;
}

export function rollDelayDurationMs(raceId: string, tickNumber: number): number {
  const hours = seededInt(`${raceId}:${tickNumber}:delay-hours`, 2, 8);
  return hours * 60 * 60 * 1000;
}

export function rollDelayEvent(raceId: string, tickNumber: number): DelayEventCopy {
  const idx = seededInt(`${raceId}:${tickNumber}:delay-event`, 0, DELAY_EVENTS.length - 1);
  return DELAY_EVENTS[idx];
}

export async function clearExpiredRaceDelay(
  supabase: SupabaseClient,
  race: Race,
  now: Date = new Date()
): Promise<Race | null> {
  if (!race.delay_until || now < new Date(race.delay_until)) return null;

  const { data, error } = await supabase
    .from("races")
    .update({
      delay_until: null,
      delay_started_at: null,
      delay_title: null,
      delay_body: null,
      delay_frozen_percent: null,
    })
    .eq("id", race.id)
    .select("*")
    .single();

  if (error) throw error;

  await saveTickerEvents(supabase, race.id, 0, [
    {
      eventType: "race_resumed",
      playerId: null,
      message: "RACE RESUMED — COMPETITION BACK UNDERWAY.",
      facts: { tickNumber: 0, percentComplete: race.percent_complete, playerName: "" },
      priority: 95,
    },
  ]);

  return data as Race;
}

export async function startRaceDelay(
  supabase: SupabaseClient,
  race: Race,
  tickNumber: number,
  percentComplete: number,
  now: Date = new Date()
): Promise<void> {
  const durationMs = rollDelayDurationMs(race.id, tickNumber);
  const event = rollDelayEvent(race.id, tickNumber);
  const delayUntil = new Date(now.getTime() + durationMs);
  const extendedEndsAt = new Date(new Date(race.ends_at).getTime() + durationMs);

  const { error } = await supabase
    .from("races")
    .update({
      delay_until: delayUntil.toISOString(),
      delay_started_at: now.toISOString(),
      delay_title: event.title,
      delay_body: event.body,
      delay_frozen_percent: percentComplete,
      ends_at: extendedEndsAt.toISOString(),
    })
    .eq("id", race.id);

  if (error) throw error;

  await saveTickerEvents(supabase, race.id, tickNumber, [
    {
      eventType: "race_delay",
      playerId: null,
      message: event.ticker,
      facts: {
        tickNumber,
        percentComplete,
        playerName: "",
        eventNote: event.title,
      },
      priority: 99,
    },
  ]);
}
