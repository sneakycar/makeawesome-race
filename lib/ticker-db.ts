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
  const fetchLimit = Math.max(limit * 4, 24);
  const { data, error } = await supabase
    .from("race_ticker_events")
    .select("*")
    .eq("race_id", raceId)
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

  return announcer.slice(0, limit).map((row) => ({
    ...row,
    facts: (row.facts ?? {}) as TickerEventFacts,
  })) as TickerEvent[];
}
