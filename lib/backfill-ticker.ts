import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculatePercentComplete,
  getRaceTickIntervalMs,
  getTickNumber,
  TICKS_PER_RACE,
} from "./race-logic";
import {
  applySimTick,
  rankSimEntries,
  type RaceSimEntry,
} from "./race-sim";
import {
  generateFinalizeTickerEvents,
  generateRaceStartTickerEvents,
  generateStatusPulseTickerEvent,
  generateTickTickerEvents,
  type TickerEntrySnapshot,
  type TickerEventDraft,
} from "./ticker-logic";
import type { Race, RaceEntryWithPlayer } from "./types";

interface TickerInsertRow {
  race_id: string;
  tick_number: number;
  message: string;
  event_type: string;
  player_id: string | null;
  facts: TickerEventDraft["facts"];
  created_at: string;
}

function toSnapshot(
  entry: RaceSimEntry & { current_rank: number },
  lastDelta: number,
  eventNote: string | null
): TickerEntrySnapshot {
  return {
    player_id: entry.player_id,
    player: entry.player,
    current_rank: entry.current_rank,
    progress: entry.score,
    last_delta: lastDelta,
    event_note: eventNote,
  };
}

function buildSnapshots(
  sim: RaceSimEntry[],
  tickResults: Map<string, { delta: number; event_note: string | null }>
): TickerEntrySnapshot[] {
  return rankSimEntries(sim).map((entry) => {
    const tick = tickResults.get(entry.player_id);
    return toSnapshot(
      entry,
      entry.is_injured ? 0 : (tick?.delta ?? 0),
      entry.is_injured ? "INJURED" : (tick?.event_note ?? null)
    );
  });
}

function draftsToRows(
  raceId: string,
  tickNumber: number,
  createdAt: string,
  drafts: TickerEventDraft[]
): TickerInsertRow[] {
  return drafts.map((draft) => ({
    race_id: raceId,
    tick_number: tickNumber,
    message: draft.message,
    event_type: draft.eventType,
    player_id: draft.playerId || null,
    facts: draft.facts,
    created_at: createdAt,
  }));
}

export async function backfillRaceTicker(
  supabase: SupabaseClient,
  raceId: string
): Promise<{ raceNumber: number; ticks: number; events: number }> {
  const { data: race, error: raceErr } = await supabase
    .from("races")
    .select("*")
    .eq("id", raceId)
    .single();

  if (raceErr) throw raceErr;
  if (!race) throw new Error(`Race not found: ${raceId}`);

  const { data: entries, error: entriesErr } = await supabase
    .from("race_entries")
    .select("*, player:players(*)")
    .eq("race_id", raceId);

  if (entriesErr) throw entriesErr;
  if (!entries?.length) throw new Error(`No entries for race ${raceId}`);

  const typedRace = race as Race;
  const typedEntries = entries as RaceEntryWithPlayer[];
  const startedAt = new Date(typedRace.started_at);
  const endsAt = new Date(typedRace.ends_at);
  const tickMs = getRaceTickIntervalMs(startedAt, endsAt);
  const now = typedRace.status === "finalized" ? endsAt : new Date();
  const maxTick =
    typedRace.status === "finalized"
      ? TICKS_PER_RACE - 1
      : getTickNumber(startedAt, endsAt, now);

  const injuryAtTick = new Map(
    typedEntries
      .filter((e) => e.injured_at_tick != null)
      .map((e) => [e.player_id, e.injured_at_tick as number])
  );

  const sim: RaceSimEntry[] = typedEntries.map((entry) => ({
    player_id: entry.player_id,
    player: entry.player,
    score: 0,
    is_injured: false,
    injured_at_tick: entry.injured_at_tick as number | null,
    stall_ticks_remaining: 0,
    restart_pending: false,
  }));

  const chaosUsed = new Map<string, boolean>();
  const rows: TickerInsertRow[] = [];

  const tickTime = (tick: number) =>
    new Date(startedAt.getTime() + tick * tickMs).toISOString();

  rows.push(
    ...draftsToRows(
      raceId,
      0,
      tickTime(0),
      generateRaceStartTickerEvents(typedRace.race_number)
    )
  );

  let beforeSnapshots: TickerEntrySnapshot[] = rankSimEntries(sim).map((entry) =>
    toSnapshot(entry, 0, null)
  );

  for (let tick = 0; tick <= maxTick; tick++) {
    const percentComplete = calculatePercentComplete(
      startedAt,
      endsAt,
      new Date(startedAt.getTime() + tick * tickMs)
    );

    const tickResults = applySimTick(
      typedRace,
      sim,
      tick,
      startedAt,
      endsAt,
      chaosUsed,
      { allowNewStalls: tick < TICKS_PER_RACE - 1 }
    );

    const tickResultById = new Map(
      tickResults.map((r) => [r.player_id, { delta: r.delta, event_note: r.event_note }])
    );

    for (const entry of sim) {
      const injuryTick = injuryAtTick.get(entry.player_id);
      if (injuryTick === tick) {
        entry.is_injured = true;
        tickResultById.set(entry.player_id, { delta: 0, event_note: "INJURED" });
      }
    }

    const afterSnapshots = buildSnapshots(sim, tickResultById);

    const dramatic = generateTickTickerEvents(
      beforeSnapshots,
      afterSnapshots,
      percentComplete,
      raceId,
      tick
    );
    dramatic.push(
      generateStatusPulseTickerEvent(
        afterSnapshots,
        typedRace.race_number,
        percentComplete,
        tick
      )
    );

    rows.push(...draftsToRows(raceId, tick, tickTime(tick), dramatic));
    beforeSnapshots = afterSnapshots;
  }

  if (typedRace.status === "finalized") {
    const finalRanked = rankSimEntries(sim);
    const winner = finalRanked.find((e) => !e.is_injured);
    const lastHealthy = [...finalRanked].reverse().find((e) => !e.is_injured);
    if (winner && lastHealthy) {
      rows.push(
        ...draftsToRows(
          raceId,
          TICKS_PER_RACE,
          endsAt.toISOString(),
          generateFinalizeTickerEvents(
            winner.player.name,
            lastHealthy.player.name,
            typedRace.race_number,
            winner.player_id,
            lastHealthy.player_id
          )
        )
      );
    }
  }

  const { error: deleteErr } = await supabase
    .from("race_ticker_events")
    .delete()
    .eq("race_id", raceId);

  if (deleteErr) throw deleteErr;

  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error: insertErr } = await supabase.from("race_ticker_events").insert(batch);
    if (insertErr) throw insertErr;
  }

  return {
    raceNumber: typedRace.race_number,
    ticks: maxTick + 1,
    events: rows.length,
  };
}

export async function backfillActiveRaceTicker(
  supabase: SupabaseClient
): Promise<{ raceNumber: number; ticks: number; events: number } | null> {
  const { data: race, error } = await supabase
    .from("races")
    .select("id")
    .eq("status", "active")
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!race) return null;

  return backfillRaceTicker(supabase, race.id);
}
