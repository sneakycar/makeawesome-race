import type { LastRaceRecap, LastRaceRecapSegment } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatRacerName, ordinal } from "./format";
import { formatRaceScore } from "./score";
import type { RaceWeatherType } from "./race-weather";
import { pickGatedRecapPhrase } from "./recap-grammar-gate";
import {
  RECAP_CHAOS_SURGE_PHRASES,
  RECAP_COLLAPSE_PHRASES,
  RECAP_DELAY_PHRASES,
  RECAP_FIGHT_MULTI_PHRASES,
  RECAP_FIGHT_PHRASES,
  RECAP_GOD_SCORE_PHRASES,
  RECAP_INJURY_PHRASES,
  RECAP_LAST_PHRASES,
  RECAP_MARGIN_PHRASES,
  RECAP_OPENERS,
  RECAP_QUIET_PHRASES,
  RECAP_QUOTE_PHRASES,
  RECAP_RANK_SURGE_PHRASES,
  RECAP_STALL_PHRASES,
  RECAP_UNDERDOG_PHRASES,
  RECAP_WEATHER_PHRASES,
  RECAP_WIN_PHRASES,
} from "./recap-phrases";
import { parseFightTickerMessage } from "./race-fight-tick";

interface RecapStanding {
  name: string;
  finalRank: number;
  score: number;
  peakScore: number;
}

interface RecapFightPair {
  a: string;
  b: string;
}

