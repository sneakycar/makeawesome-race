import type { SupabaseClient } from "@supabase/supabase-js";
import { enumerateRaceWeatherEvents } from "./race-weather";
import type { LeagueWeatherEvent, Race, RaceWeatherType } from "./types";

export async function syncRaceWeatherEvents(
  supabase: SupabaseClient,
  race: Pick<Race, "id" | "race_number" | "started_at" | "ends_at">,
  from: Date,
  to: Date
): Promise<number> {
  const events = enumerateRaceWeatherEvents(
    race.id,
    new Date(race.started_at),
    new Date(race.ends_at),
    from,
    to
  );
  if (!events.length) return 0;

  const rows = events.map((evt) => ({
    race_id: race.id,
    race_number: race.race_number,
    weather_slot: evt.slot,
    weather_type: evt.type,
    started_at: evt.startedAt.toISOString(),
    ended_at: evt.endedAt.toISOString(),
  }));

  const { error } = await supabase
    .from("race_weather_events")
    .upsert(rows, { onConflict: "race_id,weather_slot", ignoreDuplicates: true });

  if (error) throw error;
  return rows.length;
}

export async function backfillRaceWeatherEvents(supabase: SupabaseClient): Promise<void> {
  const { data: races, error } = await supabase
    .from("races")
    .select("id, race_number, started_at, ends_at, finalized_at, status");

  if (error) throw error;
  if (!races?.length) return;

  for (const race of races) {
    const from = new Date(race.started_at);
    const to =
      race.status === "finalized"
        ? new Date(race.ends_at)
        : new Date(Math.min(Date.now(), new Date(race.ends_at).getTime()));
    await syncRaceWeatherEvents(supabase, race, from, to);
  }
}

export async function getWeatherEventsForStats(
  supabase: SupabaseClient,
  recentLimit = 24
): Promise<{
  byType: Map<RaceWeatherType, number>;
  recent: LeagueWeatherEvent[];
  total: number;
}> {
  const [{ count, error: countErr }, { data: rows, error: rowsErr }, { data: typeRows, error: typeErr }] =
    await Promise.all([
      supabase.from("race_weather_events").select("*", { count: "exact", head: true }),
      supabase
        .from("race_weather_events")
        .select("id, race_number, weather_type, started_at, ended_at")
        .order("started_at", { ascending: false })
        .limit(recentLimit),
      supabase.from("race_weather_events").select("weather_type"),
    ]);

  if (countErr) throw countErr;
  if (rowsErr) throw rowsErr;
  if (typeErr) throw typeErr;

  const byType = new Map<RaceWeatherType, number>();
  for (const row of typeRows ?? []) {
    const t = row.weather_type as RaceWeatherType;
    byType.set(t, (byType.get(t) ?? 0) + 1);
  }

  const WEATHER_LABELS: Record<RaceWeatherType, string> = {
    rain: "RAIN",
    wind: "GUSTS",
    storm: "STORM",
    heat: "HEAT",
    fog: "FOG",
  };

  const recent: LeagueWeatherEvent[] = (rows ?? []).map((row) => {
    const startedAt = row.started_at as string;
    const endedAt = row.ended_at as string;
    const type = row.weather_type as RaceWeatherType;
    const durationSec = Math.max(
      1,
      Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
    );
    return {
      id: row.id as string,
      raceNumber: row.race_number as number,
      type,
      label: WEATHER_LABELS[type],
      startedAt,
      endedAt,
      durationSec,
    };
  });

  return { byType, recent, total: count ?? 0 };
}
