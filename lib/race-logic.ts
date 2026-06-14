import type { SupabaseClient } from "@supabase/supabase-js";
import { getNextRaceDayBounds, getRaceDayBounds, getFirstRaceLiveBounds } from "./eastern-time";
import { SEED_ACTIVE_NAMES, generateUniqueName } from "./name-generator";
import { ordinal, slugify } from "./format";
import { seededBool, seededInt, seededRange } from "./seeded-rng";
import { processRaceSupports } from "./support-db";
import { saveTickerEvents } from "./ticker-db";
import {
  generateFinalizeTickerEvents,
  generateRaceStartTickerEvents,
  generateTickTickerEvents,
  type TickerEntrySnapshot,
} from "./ticker-logic";
import type { Player, Race, RaceEntry, RaceEntryWithPlayer } from "./types";

export const TICKS_PER_RACE = 48;
/** @deprecated use TICKS_PER_RACE */
export const TICKS_PER_DAY = TICKS_PER_RACE;
export const EXPECTED_DELTA = 100 / TICKS_PER_RACE;

export { getRaceDayBounds, getNextRaceDayBounds, getFirstRaceLiveBounds, getRaceOneBounds } from "./eastern-time";

export function getRaceTickIntervalMs(startedAt: Date, endsAt: Date): number {
  const durationMs = Math.max(1, endsAt.getTime() - startedAt.getTime());
  return durationMs / TICKS_PER_RACE;
}

export function getTickNumber(startedAt: Date, endsAt: Date, now: Date = new Date()): number {
  const elapsedMs = now.getTime() - startedAt.getTime();
  if (elapsedMs <= 0) return 0;
  const tickMs = getRaceTickIntervalMs(startedAt, endsAt);
  return Math.min(TICKS_PER_RACE - 1, Math.floor(elapsedMs / tickMs));
}

export interface TickDeltaInput {
  raceId: string;
  playerId: string;
  tickNumber: number;
  dayNumber: number;
  percentComplete: number;
  player: Player;
  currentProgress: number;
  chaosBurstUsed: boolean;
}

export interface TickDeltaResult {
  delta: number;
  eventNote: string | null;
  chaosBurstUsed: boolean;
}

export function calculatePercentComplete(startedAt: Date, endsAt: Date, now: Date = new Date()): number {
  const total = endsAt.getTime() - startedAt.getTime();
  if (total <= 0) return 100;
  const elapsed = now.getTime() - startedAt.getTime();
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
}