interface RecapContext {
  raceId: string;
  raceNumber: number;
  winner: RecapStanding;
  loser: RecapStanding;
  runnerUp: RecapStanding | null;
  margin: number;
  eventCounts: Map<string, number>;
  weatherCounts: Map<RaceWeatherType, number>;
  weatherTotal: number;
  injuryCount: number;
  fightPairs: RecapFightPair[];
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

function text(value: string): LastRaceRecapSegment {
  return { kind: "text", value };
}

function racer(name: string): LastRaceRecapSegment {
  return { kind: "name", value: formatRacerName(name) };
}

function segmentsToParagraph(segments: LastRaceRecapSegment[]): string {
  return segments.map((segment) => segment.value).join("");
}

function pickOpener(raceNumber: number): string {
  return RECAP_OPENERS[raceNumber % RECAP_OPENERS.length]!;
}

function formatWeatherJoined(counts: Map<RaceWeatherType, number>): string | null {
  const ranked = [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!ranked.length) return null;

  const top = ranked.slice(0, 3).map(([type, n]) => `${n} ${WEATHER_HYPE[type]}`);
  if (top.length === 1) return top[0]!;
  if (top.length === 2) return `${top[0]} and ${top[1]}`;
  return `${top[0]}, ${top[1]}, and ${top[2]}`;
}

function pushGatedLine(
  seed: string,
  phrases: readonly string[],
  vars: Record<string, string | number>,
  fallback: string,
  target: string[]
): void {
  target.push(pickGatedRecapPhrase(seed, phrases, vars) ?? fallback);
}

function pushNameSplit(
  segments: LastRaceRecapSegment[],
  line: string,
  name: string
): void {
  const parts = line.split(name);
  if (parts.length === 2) {
    segments.push(text(parts[0]!), racer(name), text(parts[1]!));
  } else {
    segments.push(text(line));
  }
}

function fightBeatSegments(ctx: RecapContext): LastRaceRecapSegment[] | null {
  if (!ctx.fightPairs.length) return null;

  if (ctx.fightPairs.length === 1) {
    const pair = ctx.fightPairs[0]!;
    const a = formatRacerName(pair.a);
    const b = formatRacerName(pair.b);
    const template =
      pickGatedRecapPhrase(`${ctx.raceId}:fight`, RECAP_FIGHT_PHRASES, { a, b }) ??
      `${a} and ${b} threw down mid-race.`;

    if (template.startsWith("Fists flew when ")) {
      return [
        text("Fists flew when "),
        racer(pair.a),
        text(" and "),
        racer(pair.b),
        text(" got into it."),
      ];
    }
    if (template.includes("scrapped")) {
      return [racer(pair.a), text(" and "), racer(pair.b), text(" scrapped in the middle of the pack.")];
    }
    return [racer(pair.a), text(" and "), racer(pair.b), text(" threw down mid-race.")];
  }

  const first = `${formatRacerName(ctx.fightPairs[0]!.a)} vs ${formatRacerName(ctx.fightPairs[0]!.b)}`;
  const second = `${formatRacerName(ctx.fightPairs[1]!.a)} vs ${formatRacerName(ctx.fightPairs[1]!.b)}`;
  const line =
    pickGatedRecapPhrase(`${ctx.raceId}:fight-multi`, RECAP_FIGHT_MULTI_PHRASES, {
      count: ctx.fightPairs.length,
      first,
      second,
    }) ??
    `${ctx.fightPairs.length} separate fights broke out, including ${first} and ${second}.`;

  return [text(line)];
}

function composeRecapParagraph(ctx: RecapContext): LastRaceRecapSegment[] {
  const segments: LastRaceRecapSegment[] = [];

  segments.push(text(`Race ${ctx.raceNumber} ${pickOpener(ctx.raceNumber)}. `));

  const winLead =
    pickGatedRecapPhrase(`${ctx.raceId}:win`, RECAP_WIN_PHRASES, {
      winner: ctx.winner.name,
      score: formatRaceScore(ctx.winner.score),
    }) ?? `${ctx.winner.name} seized the win at ${formatRaceScore(ctx.winner.score)} points`;
  pushNameSplit(segments, winLead, ctx.winner.name);

  if (ctx.runnerUp && ctx.margin > 0) {
    const marginLine =
      pickGatedRecapPhrase(`${ctx.raceId}:margin`, RECAP_MARGIN_PHRASES, {
        margin: formatRaceScore(ctx.margin),
        runnerUp: ctx.runnerUp.name,
        rank: ordinal(ctx.runnerUp.finalRank),
      }) ??
      `, ${formatRaceScore(ctx.margin)} clear of ${ctx.runnerUp.name} in ${ordinal(ctx.runnerUp.finalRank)}`;
    pushNameSplit(segments, marginLine, ctx.runnerUp.name);
  }

  segments.push(text(". "));

  const lastLine =
    pickGatedRecapPhrase(`${ctx.raceId}:last`, RECAP_LAST_PHRASES, {
      loser: ctx.loser.name,
      score: formatRaceScore(ctx.loser.score),
    }) ??
    `${ctx.loser.name} finished last at ${formatRaceScore(ctx.loser.score)} and was eliminated to holding.`;
  pushNameSplit(segments, lastLine, ctx.loser.name);

  const chaosLines: string[] = [];
  const fightSegments = fightBeatSegments(ctx);

  if (ctx.injuryCount > 0) {
    pushGatedLine(
      `${ctx.raceId}:injury`,
      RECAP_INJURY_PHRASES,
      { count: ctx.injuryCount, injuryWord: ctx.injuryCount === 1 ? "y" : "ies" },
      `${ctx.injuryCount} injury${ctx.injuryCount === 1 ? "" : "ies"} forced racers off the track`,
      chaosLines
    );
  }

  if (ctx.delayTitle) {
    pushGatedLine(
      `${ctx.raceId}:delay`,
      RECAP_DELAY_PHRASES,
      { title: ctx.delayTitle.toLowerCase() },
      `the race went dark during ${ctx.delayTitle.toLowerCase()} — full delay`,
      chaosLines
    );
  }

  if (ctx.hadGodScore) {
    pushGatedLine(
      `${ctx.raceId}:god`,
      RECAP_GOD_SCORE_PHRASES,
      {},
      "somebody touched the forbidden 240 — GOD SCORE territory",
      chaosLines
    );
  }

  const chaosSurges = ctx.eventCounts.get("chaos_surge") ?? 0;
  if (chaosSurges > 0) {
    pushGatedLine(
      `${ctx.raceId}:chaos`,
      RECAP_CHAOS_SURGE_PHRASES,
      { count: chaosSurges, plural: chaosSurges === 1 ? "" : "s" },
      `${chaosSurges} chaos surge${chaosSurges === 1 ? "" : "s"} ripped through the field`,
      chaosLines
    );
  }

  const stalls = ctx.eventCounts.get("stall") ?? 0;
  if (stalls >= 8) {
    pushGatedLine(
      `${ctx.raceId}:stall`,
      RECAP_STALL_PHRASES,
      { count: stalls },
      `${stalls} stall events stopped racers cold`,
      chaosLines
    );
  }

  const surges = ctx.eventCounts.get("rank_surge") ?? 0;
  if (surges >= 3) {
    pushGatedLine(
      `${ctx.raceId}:surge`,
      RECAP_RANK_SURGE_PHRASES,
      { count: surges },
      `${surges} rank surges shook the standings`,
      chaosLines
    );
  }

  const collapses = ctx.eventCounts.get("collapse") ?? 0;
  if (collapses > 0) {
    pushGatedLine(
      `${ctx.raceId}:collapse`,
      RECAP_COLLAPSE_PHRASES,
      { count: collapses },
      `${collapses} late collapses torched the leaderboard`,
      chaosLines
    );
  }

  const underdogs = ctx.eventCounts.get("underdog") ?? 0;
  if (underdogs > 0) {
    pushGatedLine(
      `${ctx.raceId}:underdog`,
      RECAP_UNDERDOG_PHRASES,
      { count: underdogs, plural: underdogs === 1 ? "" : "s" },
      `underdog pressure flared ${underdogs} time${underdogs === 1 ? "" : "s"}`,
      chaosLines
    );
  }

  const weatherJoined = formatWeatherJoined(ctx.weatherCounts);
  if (weatherJoined && ctx.weatherTotal > 0) {
    pushGatedLine(
      `${ctx.raceId}:weather`,
      RECAP_WEATHER_PHRASES,
      { total: ctx.weatherTotal, joined: weatherJoined },
      `The elements went feral — ${ctx.weatherTotal} weather bursts, including ${weatherJoined}.`,
      chaosLines
    );
  }

  if (ctx.notableLines.length > 0) {
    const quote = ctx.notableLines[0].replace(/\s+/g, " ").trim().toLowerCase();
    if (quote.length > 0) {
      pushGatedLine(
        `${ctx.raceId}:quote`,
        RECAP_QUOTE_PHRASES,
        { quote },
        `the broadcast desk lost it: "${quote}"`,
        chaosLines
      );
    }
  }

  if (fightSegments || chaosLines.length > 0) {
    segments.push(text(" "));
    if (fightSegments) {
      segments.push(...fightSegments);
      if (chaosLines.length > 0) segments.push(text("; "));
    }
    if (chaosLines.length > 0) {
      segments.push(text(chaosLines.join("; ")));
    }
    segments.push(text("."));
  } else {
    const quiet =
      pickGatedRecapPhrase(`${ctx.raceId}:quiet`, RECAP_QUIET_PHRASES, {}) ??
      "No fights, no injuries, no race delay — just pure scoring warfare.";
    segments.push(text(` ${quiet}`));
  }

  return segments;
}

function dedupeFightPairs(pairs: RecapFightPair[]): RecapFightPair[] {
  const seen = new Set<string>();
  const out: RecapFightPair[] = [];
  for (const pair of pairs) {
    const a = formatRacerName(pair.a);
    const b = formatRacerName(pair.b);
    const key = [a, b].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ a, b });
  }
  return out;
}

