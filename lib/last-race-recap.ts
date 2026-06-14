import type { LastRaceRecap, LastRaceRecapSegment } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatRacerName, ordinal } from "./format";
import { formatRaceScore } from "./score";
import { pickGatedRecapPhrase, finalizeRecapLine, validateRecapParagraph, cleanRecapTextSegment } from "./recap-grammar-gate";
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
  weatherTotal: number;
  injuryCount: number;
  fightPairs: RecapFightPair[];
  delayTitle: string | null;
  hadGodScore: boolean;
  notableLines: string[];
}

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

const MAX_CHAOS_CLAUSES = 1;

function stripClauseEnd(line: string): string {
  return line.replace(/[.;!?]+$/g, "").trim();
}

function pushGatedLine(
  seed: string,
  phrases: readonly string[],
  vars: Record<string, string | number>,
  fallback: string,
  target: string[]
): void {
  const line = pickGatedRecapPhrase(seed, phrases, vars) ?? fallback;
  target.push(stripClauseEnd(line));
}

interface ChaosCandidate {
  priority: number;
  seed: string;
  phrases: readonly string[];
  vars: Record<string, string | number>;
  fallback: string;
}

function pickChaosHighlights(ctx: RecapContext, limit: number): string[] {
  const candidates: ChaosCandidate[] = [];

  if (ctx.injuryCount > 0) {
    candidates.push({
      priority: 1,
      seed: `${ctx.raceId}:injury`,
      phrases: RECAP_INJURY_PHRASES,
      vars: { count: ctx.injuryCount, injuryWord: ctx.injuryCount === 1 ? "y" : "ies" },
      fallback: `${ctx.injuryCount} injury${ctx.injuryCount === 1 ? "" : "ies"} forced racers off the track`,
    });
  }

  if (ctx.delayTitle) {
    candidates.push({
      priority: 2,
      seed: `${ctx.raceId}:delay`,
      phrases: RECAP_DELAY_PHRASES,
      vars: { title: ctx.delayTitle.toLowerCase() },
      fallback: `the race went dark during ${ctx.delayTitle.toLowerCase()} — full delay`,
    });
  }

  if (ctx.hadGodScore) {
    candidates.push({
      priority: 3,
      seed: `${ctx.raceId}:god`,
      phrases: RECAP_GOD_SCORE_PHRASES,
      vars: {},
      fallback: "somebody touched the forbidden 240 — GOD SCORE territory",
    });
  }

  const chaosSurges = ctx.eventCounts.get("chaos_surge") ?? 0;
  if (chaosSurges > 0) {
    candidates.push({
      priority: 4,
      seed: `${ctx.raceId}:chaos`,
      phrases: RECAP_CHAOS_SURGE_PHRASES,
      vars: { count: chaosSurges, plural: chaosSurges === 1 ? "" : "s" },
      fallback: `${chaosSurges} chaos surge${chaosSurges === 1 ? "" : "s"} ripped through the field`,
    });
  }

  const collapses = ctx.eventCounts.get("collapse") ?? 0;
  if (collapses > 0) {
    candidates.push({
      priority: 5,
      seed: `${ctx.raceId}:collapse`,
      phrases: RECAP_COLLAPSE_PHRASES,
      vars: { count: collapses, plural: collapses === 1 ? "" : "s" },
      fallback: `${collapses} collapse${collapses === 1 ? "" : "s"} gutted the back half`,
    });
  }

  const stalls = ctx.eventCounts.get("stall") ?? 0;
  if (stalls >= 12) {
    candidates.push({
      priority: 6,
      seed: `${ctx.raceId}:stall`,
      phrases: RECAP_STALL_PHRASES,
      vars: { count: stalls },
      fallback: `${stalls} long stalls froze the field`,
    });
  }

  if (ctx.weatherTotal >= 12) {
    candidates.push({
      priority: 7,
      seed: `${ctx.raceId}:weather`,
      phrases: RECAP_WEATHER_PHRASES,
      vars: { total: ctx.weatherTotal },
      fallback: `the sky went wild — ${ctx.weatherTotal} weather bursts`,
    });
  }

  const underdogs = ctx.eventCounts.get("underdog") ?? 0;
  if (underdogs >= 3) {
    candidates.push({
      priority: 8,
      seed: `${ctx.raceId}:underdog`,
      phrases: RECAP_UNDERDOG_PHRASES,
      vars: { count: underdogs, plural: underdogs === 1 ? "" : "s" },
      fallback: `underdog pressure flared ${underdogs} times`,
    });
  }

  candidates.sort((a, b) => a.priority - b.priority);

  const lines: string[] = [];
  for (const candidate of candidates) {
    if (lines.length >= limit) break;
    pushGatedLine(
      candidate.seed,
      candidate.phrases,
      candidate.vars,
      candidate.fallback,
      lines
    );
  }

  return lines;
}