export function calculateTickDelta(input: TickDeltaInput): TickDeltaResult {
  const {
    raceId,
    playerId,
    tickNumber,
    dayNumber,
    percentComplete,
    player,
    currentProgress,
  } = input;
  let chaosBurstUsed = input.chaosBurstUsed;

  const seedBase = `${raceId}:${playerId}:${tickNumber}:delta`;
  const lateRaceFactor =
    percentComplete < 50 ? 0.5 : percentComplete <= 80 ? 1.0 : 1.5;

  const chaosMin = -player.chaos * 0.2;
  const chaosMax = player.chaos * 0.25;
  const chaosRandomComponent = seededRange(`${seedBase}:chaos`, chaosMin, chaosMax);

  let rookieBonus = 0;
  if (player.rookie_until_day != null && dayNumber <= player.rookie_until_day) {
    rookieBonus = seededRange(`${seedBase}:rookie`, -8, 12);
  }

  let comebackBonus = 0;
  if (player.comeback_until_day != null && dayNumber <= player.comeback_until_day) {
    comebackBonus = seededRange(`${seedBase}:comeback`, 0, 10) - player.pressure * 0.05;
  }

  const pressurePenalty =
    player.pressure *
    seededRange(`${seedBase}:pressure`, 0.05, 0.18) *
    (1 - player.nerve / 200);

  const fatiguePenalty =
    player.fatigue *
    seededRange(`${seedBase}:fatigue`, 0.03, 0.15) *
    (1 - player.grit / 200);

  const baseSkill =
    player.rating * 0.35 +
    player.grit * 0.16 +
    player.nerve * 0.12 +
    player.luck * 0.08 +
    player.burst * lateRaceFactor * 0.14 +
    chaosRandomComponent -
    player.drag * 0.1 -
    player.fatigue * 0.08 -
    pressurePenalty;

  const normalizedSkill = Math.max(0, Math.min(100, baseSkill + rookieBonus + comebackBonus)) / 100;
  const skillMultiplier = 0.65 + normalizedSkill * 0.9;

  const wildSwingBase = seededRange(`${seedBase}:wild`, -0.8, 1.2);
  const wildSwing = wildSwingBase * (1 + player.chaos / 200);

  let delta = EXPECTED_DELTA * skillMultiplier + wildSwing;
  let eventNote: string | null = null;

  // Rare chaos burst
  if (
    !chaosBurstUsed &&
    player.chaos >= 55 &&
    seededBool(`${seedBase}:burst`, 0.04 + player.chaos / 500)
  ) {
    const burst = seededRange(`${seedBase}:burstamt`, 3, 8);
    delta += burst;
    chaosBurstUsed = true;
    eventNote = "CHAOS SURGE";
  }

  // Rare collapse
  if (
    seededBool(`${seedBase}:collapse`, 0.03 + player.drag / 400) &&
    currentProgress > 5
  ) {
    const drop = seededRange(`${seedBase}:drop`, 1, 5);
    delta -= drop;
    eventNote = eventNote ? `${eventNote} / COLLAPSE` : "COLLAPSE";
  }

  // Occasional stall
  if (seededBool(`${seedBase}:stall`, 0.06) && delta > 0.2) {
    delta *= 0.35;
    eventNote = eventNote ? `${eventNote} / STALL` : "STALL";
  }

  delta = Math.max(0, Math.min(4.5, delta));

  // Cap progress before final 10%
  const maxAllowed =
    percentComplete >= 90 ? 100 : Math.min(99, percentComplete + 8);
  const newProgress = currentProgress + delta;
  if (newProgress > maxAllowed) {
    delta = Math.max(0, maxAllowed - currentProgress);
  }

  return { delta, eventNote, chaosBurstUsed };
}

export function rollPlayerStats(seed: string): {
  grit: number;
  chaos: number;
  nerve: number;
  luck: number;
  burst: number;
  drag: number;
  rating: number;
  volatility: number;
} {
  const rating = seededInt(`${seed}:rating`, 42, 68);
  const grit = seededInt(`${seed}:grit`, 25, 80);
  const chaos = seededInt(`${seed}:chaos`, 25, 80);
  const nerve = seededInt(`${seed}:nerve`, 25, 80);
  const luck = seededInt(`${seed}:luck`, 25, 80);
  const burst = seededInt(`${seed}:burst`, 25, 80);
  const drag = seededInt(`${seed}:drag`, 5, 60);
  const volatility = seededInt(`${seed}:volatility`, 20, 80);
  return { grit, chaos, nerve, luck, burst, drag, rating, volatility };
}

export function buildPlayerInsert(
  name: string,
  slug: string,
  status: "active" | "holding",
  createdDay: number,
  seed: string
) {
  const stats = rollPlayerStats(seed);
  return {
    name: name.toUpperCase(),
    slug,
    status,
    created_day: createdDay,
    age_days: 0,
    active_days: 0,
    holding_days: status === "holding" ? 0 : 0,
    races: 0,
    wins: 0,
    eliminations: 0,
    returns: 0,
    best_finish: null,
    worst_finish: null,
    current_streak_type: "none" as const,
    current_streak_count: 0,
    longest_win_streak: 0,
    total_holding_days: 0,
    ...stats,
    fatigue: 0,
    pressure: 0,
    rookie_until_day: status === "active" ? createdDay + 7 : null,
    comeback_until_day: null,
    total_support_received: 0,
    seed,
  };
}