async function loadFightPairs(
  supabase: SupabaseClient,
  raceId: string
): Promise<RecapFightPair[]> {
  const pairs: RecapFightPair[] = [];

  const [{ data: tickerRows }, { data: historyRows }] = await Promise.all([
    supabase
      .from("race_ticker_events")
      .select("message")
      .eq("race_id", raceId)
      .eq("event_type", "fight"),
    supabase
      .from("player_history")
      .select("event_text")
      .eq("race_id", raceId)
      .eq("event_type", "fight"),
  ]);

  for (const row of tickerRows ?? []) {
    const parsed = parseFightTickerMessage(row.message ?? "");
    if (parsed) pairs.push(parsed);
  }

  for (const row of historyRows ?? []) {
    const vs = (row.event_text ?? "").match(/^(.+?)\s+vs\.?\s+(.+)$/i);
    if (vs) pairs.push({ a: vs[1]!.trim(), b: vs[2]!.trim() });
  }

  return dedupeFightPairs(pairs).slice(0, 3);
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
  let delayTitle: string | null = null;
  let hadGodScore = false;
  const notableLines: string[] = [];

  for (const row of tickerRows ?? []) {
    eventCounts.set(row.event_type, (eventCounts.get(row.event_type) ?? 0) + 1);

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

  const fightPairs = await loadFightPairs(supabase, race.id);

  const weatherCounts = new Map<RaceWeatherType, number>();
  for (const row of weatherRows ?? []) {
    const type = row.weather_type as RaceWeatherType;
    weatherCounts.set(type, (weatherCounts.get(type) ?? 0) + 1);
  }

  const segments = composeRecapParagraph({
    raceId: race.id,
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

  return {
    raceNumber: race.race_number,
    paragraph: segmentsToParagraph(segments),
    segments,
  };
}
