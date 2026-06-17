import type { SupabaseClient } from "@supabase/supabase-js";
import { getLaneWinStats } from "./lane-stats";
import { CURRENT_LEAGUE_STATUSES } from "./league-roster";
import { calculatePlayerOvr } from "./ovr";
import type { LaneWinStat, LeagueStatsResponse, Player } from "./types";
import { backfillRaceWeatherEvents, getWeatherEventsForStats } from "./weather-db";

export const LEAGUE_STAT_KEYS = [
  "grit",
  "chaos",
  "nerve",
  "luck",
  "burst",
  "drag",
  "rating",
  "fatigue",
  "pressure",
  "volatility",
] as const;

export type LeagueStatKey = (typeof LEAGUE_STAT_KEYS)[number];

export const LEAGUE_STAT_COLORS: Record<LeagueStatKey, string> = {
  grit: "#ff6600",
  chaos: "#ff44ff",
  nerve: "#00ff88",
  luck: "#ffd700",
  burst: "#ff2244",
  drag: "#6688cc",
  rating: "#ffffff",
  fatigue: "#888888",
  pressure: "#ff9966",
  volatility: "#aa55ff",
};

type PlayerRow = Pick<
  Player,
  | "id"
  | "name"
  | "status"
  | "archetype"
  | "traits"
  | "races"
  | "wins"
  | "eliminations"
  | "returns"
  | "total_injuries"
  | "total_support_received"
  | "highest_race_score"
  | "highest_career_score"
  | "biggest_comeback"
  | "longest_win_streak"
  | "grit"
  | "chaos"
  | "nerve"
  | "luck"
  | "burst"
  | "drag"
  | "rating"
  | "fatigue"
  | "pressure"
  | "volatility"
>;

function toCountBars(
  counts: Map<string, number>,
  limit = 10
): LeagueStatsResponse["rosterMix"] {
  const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({
      label,
      value,
      pct: Math.round((value / total) * 1000) / 10,
    }));
}

function leaderFor(
  players: PlayerRow[],
  key: LeagueStatKey
): { name: string; value: number } {
  let best = players[0];
  for (const p of players) {
    if ((p[key] as number) > (best[key] as number)) best = p;
  }
  return { name: best?.name ?? "—", value: (best?.[key] as number) ?? 0 };
}