export async function initializeGameIfNeeded(supabase: SupabaseClient): Promise<boolean> {
  const { data: existing } = await supabase.from("game_state").select("id").eq("id", 1).maybeSingle();
  if (existing) return false;

  const { startedAt, endsAt } = getFirstRaceLiveBounds();
  const existingSlugs = new Set<string>();

  const activePlayers = SEED_ACTIVE_NAMES.map((name, i) => {
    const slug = slugify(name);
    existingSlugs.add(slug);
    return buildPlayerInsert(name, slug, "active", 1, `seed-active-${i}`);
  });

  const { data: insertedActive, error: activeErr } = await supabase
    .from("players")
    .insert(activePlayers)
    .select("id, status");

  if (activeErr) throw activeErr;

  const activeIds = (insertedActive || [])
    .filter((p) => p.status === "active")
    .map((p) => p.id);

  const { data: race, error: raceErr } = await supabase
    .from("races")
    .insert({
      race_number: 1,
      day_number: 1,
      status: "active",
      started_at: startedAt.toISOString(),
      ends_at: endsAt.toISOString(),
      percent_complete: calculatePercentComplete(startedAt, endsAt),
    })
    .select("*")
    .single();

  if (raceErr) throw raceErr;

  const shuffledIds = shuffleLanes(activeIds, 1);
  const entries = shuffledIds.map((playerId, idx) => {
    const progress = seededRange(`${race.id}:${playerId}:init`, 0, 6);
    return {
      race_id: race.id,
      player_id: playerId,
      lane: idx + 1,
      progress,
      displayed_progress: Math.round(progress),
      current_rank: 1,
      last_delta: 0,
      race_score: progress,
      condition: 0,
    };
  });

  const ranked = rankEntries(entries);
  const { error: entryErr } = await supabase.from("race_entries").insert(ranked);
  if (entryErr) throw entryErr;

  const { error: gsErr } = await supabase.from("game_state").insert({
    id: 1,
    current_day: 1,
    current_race_number: 1,
    last_tick_at: new Date().toISOString(),
  });
  if (gsErr) throw gsErr;

  return true;
}

