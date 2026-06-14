import type { LastRaceRecap } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatRacerName, ordinal } from "./format";
import { formatRaceScore } from "./score";
import type { RaceWeatherType } from "./race-weather";

interface RecapStanding {
  name: string;
  finalRank: number;
  score: number;
  peakScore: number;
}

interface RecapContext {
  raceNumber: number;
  winner: RecapStanding;
  loser: RecapStanding;
  runnerUp: RecapStanding | null;
  margin: number;
  eventCounts: Map<string, number>;
  weatherCounts: Map<RaceWeatherType, number>;
  weatherTotal: number;
  injuryCount: number;
  fightPairs: string[];
  delayTitle: string | null;
  hadGodScore: boolean;
  notableLines: string[];
}

const WEATHER_HYPE: Record<RaceWeatherType, string> = {
  storm: "violent electrical storms",
  rain: "relentless rain squalls",
  wind: "savage gust fronts",
  heat: "punishing heat waves",
  fog: "blinding fog banks",
};

const OPENERS = [
  "belongs in the permanent highlight reel",
  "will be talked about in the pits for years",
  "delivered absolute carnage from wire to wire",
  "was not a race — it was a survival test",
  "refused to behave like a normal sporting event",
];

function pickOpener(raceNumber: number): string {
  return OPENERS[raceNumber % OPENERS.length];
}

function formatWeatherBeat(counts: Map<RaceWeatherType, number>, total: number): string | null {
  if (total <= 0) return null;

  const ranked = [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!ranked.length) return null;

  const top = ranked.slice(0, 3).map(([type, n]) => `${n} ${WEATHER_HYPE[type]}`);
  const joined =
    top.length === 1
      ? top[0]
      : top.length === 2
        ? `${top[0]} and ${top[1]}`
        : `${top[0]}, ${top[1]}, and ${top[2]}`;

  return `The elements went feral — ${total} verified weather bursts, including ${joined}.`;
}

function formatFightBeat(fightPairs: string[]): string | null {
  if (!fightPairs.length) return null;
  if (fightPairs.length === 1) {
    return `Fists flew when ${fightPairs[0]} threw down mid-race.`;
  }
  return `${fightPairs.length} separate fights broke out, including ${fightPairs.slice(0, 2).join(" and ")}.`;
}

function composeRecapParagraph(ctx: RecapContext): string {
  const parts: string[] = [];

  parts.push(
    `Race ${ctx.raceNumber} ${pickOpener(ctx.raceNumber)}. ${ctx.winner.name.toUpperCase()} seized the win at ${formatRaceScore(ctx.winner.score)} points`
  );

  if (ctx.runnerUp && ctx.margin > 0) {
    parts[parts.length - 1] +=
      `, ${formatRaceScore(ctx.margin)} clear of ${ctx.runnerUp.name.toUpperCase()} in ${ordinal(ctx.runnerUp.finalRank)}`;
  }

  parts[parts.length - 1] += `.`;

  parts.push(
    `${ctx.loser.name.toUpperCase()} finished last at ${formatRaceScore(ctx.loser.score)} and was eliminated to holding.`
  );

  const chaos: string[] = [];

  if (ctx.hadGodScore) {
    chaos.push("somebody touched the forbidden 240 — GOD SCORE territory");
  }

  const chaosSurges = ctx.eventCounts.get("chaos_surge") ?? 0;
  if (chaosSurges > 0) {
    chaos.push(
      `${chaosSurges} chaos surge${chaosSurges === 1 ? "" : "s"} ripped through the field`
    );
  }

  const stalls = ctx.eventCounts.get("stall") ?? 0;
  if (stalls >= 8) {
    chaos.push(`${stalls} stall events stopped racers cold`);
  }

  const surges = ctx.eventCounts.get("rank_surge") ?? 0;
  if (surges >= 3) {
    chaos.push(`${surges} rank surges shook the standings`);
  }

  const collapses = ctx.eventCounts.get("collapse") ?? 0;
  if (collapses > 0) {
    chaos.push(`${collapses} late collapses torched the leaderboard`);
  }

  const underdogs = ctx.eventCounts.get("underdog") ?? 0;
  if (underdogs > 0) {
    chaos.push(`underdog pressure flared ${underdogs} time${underdogs === 1 ? "" : "s"}`);
  }

  const fightLine = formatFightBeat(ctx.fightPairs);
  if (fightLine) chaos.unshift(fightLine);

  if (ctx.injuryCount > 0) {
    chaos.unshift(
      `${ctx.injuryCount} injury${ctx.injuryCount === 1 ? "" : "ies"} forced racers off the track`
    );
  }

  if (ctx.delayTitle) {
    chaos.unshift(`the race went dark during ${ctx.delayTitle.toLowerCase()} — full delay`);
  }

  const weatherLine = formatWeatherBeat(ctx.weatherCounts, ctx.weatherTotal);
  if (weatherLine) chaos.push(weatherLine);

  if (ctx.notableLines.length > 0) {
    const quote = ctx.notableLines[0].replace(/\s+/g, " ").trim();
    if (quote.length > 0) {
      chaos.push(`the broadcast desk lost it: "${quote.toLowerCase()}"`);
    }
  }

  if (chaos.length > 0) {
    parts.push(chaos.join("; ") + ".");
  } else {
    parts.push("No fights, no injuries, no race delay — just pure scoring warfare.");
  }

  return parts.join(" ");
}

