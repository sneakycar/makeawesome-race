import type { SupabaseClient } from "@supabase/supabase-js";
import type { TickerEvent, TickerEventFacts } from "./types";
import type { TickerEventDraft } from "./ticker-logic";

/** Event types stored but hidden from the scrolling ticker (if any). */
const HIDDEN_TICKER_EVENT_TYPES = new Set<string>([]);

const LOG_EVENT_PRIORITY: Record<string, number> = {
  god_score: 100,
  race_delay: 95,
  delay_lost_tick: 88,
  race_resumed: 95,
  fight: 90,
  lead_change: 85,
  chaos_surge: 80,
  collapse: 78,
  score_collapse: 76,
  rank_surge: 72,
  big_lap: 70,
  underdog: 68,
  rookie_run: 66,
  stall: 60,
  rank_slip: 58,
  lead_pressure: 55,
  late_close: 54,
  bad_money: 52,
  injury: 50,
  status_pulse: 10,
  legacy: 5,
};

function logEventPriority(eventType: string): number {
  return LOG_EVENT_PRIORITY[eventType] ?? 40;
}

function isHiddenBroadcastRow(eventType: string, message: string): boolean {
  if (HIDDEN_TICKER_EVENT_TYPES.has(eventType)) return true;
  if (eventType === "legacy" && /^RACE \d+\s*[—–-]/i.test(message)) return true;
  return false;
}

type TickerRow = {
  id: string;
  race_id: string;
  tick_number: number;
  message: string;
  event_type: string;
  player_id: string | null;
  facts: unknown;
  created_at: string;
};

async function fetchRaceTickerRows(
  supabase: SupabaseClient,
  raceId: string
): Promise<TickerRow[]> {
  const { data, error } = await supabase
    .from("race_ticker_events")
    .select("id, race_id, tick_number, message, event_type, player_id, facts, created_at")
    .eq("race_id", raceId)
    .order("tick_number", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TickerRow[];
}

/** One announcer line per tick — same pick logic for ticker and log. */
function pickBestEventPerTick(rows: TickerRow[]): TickerRow[] {
  const byTick = new Map<number, TickerRow>();

  for (const row of rows) {
    if (isHiddenBroadcastRow(row.event_type, row.message)) continue;

    const existing = byTick.get(row.tick_number);
    if (!existing) {
      byTick.set(row.tick_number, row);
      continue;
    }

    if (logEventPriority(row.event_type) > logEventPriority(existing.event_type)) {
      byTick.set(row.tick_number, row);
      continue;
    }

    if (
      logEventPriority(row.event_type) === logEventPriority(existing.event_type) &&
      row.created_at > existing.created_at
    ) {
      byTick.set(row.tick_number, row);
    }
  }

  return [...byTick.values()].sort((a, b) => b.tick_number - a.tick_number);
}

export async function saveTickerEvents(
  supabase: SupabaseClient,
  raceId: string,
  tickNumber: number,
  events: TickerEventDraft[]
): Promise<void> {
  if (!events.length) return;

  const rows = events.map((event) => ({
    race_id: raceId,
    tick_number: tickNumber,
    message: event.message,
    event_type: event.eventType,
    player_id: event.playerId || null,
    facts: event.facts,
  }));

  const { error } = await supabase.from("race_ticker_events").insert(rows);
  if (error) throw error;
}

export async function getRecentTickerEvents(
  supabase: SupabaseClient,
  raceId: string,
  limit = 6
): Promise<TickerEvent[]> {
  return getAnnouncerTickerEvents(supabase, raceId, limit);
}

export async function getAnnouncerTickerEvents(
  supabase: SupabaseClient,
  raceId: string,
  limit = 12
): Promise<TickerEvent[]> {
  const rows = await fetchRaceTickerRows(supabase, raceId);
  return pickBestEventPerTick(rows)
    .slice(0, limit)
    .map((row) => ({
      ...row,
      facts: (row.facts ?? {}) as TickerEventFacts,
    })) as TickerEvent[];
}

/** One announcer line per tick for the race log panel. */
export async function getRaceTickLog(
  supabase: SupabaseClient,
  raceId: string
): Promise<
  Array<{ tickNumber: number; message: string; createdAt: string; eventType: string }>
> {
  const rows = await fetchRaceTickerRows(supabase, raceId);
  return pickBestEventPerTick(rows).map((row) => ({
    tickNumber: row.tick_number,
    message: row.message,
    createdAt: row.created_at,
    eventType: row.event_type,
  }));
}