export function shuffleLanes(playerIds: string[], dayNumber: number): string[] {
  const arr = [...playerIds];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = seededInt(`${dayNumber}:lane-shuffle:${i}`, 0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function rankEntries<T extends { progress: number; player_id?: string; id?: string }>(
  entries: T[]
): (T & { current_rank: number; race_score: number; displayed_progress: number })[] {
  const sorted = [...entries].sort((a, b) => b.progress - a.progress);
  return sorted.map((e, i) => ({
    ...e,
    current_rank: i + 1,
    race_score: e.progress,
    displayed_progress: Math.round(e.progress),
  }));
}

export async function tickRace(supabase: SupabaseClient): Promise<void> {
  const now = new Date();
  const { data: race, error: raceErr } = await supabase
    .from("races")
    .select("*")
    .eq("status", "active")
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (raceErr) throw raceErr;
  if (!race) return;

  const startedAt = new Date(race.started_at);
  const endsAt = new Date(race.ends_at);

  if (now > endsAt) {
    await finalizeRace(supabase, race as Race);
    return;
  }

  const percentComplete = calculatePercentComplete(startedAt, endsAt, now);
  const tickNumber = getTickNumber(startedAt, endsAt, now);

  const { data: entries, error: entriesErr } = await supabase
    .from("race_entries")
    .select("*, player:players(*)")
    .eq("race_id", race.id);

  if (entriesErr) throw entriesErr;
  if (!entries?.length) return;

  const chaosUsed = new Map<string, boolean>();
  for (const entry of entries) {
    if (entry.event_note?.includes("CHAOS SURGE")) {
      chaosUsed.set(entry.player_id, true);
    }
  }

  const beforeSnapshots: TickerEntrySnapshot[] = entries.map((entry) => ({
    player_id: entry.player_id,
    player: entry.player as Player,
    current_rank: entry.current_rank,
    progress: Number(entry.progress),
    last_delta: Number(entry.last_delta),
    event_note: entry.event_note,
  }));

  const updated = entries.map((entry) => {
    const player = entry.player as Player;
    const result = calculateTickDelta({
      raceId: race.id,
      playerId: entry.player_id,
      tickNumber,
      dayNumber: race.day_number,
      percentComplete,
      player,
      currentProgress: Number(entry.progress),
      chaosBurstUsed: chaosUsed.get(entry.player_id) ?? false,
    });

    const newProgress = Math.max(0, Number(entry.progress) + result.delta);
    return {
      ...entry,
      progress: newProgress,
      displayed_progress: Math.round(newProgress),
      last_delta: result.delta,
      event_note: result.eventNote,
      race_score: newProgress,
    };
  });

  const ranked = rankEntries(updated).map((entry) => {
    const prev = beforeSnapshots.find((b) => b.player_id === entry.player_id);
    const last_rank_change = prev ? prev.current_rank - entry.current_rank : 0;
    return { ...entry, last_rank_change };
  });

  const afterSnapshots: TickerEntrySnapshot[] = ranked.map((entry) => ({
    player_id: entry.player_id,
    player: entry.player as Player,
    current_rank: entry.current_rank,
    progress: Number(entry.progress),
    last_delta: Number(entry.last_delta),
    event_note: entry.event_note,
  }));

  const tickerEvents = generateTickTickerEvents(
    beforeSnapshots,
    afterSnapshots,
    percentComplete,
    race.id,
    tickNumber
  );
  await saveTickerEvents(supabase, race.id, tickNumber, tickerEvents);

  for (const entry of ranked) {
    await supabase
      .from("race_entries")
      .update({
        progress: entry.progress,
        displayed_progress: entry.displayed_progress,
        current_rank: entry.current_rank,
        last_delta: entry.last_delta,
        last_rank_change: entry.last_rank_change,
        event_note: entry.event_note,
        race_score: entry.race_score,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entry.id);
  }

  await supabase
    .from("races")
    .update({ percent_complete: percentComplete })
    .eq("id", race.id);

  await supabase
    .from("game_state")
    .update({ last_tick_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("id", 1);
}

export async function finalizeRace(
  supabase: SupabaseClient,
  race: Race,
  options: { createNextRace?: boolean } = {}
): Promise<void> {
  const createNextRace = options.createNextRace ?? true;
  if (race.status === "finalized") return;

  const now = new Date();
  const tickNumber = TICKS_PER_RACE - 1;

  const { data: entries, error: entriesErr } = await supabase
    .from("race_entries")
    .select("*, player:players(*)")
    .eq("race_id", race.id);

  if (entriesErr) throw entriesErr;
  if (!entries?.length) return;

  // Final tick pass
  let processed = entries.map((entry) => {
    const player = entry.player as Player;
    const result = calculateTickDelta({
      raceId: race.id,
      playerId: entry.player_id,
      tickNumber,
      dayNumber: race.day_number,
      percentComplete: 100,
      player,
      currentProgress: Number(entry.progress),
      chaosBurstUsed: false,
    });
    let newProgress = Math.max(0, Number(entry.progress) + result.delta);
    return { ...entry, progress: newProgress, player };
  });

  let ranked = rankEntries(processed);
  const leaderProgress = Number(ranked[0]?.progress ?? 0);
  if (ranked[0]) {
    ranked[0].progress = 100;
    ranked[0].displayed_progress = 100;
    ranked[0].race_score = 100;
    for (let i = 1; i < ranked.length; i++) {
      const ratio = leaderProgress > 0 ? Number(ranked[i].progress) / leaderProgress : 0.5;
      const scaled = Math.min(99, Math.max(1, Math.round(100 * ratio * 0.95)));
      ranked[i].progress = scaled;
      ranked[i].displayed_progress = scaled;
      ranked[i].race_score = scaled;
    }
    ranked = rankEntries(ranked);
  }

  for (let i = 0; i < ranked.length; i++) {
    ranked[i].current_rank = i + 1;
    ranked[i].final_rank = i + 1;
  }

  const { data: gameState } = await supabase.from("game_state").select("*").eq("id", 1).single();
  const currentDay = gameState?.current_day ?? race.day_number;

  const allTimeTop = await getAllTimeTop3(supabase);
  const top3Ids = new Set(allTimeTop.map((p) => p.id));

  // Age existing holding pool before today's eliminee joins them
  await updateHoldingPlayers(supabase, currentDay);

  for (const entry of ranked) {
    const player = entry.player as Player;
    const finish = entry.final_rank ?? entry.current_rank;
    const isWinner = finish === 1;
    const isLast = finish === 8;

    await supabase
      .from("race_entries")
      .update({
        progress: entry.progress,
        displayed_progress: entry.displayed_progress,
        current_rank: entry.current_rank,
        final_rank: entry.final_rank,
        race_score: entry.race_score,
        updated_at: now.toISOString(),
      })
      .eq("id", entry.id);

    const updates = mutatePlayerAfterRace(player, finish, isWinner, currentDay, top3Ids.has(player.id));

    if (isLast) {
      updates.status = "holding";
      updates.eliminations = player.eliminations + 1;
      updates.holding_days = player.holding_days + 1;
      updates.total_holding_days = player.total_holding_days + 1;
      updates.pressure = Math.max(0, (updates.pressure ?? player.pressure) - 8);
      updates.fatigue = Math.max(0, (updates.fatigue ?? player.fatigue) - 3);
      await addHistory(
        supabase,
        player.id,
        race.id,
        currentDay,
        "eliminated",
        "ELIMINATED TO HOLDING",
        finish,
        Math.round(Number(entry.progress))
      );
    }

    if (isWinner) {
      updates.wins = player.wins + 1;
      updates.pressure = (updates.pressure ?? player.pressure) + 6;
      updates.fatigue = (updates.fatigue ?? player.fatigue) + 4;
      if (seededBool(`${race.id}:${player.id}:rating`, 0.35)) {
        updates.rating = Math.min(100, player.rating + seededInt(`${race.id}:${player.id}:ratingamt`, 0, 2));
      }
      await addHistory(
        supabase,
        player.id,
        race.id,
        currentDay,
        "won",
        `WON RACE ${race.race_number}`,
        finish,
        100
      );
    } else {
      await addHistory(
        supabase,
        player.id,
        race.id,
        currentDay,
        "finished",
        `FINISHED ${ordinal(finish)}`,
        finish,
        Math.round(Number(entry.progress))
      );
    }

    await supabase.from("players").update({ ...updates, updated_at: now.toISOString() }).eq("id", player.id);
  }

  await supabase
    .from("races")
    .update({
      status: "finalized",
      finalized_at: now.toISOString(),
      percent_complete: 100,
    })
    .eq("id", race.id);

  await processRaceSupports(supabase, race, currentDay);

  const winnerEntry = ranked.find((e) => e.final_rank === 1);
  const lastEntry = ranked.find((e) => e.final_rank === 8);
  if (winnerEntry && lastEntry) {
    const finalizeMessages = generateFinalizeTickerEvents(
      (winnerEntry.player as Player).name,
      (lastEntry.player as Player).name,
      race.race_number,
      winnerEntry.player_id,
      lastEntry.player_id
    );
    await saveTickerEvents(supabase, race.id, TICKS_PER_RACE, finalizeMessages);
  }

  const replacement = await chooseReplacement(supabase, currentDay + 1);

  if (!createNextRace) {
    await supabase
      .from("game_state")
      .update({
        last_tick_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", 1);
    return;
  }

  const nextDay = currentDay + 1;
  const nextRaceNumber = race.race_number + 1;
  const { startedAt, endsAt } = getNextRaceDayBounds(new Date(race.ends_at));

  const { data: activePlayers } = await supabase.from("players").select("id").eq("status", "active");
  const rosterIds = (activePlayers || []).map((p) => p.id);
  if (!rosterIds.includes(replacement.id)) {
    rosterIds.push(replacement.id);
  }
  while (rosterIds.length > 8) {
    const idx = rosterIds.findIndex((id) => id !== replacement.id);
    if (idx >= 0) rosterIds.splice(idx, 1);
  }
  while (rosterIds.length < 8) {
    rosterIds.push(replacement.id);
  }

  await createRace(supabase, nextDay, nextRaceNumber, rosterIds.slice(0, 8), startedAt, endsAt);

  await supabase
    .from("game_state")
    .update({
      current_day: nextDay,
      current_race_number: nextRaceNumber,
      last_tick_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", 1);
}

export function mutatePlayerAfterRace(
  player: Player,
  finish: number,
  isWinner: boolean,
  currentDay: number,
  isTop3AllTime: boolean
): Partial<Player> {
  const updates: Partial<Player> = {
    races: player.races + 1,
    active_days: player.active_days + 1,
    age_days: player.age_days + 1,
    best_finish: player.best_finish == null ? finish : Math.min(player.best_finish, finish),
    worst_finish: player.worst_finish == null ? finish : Math.max(player.worst_finish, finish),
  };

  if (isWinner) {
    updates.current_streak_type = "win";
    updates.current_streak_count = player.current_streak_type === "win" ? player.current_streak_count + 1 : 1;
    updates.longest_win_streak = Math.max(
      player.longest_win_streak,
      updates.current_streak_count as number
    );
  } else if (finish <= 3) {
    updates.current_streak_type = player.current_streak_type;
    updates.current_streak_count = player.current_streak_count;
    updates.fatigue = player.fatigue + 2;
    updates.pressure = player.pressure + 2;
  } else {
    updates.current_streak_type = "lose";
    updates.current_streak_count =
      player.current_streak_type === "lose" ? player.current_streak_count + 1 : 1;
  }

  if (finish <= 3 && !isWinner) {
    updates.fatigue = (updates.fatigue ?? player.fatigue) + 1;
    updates.pressure = (updates.pressure ?? player.pressure) + 1;
  }

  if (isTop3AllTime) {
    updates.pressure = (updates.pressure ?? player.pressure) + 2;
  }

  if (player.active_days > 60 && seededBool(`${player.id}:${currentDay}:veteran`, 0.08)) {
    const stat = seededPickStat(`${player.id}:${currentDay}:decay`);
    updates[stat] = Math.max(20, (player[stat] as number) - 1);
  }
  if (player.active_days > 120 && seededBool(`${player.id}:${currentDay}:veteran2`, 0.12)) {
    const stat = seededPickStat(`${player.id}:${currentDay}:decay2`);
    updates[stat] = Math.max(15, ((updates[stat] as number) ?? (player[stat] as number)) - 1);
  }

  if (seededBool(`${player.id}:${currentDay}:mutate`, 0.06)) {
    const stat = seededPickStat(`${player.id}:${currentDay}:mut`);
    const delta = seededInt(`${player.id}:${currentDay}:mutd`, -2, 2);
    updates[stat] = Math.max(1, Math.min(100, (player[stat] as number) + delta));
  }

  return updates;
}

function seededPickStat(seed: string): keyof Pick<Player, "grit" | "chaos" | "nerve" | "luck" | "burst" | "drag"> {
  const stats = ["grit", "chaos", "nerve", "luck", "burst", "drag"] as const;
  return stats[seededInt(seed, 0, stats.length - 1)];
}

export async function updateHoldingPlayers(supabase: SupabaseClient, currentDay: number): Promise<void> {
  const { data: holding } = await supabase
    .from("players")
    .select("*")
    .eq("status", "holding")
    .gte("races", 1);
  if (!holding?.length) return;

  for (const player of holding) {
    const updates: Partial<Player> = {
      holding_days: player.holding_days + 1,
      total_holding_days: player.total_holding_days + 1,
      age_days: player.age_days + 1,
      pressure: Math.max(0, player.pressure - 2),
      fatigue: Math.max(0, player.fatigue - 3),
    };

    if (seededBool(`${player.id}:${currentDay}:holdmut`, 0.05)) {
      const stat = seededPickStat(`${player.id}:${currentDay}:holdmuts`);
      const delta = seededInt(`${player.id}:${currentDay}:holdmutd`, -1, 3);
      updates[stat] = Math.max(1, Math.min(100, (player[stat] as number) + delta));
    }

    await supabase.from("players").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", player.id);
  }
}

export async function chooseReplacement(supabase: SupabaseClient, nextDay: number): Promise<Player> {
  const { data: holding } = await supabase
    .from("players")
    .select("*")
    .eq("status", "holding")
    .gte("races", 1);

  if (holding?.length && seededBool(`${nextDay}:replacement`, 0.3)) {
    const idx = seededInt(`${nextDay}:replacement-pick`, 0, holding.length - 1);
    const picked = holding[idx];
    await supabase
      .from("players")
      .update({
        status: "active",
        returns: picked.returns + 1,
        comeback_until_day: nextDay + 3,
        holding_days: picked.holding_days,
        updated_at: new Date().toISOString(),
      })
      .eq("id", picked.id);

    await addHistory(
      supabase,
      picked.id,
      null,
      nextDay,
      "returned",
      "RETURNED FROM HOLDING",
      null,
      null
    );

    return { ...picked, status: "active", returns: picked.returns + 1, comeback_until_day: nextDay + 3 };
  }

  return createPlayer(supabase, "active", nextDay);
}

export async function createPlayer(
  supabase: SupabaseClient,
  status: "active" | "holding",
  day: number
): Promise<Player> {
  const { data: existing } = await supabase.from("players").select("slug");
  const slugs = new Set((existing || []).map((p) => p.slug));
  const { name, slug } = generateUniqueName(`new-player-${day}-${Date.now()}`, slugs);
  const seed = `player-${slug}-${day}`;
  const insert = buildPlayerInsert(name, slug, status, day, seed);

  const { data, error } = await supabase.from("players").insert(insert).select("*").single();
  if (error) throw error;
  return data as Player;
}

export async function createRace(
  supabase: SupabaseClient,
  dayNumber: number,
  raceNumber: number,
  rosterIds: string[],
  startedAt: Date,
  endsAt: Date
): Promise<Race> {
  const { data: race, error: raceErr } = await supabase
    .from("races")
    .insert({
      race_number: raceNumber,
      day_number: dayNumber,
      status: "active",
      started_at: startedAt.toISOString(),
      ends_at: endsAt.toISOString(),
      percent_complete: 0,
    })
    .select("*")
    .single();

  if (raceErr) throw raceErr;

  const shuffled = shuffleLanes(rosterIds, dayNumber);
  const entries = shuffled.map((playerId, idx) => {
    const progress = seededRange(`${race.id}:${playerId}:init`, 0, 6);
    return {
      race_id: race.id,
      player_id: playerId,
      lane: idx + 1,
      progress,
      displayed_progress: Math.round(progress),
      current_rank: 1,
      last_delta: 0,
      race_score: progress,
      condition: 0,
    };
  });

  const ranked = rankEntries(entries);
  const { error: entryErr } = await supabase.from("race_entries").insert(ranked);
  if (entryErr) throw entryErr;

  await saveTickerEvents(
    supabase,
    race.id,
    0,
    generateRaceStartTickerEvents(raceNumber)
  );

  return race as Race;
}

async function addHistory(
  supabase: SupabaseClient,
  playerId: string,
  raceId: string | null,
  dayNumber: number,
  eventType: string,
  eventText: string,
  finishRank: number | null,
  progress: number | null
) {
  await supabase.from("player_history").insert({
    player_id: playerId,
    race_id: raceId,
    day_number: dayNumber,
    event_type: eventType,
    event_text: eventText,
    finish_rank: finishRank,
    progress,
  });
}

export async function getAllTimeTop3(supabase: SupabaseClient): Promise<Player[]> {
  const { data } = await supabase.from("players").select("*").order("wins", { ascending: false });
  if (!data?.length) return [];

  const sorted = [...data].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.races !== b.races) return a.races - b.races;
    const aBest = a.best_finish ?? 99;
    const bBest = b.best_finish ?? 99;
    if (aBest !== bBest) return aBest - bBest;
    return a.created_day - b.created_day;
  });

  const withWins = sorted.filter((p) => p.wins > 0);
  return withWins.slice(0, 3);
}

export async function getActiveStreaks(
  supabase: SupabaseClient
): Promise<Array<Pick<Player, "name" | "slug" | "current_streak_type" | "current_streak_count" | "updated_at">>> {
  const { data, error } = await supabase
    .from("players")
    .select("name, slug, current_streak_type, current_streak_count, updated_at")
    .in("current_streak_type", ["win", "lose"])
    .gt("current_streak_count", 0)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getActiveRaceOnly(supabase: SupabaseClient): Promise<Race | null> {
  const { data: race } = await supabase
    .from("races")
    .select("*")
    .eq("status", "active")
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (race as Race) || null;
}

export async function forceFinalizeActiveRace(
  supabase: SupabaseClient,
  createNextRace = false
): Promise<void> {
  const race = await getActiveRaceOnly(supabase);
  if (!race) throw new Error("No active race to finalize");
  await finalizeRace(supabase, race, { createNextRace });
}

export async function startNextRace(supabase: SupabaseClient): Promise<Race> {
  const active = await getActiveRaceOnly(supabase);
  if (active) throw new Error("A race is already active");

  const { data: gameState } = await supabase.from("game_state").select("*").eq("id", 1).single();
  if (!gameState) throw new Error("Game not initialized");

  const { data: lastRace } = await supabase
    .from("races")
    .select("*")
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastRace || lastRace.status !== "finalized") {
    throw new Error("No finalized race — end the current race first");
  }

  const nextDay = gameState.current_day + 1;
  const nextRaceNumber = gameState.current_race_number + 1;
  const now = new Date();
  const { startedAt, endsAt } = getNextRaceDayBounds(new Date(lastRace.ends_at));

  const { data: activePlayers } = await supabase.from("players").select("id").eq("status", "active");
  const rosterIds = (activePlayers || []).map((p) => p.id);
  if (rosterIds.length !== 8) {
    throw new Error(`Expected 8 active racers, found ${rosterIds.length}`);
  }

  const race = await createRace(
    supabase,
    nextDay,
    nextRaceNumber,
    rosterIds,
    startedAt,
    endsAt
  );

  await supabase
    .from("game_state")
    .update({
      current_day: nextDay,
      current_race_number: nextRaceNumber,
      last_tick_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", 1);

  return race;
}

export async function getActiveRaceWithEntries(
  supabase: SupabaseClient
): Promise<{ race: Race; entries: RaceEntryWithPlayer[] } | null> {
  const { data: race } = await supabase
    .from("races")
    .select("*")
    .eq("status", "active")
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!race) {
    const { data: lastRace } = await supabase
      .from("races")
      .select("*")
      .order("race_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastRace) return null;
    const { data: entries } = await supabase
      .from("race_entries")
      .select("*, player:players(*)")
      .eq("race_id", lastRace.id)
      .order("lane", { ascending: true });
    return {
      race: lastRace as Race,
      entries: (entries || []) as RaceEntryWithPlayer[],
    };
  }

  const { data: entries } = await supabase
    .from("race_entries")
    .select("*, player:players(*)")
    .eq("race_id", race.id)
    .order("lane", { ascending: true });

  return {
    race: race as Race,
    entries: (entries || []) as RaceEntryWithPlayer[],
  };
}

/** Wipe race 1+ and restart with a fresh first race for all active racers. */
export async function resetToFirstRace(supabase: SupabaseClient): Promise<Race> {
  const { error: raceDelErr } = await supabase.from("races").delete().gte("race_number", 1);
  if (raceDelErr) throw raceDelErr;

  const { error: histErr } = await supabase
    .from("player_history")
    .delete()
    .gte("day_number", 0);
  if (histErr) throw histErr;

  const now = new Date();

  const { error: holdingDelErr } = await supabase
    .from("players")
    .update({
      status: "active",
      holding_days: 0,
      updated_at: now.toISOString(),
    })
    .eq("status", "holding");
  if (holdingDelErr) throw holdingDelErr;

  const { data: actives, error: activeErr } = await supabase
    .from("players")
    .select("id")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (activeErr) throw activeErr;
  if (!actives?.length) throw new Error("No active racers found");

  const rosterIds = actives.map((p) => p.id);
  if (rosterIds.length !== 8) {
    throw new Error(`Expected 8 active racers, found ${rosterIds.length}`);
  }

  for (const { id } of actives) {
    const { error: resetErr } = await supabase
      .from("players")
      .update({
        races: 0,
        wins: 0,
        eliminations: 0,
        returns: 0,
        best_finish: null,
        worst_finish: null,
        current_streak_type: "none",
        current_streak_count: 0,
        longest_win_streak: 0,
        total_holding_days: 0,
        age_days: 0,
        active_days: 0,
        holding_days: 0,
        fatigue: 0,
        pressure: 0,
        comeback_until_day: null,
        rookie_until_day: 8,
        total_support_received: 0,
        updated_at: now.toISOString(),
      })
      .eq("id", id);
    if (resetErr) throw resetErr;
  }

  const { startedAt, endsAt } = getFirstRaceLiveBounds();

  const race = await createRace(supabase, 1, 1, rosterIds, startedAt, endsAt);
  const percentComplete = calculatePercentComplete(startedAt, endsAt, now);

  await supabase
    .from("races")
    .update({ percent_complete: percentComplete })
    .eq("id", race.id);

  await supabase
    .from("game_state")
    .update({
      current_day: 1,
      current_race_number: 1,
      last_tick_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", 1);

  return { ...race, percent_complete: percentComplete };
}

export async function runTickPipeline(supabase: SupabaseClient): Promise<void> {
  await initializeGameIfNeeded(supabase);
  await tickRace(supabase);
}