export async function getLastRaceRecap(
  supabase: SupabaseClient
): Promise<LastRaceRecap | null> {
  const { data: race, error: raceErr } = await supabase
    .from("races")
    .select("*")
    .eq("status", "finalized")
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (raceErr) throw raceErr;
  if (!race) return null;

  const { data: entries, error: entriesErr } = await supabase
    .from("race_entries")
    .select(
      "final_rank, race_score, peak_race_score, player:players!race_entries_player_id_fkey(name, slug)"
    )
    .eq("race_id", race.id);

  if (entriesErr) throw entriesErr;
  if (!entries?.length) return null;

  const standings = entries
    .map((entry) => {
      const player = entry.player as { name: string } | { name: string }[] | null;
      const name =
        Array.isArray(player) ? player[0]?.name : player?.name ?? "unknown";
      return {
        name: formatRacerName(name),
        finalRank: entry.final_rank as number | null,
        score: Number(entry.race_score),
        peakScore: Number(entry.peak_race_score ?? entry.race_score),
      };
    })
    .sort((a, b) => {
      const rankA = a.finalRank ?? 999;
      const rankB = b.finalRank ?? 999;
      if (rankA !== rankB) return rankA - rankB;
      return b.score - a.score;
    });

  const withRank: RecapStanding[] = standings.map((row, index) => ({
    ...row,
    finalRank: row.finalRank ?? index + 1,
  }));

  const winner = withRank.find((e) => e.finalRank === 1) ?? withRank[0];
  const loser = [...withRank].sort((a, b) => b.finalRank - a.finalRank)[0];
  const runnerUp = withRank.find((e) => e.finalRank === 2) ?? null;

  const [{ data: tickerRows }, { data: weatherRows }, { data: injuryRows }] =
    await Promise.all([
      supabase
        .from("race_ticker_events")
        .select("event_type, message, player_id")
        .eq("race_id", race.id),
      supabase.from("race_weather_events").select("weather_type").eq("race_id", race.id),
      supabase.from("injury_events").select("id").eq("race_id", race.id),
    ]);

  const eventCounts = new Map<string, number>();
  const fightMessages: string[] = [];
  let delayTitle: string | null = null;
  let hadGodScore = false;
  const notableLines: string[] = [];

  for (const row of tickerRows ?? []) {
    eventCounts.set(row.event_type, (eventCounts.get(row.event_type) ?? 0) + 1);

    if (row.event_type === "fight" && row.message) {
      fightMessages.push(row.message.replace(/\s+/g, " ").trim());
    }
    if (row.event_type === "race_delay" && row.message) {
      delayTitle = row.message.split("—")[0]?.trim() ?? row.message;
    }
    if (row.event_type === "god_score") {
      hadGodScore = true;
    }
    if (
      ["chaos_surge", "collapse", "big_lap", "lead_change", "underdog"].includes(
        row.event_type
      ) &&
      row.message
    ) {
      notableLines.push(row.message);
    }
  }

  const fightPairs = [...new Set(fightMessages)].slice(0, 3).map((msg) => {
    const cleaned = msg
      .replace(/^.*?(\w[\w\s]+)\s+and\s+([\w\s]+?)\s+throw down/i, "$1 vs $2")
      .replace(/\s*—\s*FIGHT!.*$/i, "")
      .toLowerCase();
    return cleaned;
  });

  const weatherCounts = new Map<RaceWeatherType, number>();
  for (const row of weatherRows ?? []) {
    const type = row.weather_type as RaceWeatherType;
    weatherCounts.set(type, (weatherCounts.get(type) ?? 0) + 1);
  }

  const paragraph = composeRecapParagraph({
    raceNumber: race.race_number,
    winner,
    loser,
    runnerUp,
    margin: runnerUp ? Math.max(0, winner.score - runnerUp.score) : 0,
    eventCounts,
    weatherCounts,
    weatherTotal: weatherRows?.length ?? 0,
    injuryCount: injuryRows?.length ?? 0,
    fightPairs,
    delayTitle,
    hadGodScore,
    notableLines,
  });

  return { raceNumber: race.race_number, paragraph };
}
