import type { SupabaseClient } from "@supabase/supabase-js";
import type { TickerEvent } from "./types";

export async function saveTickerEvents(
  supabase: SupabaseClient,
  raceId: string,
  tickNumber: number,
  messages: string[]
): Promise<void> {
  if (!messages.length) return;

  const rows = messages.map((message) => ({
    race_id: raceId,
    tick_number: tickNumber,
    message,
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
  return (data || []) as TickerEvent[];
}
