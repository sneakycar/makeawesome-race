import type { SupabaseClient } from "@supabase/supabase-js";
import type { TickerEvent, TickerEventFacts } from "./types";
import type { TickerEventDraft } from "./ticker-logic";

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
  const { data, error } = await supabase
    .from("race_ticker_events")
    .select("*")
    .eq("race_id", raceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    facts: (row.facts ?? {}) as TickerEventFacts,
  })) as TickerEvent[];
}
