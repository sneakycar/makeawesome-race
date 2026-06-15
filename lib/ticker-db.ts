import type { SupabaseClient } from "@supabase/supabase-js";
import type { TickerEvent, TickerEventFacts } from "./types";
import type { TickerEventDraft } from "./ticker-logic";

/** Event types stored but hidden from the scrolling ticker (if any). */
const HIDDEN_TICKER_EVENT_TYPES = new Set<string>([]);

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
  const fetchLimit = Math.max(limit * 4, 48);
  const { data, error } = await supabase
    .from("race_ticker_events")
    .select("*")
    .eq("race_id", raceId)
    .order("tick_number", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (error) throw error;

  const announcer = (data || []).filter((row) => {
    if (HIDDEN_TICKER_EVENT_TYPES.has(row.event_type)) return false;
    if (row.event_type === "legacy") {
      return !/^RACE \d+\s*[—–-]/i.test(row.message);
    }
    return true;
  });

  const byTick = new Map<number, (typeof announcer)[number]>();
  for (const row of announcer) {
    if (!byTick.has(row.tick_number)) {
      byTick.set(row.tick_number, row);
    }
  }

  return [...byTick.values()]
    .sort((a, b) => b.tick_number - a.tick_number)
    .slice(0, limit)
    .map((row) => ({
      ...row,
      facts: (row.facts ?? {}) as TickerEventFacts,
    })) as TickerEvent[];
}

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

/** One announcer line per tick for the race log panel. */
export async function getRaceTickLog(
  supabase: SupabaseClient,
  raceId: string
): Promise<
  Array<{ tickNumber: number; message: string; createdAt: string; eventType: string }>
> {
  const { data, error } = await supabase
    .from("race_ticker_events")
    .select("tick_number, message, created_at, event_type")
    .eq("race_id", raceId)
    .order("tick_number", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const byTick = new Map<
    number,
    { tickNumber: number; message: string; createdAt: string; eventType: string }
  >();

  for (const row of data ?? []) {
    const tickNumber = row.tick_number;
    const candidate = {
      tickNumber,
      message: row.message,
      createdAt: row.created_at,
      eventType: row.event_type,
    };

    if (row.event_type === "legacy" && /^RACE \d+\s*[—–-]/i.test(row.message)) {
      continue;
    }

    const existing = byTick.get(tickNumber);
    if (!existing) {
      byTick.set(tickNumber, candidate);
      continue;
    }

    if (logEventPriority(row.event_type) > logEventPriority(existing.eventType)) {
      byTick.set(tickNumber, candidate);
    }
  }

  return [...byTick.values()].sort((a, b) => a.tickNumber - b.tickNumber);
}