function pushNameSplit(
  segments: LastRaceRecapSegment[],
  line: string,
  name: string
): void {
  const keys = [formatRacerName(name), name.trim(), name.trim().toLowerCase()];
  for (const key of keys) {
    if (!key || !line.includes(key)) continue;
    const parts = line.split(key);
    if (parts.length === 2) {
      segments.push(text(parts[0]!), racer(name), text(parts[1]!));
      return;
    }
  }
  segments.push(text(line));
}

function capitalizeNamesAtSentenceStarts(
  segments: LastRaceRecapSegment[]
): LastRaceRecapSegment[] {
  let priorText = "";

  return segments.map((segment) => {
    if (segment.kind === "text") {
      priorText = segment.value;
      return segment;
    }

    const atSentenceStart =
      priorText.length === 0 || /[.!?]["']?\s*$/.test(priorText);
    priorText = segment.value;

    if (!atSentenceStart) return segment;

    const value = segment.value;
    return {
      ...segment,
      value: value.charAt(0).toUpperCase() + value.slice(1),
    };
  });
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
      return [racer(pair.a), text(" and "), racer(pair.b), text(" scrapped in the middle of the pack")];
    }
    return [racer(pair.a), text(" and "), racer(pair.b), text(" threw down mid-race")];
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

function composeRecapParagraph(ctx: RecapContext, maxChaos = MAX_CHAOS_CLAUSES): LastRaceRecapSegment[] {
  const segments: LastRaceRecapSegment[] = [];

  segments.push(text(`Race ${ctx.raceNumber} ${pickOpener(ctx.raceNumber)}. `));

  const winLead =
    pickGatedRecapPhrase(`${ctx.raceId}:win`, RECAP_WIN_PHRASES, {
      winner: formatRacerName(ctx.winner.name),
      score: formatRaceScore(ctx.winner.score),
    }) ??
    `${formatRacerName(ctx.winner.name)} seized the win at ${formatRaceScore(ctx.winner.score)} points`;
  pushNameSplit(segments, winLead, ctx.winner.name);

  if (ctx.runnerUp && ctx.margin > 0) {
    const marginLine =
      pickGatedRecapPhrase(`${ctx.raceId}:margin`, RECAP_MARGIN_PHRASES, {
        margin: formatRaceScore(ctx.margin),
        runnerUp: formatRacerName(ctx.runnerUp.name),
        rank: ordinal(ctx.runnerUp.finalRank),
      }) ??
      `, ${formatRaceScore(ctx.margin)} clear of ${formatRacerName(ctx.runnerUp.name)} in ${ordinal(ctx.runnerUp.finalRank)}`;
    pushNameSplit(segments, marginLine, ctx.runnerUp.name);
  }

  segments.push(text(". "));

  const lastLine =
    pickGatedRecapPhrase(`${ctx.raceId}:last`, RECAP_LAST_PHRASES, {
      loser: formatRacerName(ctx.loser.name),
      score: formatRaceScore(ctx.loser.score),
    }) ??
    `${formatRacerName(ctx.loser.name)} finished last at ${formatRaceScore(ctx.loser.score)} and was eliminated to holding.`;
  pushNameSplit(segments, lastLine, ctx.loser.name);

  const fightSegments = fightBeatSegments(ctx);
  const chaosLines = pickChaosHighlights(ctx, maxChaos);

  if (fightSegments || chaosLines.length > 0) {
    segments.push(text(" "));
    if (fightSegments) {
      segments.push(...fightSegments);
    }
    if (chaosLines.length > 0) {
      const prefix = fightSegments ? "; " : "";
      segments.push(text(`${prefix}${chaosLines.join("; ")}.`));
    } else {
      segments.push(text("."));
    }
  } else {
    const quiet =
      pickGatedRecapPhrase(`${ctx.raceId}:quiet`, RECAP_QUIET_PHRASES, {}) ??
      "No fights, no injuries, no race delay — just pure scoring warfare.";
    segments.push(text(` ${quiet}`));
  }

  return segments;
}

function finalizeRecapSegments(segments: LastRaceRecapSegment[]): LastRaceRecapSegment[] {
  const cleaned = segments.map((segment) =>
    segment.kind === "text"
      ? { ...segment, value: cleanRecapTextSegment(segment.value) }
      : segment
  );
  return capitalizeNamesAtSentenceStarts(cleaned);
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

const ABILITY_GAIN_RE =
  /(?:SIGNATURE\s+)?(GRIT|CHAOS|NERVE|LUCK|BURST|DRAG)\s+\+(\d+)/i;

interface ParsedAbilityGain {
  name: string;
  stat: string;
  delta: number;
}

function parseAbilityGainEvent(name: string, eventText: string): ParsedAbilityGain[] {
  const match = eventText.match(ABILITY_GAIN_RE);
  if (!match) return [];
  return [
    {
      name: formatRacerName(name),
      stat: match[1]!.toLowerCase(),
      delta: Number(match[2]),
    },
  ];
}

async function loadAbilityGains(
  supabase: SupabaseClient,
  raceId: string
): Promise<ParsedAbilityGain[]> {
  const { data: rows, error } = await supabase
    .from("player_history")
    .select("event_text, player:players!player_history_player_id_fkey(name)")
    .eq("race_id", raceId)
    .in("event_type", ["growth", "recovery", "bad_money", "mutation"]);

  if (error) throw error;
  if (!rows?.length) return [];

  const gains: ParsedAbilityGain[] = [];
  for (const row of rows) {
    const player = row.player as { name: string } | { name: string }[] | null;
    const name = Array.isArray(player) ? player[0]?.name : player?.name;
    if (!name) continue;
    gains.push(...parseAbilityGainEvent(name, row.event_text ?? ""));
  }

  return gains;
}

function formatGainList(gains: { stat: string; delta: number }[]): string {
  const parts = gains.map((gain) => `${gain.stat} +${gain.delta}`);
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

function composeAbilityGainsParagraph(
  gains: ParsedAbilityGain[]
): LastRaceRecapSegment[] | null {
  const byPlayer = new Map<string, Map<string, number>>();

  for (const gain of gains) {
    if (gain.delta <= 0) continue;
    const stats = byPlayer.get(gain.name) ?? new Map<string, number>();
    stats.set(gain.stat, (stats.get(gain.stat) ?? 0) + gain.delta);
    byPlayer.set(gain.name, stats);
  }

  if (byPlayer.size === 0) return null;

  const ranked = [...byPlayer.entries()]
    .map(([name, stats]) => ({
      name,
      gains: [...stats.entries()]
        .map(([stat, delta]) => ({ stat, delta }))
        .sort((a, b) => b.delta - a.delta || a.stat.localeCompare(b.stat)),
      total: [...stats.values()].reduce((sum, delta) => sum + delta, 0),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, 3);

  const segments: LastRaceRecapSegment[] = [text("Coming out of the race, ")];

  ranked.forEach((entry, index) => {
    if (index > 0) {
      segments.push(text(index === ranked.length - 1 ? "; and " : "; "));
    }
    const line = `${entry.name} picked up ${formatGainList(entry.gains)}`;
    pushNameSplit(segments, line, entry.name);
  });

  segments.push(text("."));
  return segments;
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

  const [
    { data: tickerRows },
    { data: weatherRows },
    { data: injuryRows },
    fightPairs,
    abilityGains,
  ] = await Promise.all([
    supabase
      .from("race_ticker_events")
      .select("event_type, message, player_id")
      .eq("race_id", race.id),
    supabase.from("race_weather_events").select("weather_type").eq("race_id", race.id),
    supabase.from("injury_events").select("id").eq("race_id", race.id),
    loadFightPairs(supabase, race.id),
    loadAbilityGains(supabase, race.id),
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

  const weatherTotal = weatherRows?.length ?? 0;

  const recapCtx: RecapContext = {
    raceId: race.id,
    raceNumber: race.race_number,
    winner,
    loser,
    runnerUp,
    margin: runnerUp ? Math.max(0, winner.score - runnerUp.score) : 0,
    eventCounts,
    weatherTotal,
    injuryCount: injuryRows?.length ?? 0,
    fightPairs,
    delayTitle,
    hadGodScore,
    notableLines,
  };

  let segments = composeRecapParagraph(recapCtx);
  segments = finalizeRecapSegments(segments);
  let paragraph = segmentsToParagraph(segments);
  if (!validateRecapParagraph(paragraph).ok) {
    segments = finalizeRecapSegments(composeRecapParagraph(recapCtx, 0));
    paragraph = segmentsToParagraph(segments);
  }

  const abilityGainsSegments = composeAbilityGainsParagraph(abilityGains);
  const abilityGainsParagraph = abilityGainsSegments
    ? segmentsToParagraph(abilityGainsSegments)
    : undefined;

  return {
    raceNumber: race.race_number,
    paragraph,
    segments,
    abilityGainsParagraph,
    abilityGainsSegments: abilityGainsSegments ?? undefined,
  };
}