export async function getLeagueStats(
  supabase: SupabaseClient
): Promise<LeagueStatsResponse> {
  const [
    { data: players, error: playerErr },
    { count: racesFinalized, error: raceErr },
    { data: gameState, error: gsErr },
    laneWinRates,
    { data: finishRows, error: finishErr },
    { data: tickerRows, error: tickerErr },
  ] = await Promise.all([
    supabase.from("players").select(`
      id, name, status, archetype, traits, races, wins, eliminations, returns,
      total_injuries, total_support_received, highest_race_score, highest_career_score,
      biggest_comeback, longest_win_streak,
      grit, chaos, nerve, luck, burst, drag, rating, fatigue, pressure, volatility
    `).in("status", CURRENT_LEAGUE_STATUSES),
    supabase.from("races").select("*", { count: "exact", head: true }).eq("status", "finalized"),
    supabase.from("game_state").select("current_day, current_race_number").eq("id", 1).single(),
    getLaneWinStats(supabase),
    supabase
      .from("race_entries")
      .select("final_rank, race:races!inner(status)")
      .eq("race.status", "finalized")
      .not("final_rank", "is", null),
    supabase.from("race_ticker_events").select("event_type"),
  ]);

  if (playerErr) throw playerErr;
  if (raceErr) throw raceErr;
  if (gsErr) throw gsErr;
  if (finishErr) throw finishErr;
  if (tickerErr) throw tickerErr;

  const { count: weatherCount, error: weatherCountErr } = await supabase
    .from("race_weather_events")
    .select("*", { count: "exact", head: true });

  if (weatherCountErr) throw weatherCountErr;

  if ((weatherCount ?? 0) === 0) {
    const { count: raceTotal, error: raceTotalErr } = await supabase
      .from("races")
      .select("*", { count: "exact", head: true });
    if (raceTotalErr) throw raceTotalErr;
    if ((raceTotal ?? 0) > 0) {
      await backfillRaceWeatherEvents(supabase);
    }
  }

  const weatherStats = await getWeatherEventsForStats(supabase);

  const roster = (players ?? []) as PlayerRow[];
  const n = roster.length || 1;

  const statusCounts = new Map<string, number>();
  const archetypeCounts = new Map<string, number>();
  const traitCounts = new Map<string, number>();
  const ovrBuckets = new Map<string, number>([
    ["1–40", 0],
    ["41–55", 0],
    ["56–70", 0],
    ["71–85", 0],
    ["86–99", 0],
  ]);

  let totalWins = 0;
  let totalRaces = 0;
  let totalEliminations = 0;
  let totalReturns = 0;
  let totalInjuries = 0;
  let totalSupports = 0;

  for (const p of roster) {
    statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1);
    const arch = p.archetype || "UNKNOWN";
    archetypeCounts.set(arch, (archetypeCounts.get(arch) ?? 0) + 1);
    for (const trait of p.traits ?? []) {
      traitCounts.set(trait, (traitCounts.get(trait) ?? 0) + 1);
    }

    const ovr = calculatePlayerOvr(p);
    if (ovr <= 40) ovrBuckets.set("1–40", (ovrBuckets.get("1–40") ?? 0) + 1);
    else if (ovr <= 55) ovrBuckets.set("41–55", (ovrBuckets.get("41–55") ?? 0) + 1);
    else if (ovr <= 70) ovrBuckets.set("56–70", (ovrBuckets.get("56–70") ?? 0) + 1);
    else if (ovr <= 85) ovrBuckets.set("71–85", (ovrBuckets.get("71–85") ?? 0) + 1);
    else ovrBuckets.set("86–99", (ovrBuckets.get("86–99") ?? 0) + 1);

    totalWins += p.wins;
    totalRaces += p.races;
    totalEliminations += p.eliminations;
    totalReturns += p.returns;
    totalInjuries += p.total_injuries;
    totalSupports += p.total_support_received;
  }

  const abilityAverages = LEAGUE_STAT_KEYS.map((key) => {
    const sum = roster.reduce((acc, p) => acc + (p[key] as number), 0);
    const average = Math.round((sum / n) * 10) / 10;
    const leader = leaderFor(roster, key);
    const max = Math.max(...roster.map((p) => p[key] as number), 0);
    return {
      key,
      label: key.toUpperCase(),
      average,
      max,
      leaderName: leader.name,
      leaderValue: leader.value,
      color: LEAGUE_STAT_COLORS[key],
    };
  });

  const finishCounts = new Map<string, number>();
  for (let rank = 1; rank <= 8; rank++) {
    finishCounts.set(`L${rank}`, 0);
  }
  for (const row of finishRows ?? []) {
    const rank = row.final_rank as number;
    if (rank >= 1 && rank <= 8) {
      const key = `L${rank}`;
      finishCounts.set(key, (finishCounts.get(key) ?? 0) + 1);
    }
  }

  const tickerCounts = new Map<string, number>();
  for (const row of tickerRows ?? []) {
    const t = row.event_type as string;
    tickerCounts.set(t, (tickerCounts.get(t) ?? 0) + 1);
  }

  const winRateChart = roster
    .filter((p) => p.races > 0)
    .map((p) => ({
      name: p.name,
      wins: p.wins,
      races: p.races,
      winPct: Math.round((p.wins / p.races) * 1000) / 10,
    }))
    .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins)
    .slice(0, 8);

  const recordPick = (
    label: string,
    pick: (p: PlayerRow) => number,
    format: (v: number) => string = String
  ) => {
    const best = roster.reduce<PlayerRow | null>((acc, p) => {
      if (!acc || pick(p) > pick(acc)) return p;
      return acc;
    }, null);
    return {
      label,
      name: best?.name ?? "—",
      value: best ? format(pick(best)) : "—",
    };
  };

  const records = [
    recordPick("HIGH RACE SCORE", (p) => Number(p.highest_race_score), (v) => String(Math.round(v))),
    recordPick("HIGH CAREER", (p) => Number(p.highest_career_score), (v) => String(Math.round(v))),
    recordPick("BIGGEST COMEBACK", (p) => p.biggest_comeback, (v) => `+${v} SPOTS`),
    recordPick("WIN STREAK", (p) => p.longest_win_streak),
    recordPick("SUPPORT", (p) => p.total_support_received),
  ];

  const maxLaneWin = Math.max(...laneWinRates.map((l) => l.winPct), 1);

  return {
    generatedAt: new Date().toISOString(),
    headline: {
      totalPlayers: roster.length,
      racesFinalized: racesFinalized ?? 0,
      currentRace: gameState?.current_race_number ?? 0,
      currentDay: gameState?.current_day ?? 0,
    },
    tiles: [
      { label: "RACERS", value: roster.length, accent: "#00ff88" },
      { label: "RACES", value: racesFinalized ?? 0, accent: "#ffd700" },
      { label: "WINS", value: totalWins, accent: "#ff6600" },
      { label: "INJURIES", value: totalInjuries, accent: "#ff2244" },
      { label: "SUPPORTS", value: totalSupports, accent: "#ff44ff" },
      { label: "RETURNS", value: totalReturns, accent: "#6688ff" },
    ],
    rosterMix: toCountBars(statusCounts, 6),
    archetypes: toCountBars(archetypeCounts, 8),
    traits: toCountBars(traitCounts, 10),
    abilityAverages,
    careerTotals: [
      { label: "TOTAL STARTS", value: totalRaces, pct: 100 },
      { label: "ELIMINATIONS", value: totalEliminations, pct: totalRaces ? Math.round((totalEliminations / totalRaces) * 1000) / 10 : 0 },
      { label: "RETURNS", value: totalReturns, pct: roster.length ? Math.round((totalReturns / roster.length) * 1000) / 10 : 0 },
    ],
    records,
    winRateChart,
    ovrBuckets: [...ovrBuckets.entries()].map(([label, value]) => ({
      label,
      value,
      pct: roster.length ? Math.round((value / roster.length) * 1000) / 10 : 0,
    })),
    laneWinRates: laneWinRates.map((l) => ({ ...l, barPct: Math.round((l.winPct / maxLaneWin) * 100) })),
    finishDistribution: toCountBars(finishCounts, 8),
    tickerEvents: toCountBars(tickerCounts, 8),
    weatherTotal: weatherStats.total,
    weatherByType: toCountBars(
      new Map(
        [...weatherStats.byType.entries()].map(([type, value]) => [
          type === "wind" ? "GUSTS" : type.toUpperCase(),
          value,
        ])
      ),
      5
    ),
    weatherRecent: weatherStats.recent,
  };
}
