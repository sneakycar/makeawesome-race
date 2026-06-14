import type { SupabaseClient } from "@supabase/supabase-js";
import { getNextRaceDayBounds, getRaceDayBounds, getFirstRaceLiveBounds } from "./eastern-time";
import { SEED_ACTIVE_NAMES, generateUniqueName } from "./name-generator";
import { TARGET_WINNER_SCORE, clampNaturalRaceScore, getPaceCap, normalizePeakRaceScore, roundRaceScore } from "./score";
import { getCombinedRaceTempo, getRaceWeekTempo } from "./race-tempo";
import { resolveWinnerRaceScore } from "./god-score";
import { appendRecentDelta } from "./hybrid-live-score";
import { ordinal, slugify, formatRacerName } from "./format";
import { seededBool, seededInt, seededRange } from "./seeded-rng";
import { RACE_ENTRY_PLAYER_SELECT } from "./race-player-columns";
import { processRaceSupports } from "./support-db";
import { processBadMoneyAtFinalize } from "./bad-money-db";
import { applyBadMoneyToDelta } from "./bad-money";
import { saveTickerEvents } from "./ticker-db";
import {
  generateFinalizeTickerEvents,
  generateRaceStartTickerEvents,
  generateTickTickerEvents,
  type TickerEntrySnapshot,
} from "./ticker-logic";
import {
  generateIdentity,
  buildPlayerStatsFromSeed,
  type PlayerIdentity,
  getArchetypeRaceModifier,
  getTraitRaceModifier,
  getChaosRangeMultiplier,
  getWildSwingMultiplier,
  getBurstChanceMultiplier,
  getCollapseChanceMultiplier,
  getMaxTickDelta,
  getPressurePenaltyMultiplier,
  getArchetypeFatigueModifier,
  getArchetypePressureModifier,
  getArchetypeGrowthChanceBonus,
  getPostRaceMutationChance,
  getHoldingMutationChance,
  getMutationDelta,
  getDecayChance,
  pickWeightedAnyStat,
  getHoldingPressureRecovery,
  getHoldingFatigueRecovery,
  recalculateRatingFromPartial,
} from "./identity";
import {
  calculateInjuryChance,
  rollRaceInjury,
  shouldInjure,
  getRecoveryMutationChance,
  getRecoveryPositiveChance,
  getSupportRecoveryBonus,
} from "./injuries";
import {
  clearEndedFights,
  isStillFightingAtRaceEnd,
} from "./fights";
import { maybeStartSimFight } from "./race-fight-tick";
import {
  clearExpiredRaceDelay,
  getRaceEffectiveNow,
  isRaceDelayed,
  shouldTriggerRaceDelay,
  startRaceDelay,
} from "./race-delay";
import { assignLanesBySkill, getLanePerformanceMultiplier } from "./lanes";
import { calculatePlayerOvr } from "./ovr";
import { generatePlayerPalette } from "./player-colors";
import { syncRaceWeatherEvents } from "./weather-db";
import {
  applySimTick,
  applyFanLiveBonusToSim,
  buildRaceSim,
  replaySimToTick,
  rankSimEntries,
} from "./race-sim";
import type { Player, Race, RaceEntry, RaceEntryWithPlayer, InjuryRecord } from "./types";

export const TICKS_PER_RACE = 48;
/** @deprecated use TICKS_PER_RACE */
export const TICKS_PER_DAY = TICKS_PER_RACE;
/** Average points per tick at neutral tempo (~155 midpoint over 48 ticks). */
export const EXPECTED_POINTS_PER_TICK = TARGET_WINNER_SCORE / TICKS_PER_RACE;
/** @deprecated use EXPECTED_POINTS_PER_TICK */
export const EXPECTED_DELTA = EXPECTED_POINTS_PER_TICK;

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
  currentRank: number;
  leaderScore: number;
  chaosBurstUsed: boolean;
  lane: number;
  badMoneyCount?: number;
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
    currentRank,
    leaderScore,
  } = input;
  const badMoneyCount = Math.max(0, Number(input.badMoneyCount ?? 0));
  let chaosBurstUsed = input.chaosBurstUsed;
  const currentScore = currentProgress;
  const gapToLeader = Math.max(0, leaderScore - currentScore);

  const raceCtx = {
    percentComplete,
    currentRank,
    currentProgress: currentScore,
    dayNumber,
  };

  const seedBase = `${raceId}:${playerId}:${tickNumber}:delta`;
  const lateRaceFactor =
    percentComplete < 50 ? 0.5 : percentComplete <= 80 ? 1.0 : 1.5;

  const chaosMult = getChaosRangeMultiplier(player);
  const chaosMin = -player.chaos * 0.2 * chaosMult;
  const chaosMax = player.chaos * 0.25 * chaosMult;
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
    (1 - player.nerve / 200) *
    getPressurePenaltyMultiplier(player, percentComplete);

  const fatiguePenalty =
    player.fatigue *
    seededRange(`${seedBase}:fatigue`, 0.03, 0.15) *
    (1 - player.grit / 200);

  const identityMod =
    getArchetypeRaceModifier(player, raceCtx) + getTraitRaceModifier(player, raceCtx);

  const baseSkill =
    player.rating * 0.35 +
    player.grit * 0.16 +
    player.nerve * 0.12 +
    player.luck * 0.08 +
    player.burst * lateRaceFactor * 0.14 +
    chaosRandomComponent -
    player.drag * 0.1 -
    player.fatigue * 0.08 -
    pressurePenalty +
    identityMod;

  const normalizedSkill = Math.max(0, Math.min(100, baseSkill + rookieBonus + comebackBonus)) / 100;
  const skillMultiplier = 0.42 + normalizedSkill * 1.18;

  const raceTempo = getCombinedRaceTempo(raceId, playerId);

  const wildSwingBase = seededRange(`${seedBase}:wild`, -2.8, 3.6);
  const wildSwing = wildSwingBase * (1 + player.chaos / 160) * getWildSwingMultiplier(player);

  let delta = EXPECTED_POINTS_PER_TICK * skillMultiplier * raceTempo + wildSwing;
  let eventNote: string | null = null;

  // Hot stretch — some racers randomly catch fire for a tick
  if (seededBool(`${seedBase}:hot`, 0.07 + player.burst / 900)) {
    delta *= seededRange(`${seedBase}:hotmult`, 1.5, 2.4);
    eventNote = "HOT STRETCH";
  }

  // Trailing pack surges — big gaps close fast
  if (currentRank >= 4) {
    delta += (currentRank - 3) * 0.22;
  }
  if (gapToLeader >= 12) {
    delta += Math.min(3.2, gapToLeader * 0.06);
  }
  // Leaders fade late — opens the door for chasers
  if (currentRank === 1) {
    if (percentComplete >= 45) delta *= 0.9;
    if (percentComplete >= 70) delta *= 0.84;
  }

  const burstChance = (0.05 + player.chaos / 450) * getBurstChanceMultiplier(player);
  // Rare chaos burst
  if (
    !chaosBurstUsed &&
    player.chaos >= 50 &&
    seededBool(`${seedBase}:burst`, burstChance)
  ) {
    const burst = seededRange(`${seedBase}:burstamt`, 6, 14);
    delta += burst;
    chaosBurstUsed = true;
    eventNote = eventNote ? `${eventNote} / CHAOS SURGE` : "CHAOS SURGE";
  }

  const collapseChance =
    (0.04 + player.drag / 350) * getCollapseChanceMultiplier(player, raceCtx);
  // Rare collapse
  if (seededBool(`${seedBase}:collapse`, collapseChance) && currentScore > 8) {
    const drop = seededRange(`${seedBase}:drop`, 2, 9);
    delta -= drop;
    eventNote = eventNote ? `${eventNote} / COLLAPSE` : "COLLAPSE";
  }

  // Occasional short stall within a tick
  if (seededBool(`${seedBase}:stall`, 0.08) && delta > 0.2) {
    delta *= 0.25;
    eventNote = eventNote ? `${eventNote} / STALL` : "STALL";
  }

  // Random bleed — points can go backwards
  if (seededBool(`${seedBase}:bleed`, 0.05 + player.drag / 500) && currentScore > 2) {
    delta -= seededRange(`${seedBase}:bleedamt`, 0.8, 4.2);
    eventNote = eventNote ? `${eventNote} / BLEED` : "BLEED";
  }

  const maxSwing = getMaxTickDelta(player);
  delta = Math.max(-maxSwing, Math.min(maxSwing, delta));

  delta *= getLanePerformanceMultiplier(input.lane);

  if (badMoneyCount > 0) {
    delta = applyBadMoneyToDelta(
      delta,
      raceId,
      playerId,
      tickNumber,
      percentComplete,
      badMoneyCount
    );
  }

  // Soft pace cap — week tempo sets the night; natural max is 239
  const weekTempo = getRaceWeekTempo(raceId);
  const baseLeash = 14 + player.burst * 0.1 + player.luck * 0.07 + player.chaos * 0.04;
  const paceLeash = baseLeash * (0.35 + weekTempo * 0.75);
  const paceCap = getPaceCap(percentComplete, raceTempo, paceLeash);
  let newScore = clampNaturalRaceScore(currentScore + delta);
  if (newScore > paceCap) {
    newScore = paceCap;
  }
  delta = newScore - currentScore;

  return { delta, eventNote, chaosBurstUsed };
}

export function buildPlayerInsert(
  name: string,
  slug: string,
  status: "active" | "holding",
  createdDay: number,
  seed: string,
  identityOverride?: PlayerIdentity
) {
  const identity = identityOverride ?? generateIdentity(seed);
  const stats = buildPlayerStatsFromSeed(seed, identity);
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
    grit: stats.grit,
    chaos: stats.chaos,
    nerve: stats.nerve,
    luck: stats.luck,
    burst: stats.burst,
    drag: stats.drag,
    rating: stats.rating,
    volatility: stats.volatility,
    fatigue: 0,
    pressure: stats.pressure,
    rookie_until_day: status === "active" ? createdDay + 7 : null,
    comeback_until_day: null,
    total_support_received: 0,
    bad_money_total: 0,
    bad_money_races: 0,
    bad_money_wins: 0,
    bad_money_losses: 0,
    bad_money_pressure: 0,
    bad_money_last_day: null,
    highest_race_score: 0,
    highest_career_score: 0,
    biggest_comeback: 0,
    archetype: identity.archetype,
    traits: identity.traits,
    signature_stat: identity.signature_stat,
    current_injury_name: null,
    injured_at_day: null,
    injury_races_remaining: 0,
    total_injuries: 0,
    injury_history: [],
    palette_colors: generatePlayerPalette(seed),
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

  const { data: rosterPlayers, error: rosterErr } = await supabase
    .from("players")
    .select("id, grit, chaos, nerve, luck, burst, drag, rating")
    .in("id", activeIds);

  if (rosterErr) throw rosterErr;

  const laneByPlayer = assignLanesBySkill(
    (rosterPlayers ?? []).map((p) => ({
      id: p.id,
      ovr: calculatePlayerOvr(p),
    })),
    1,
    1
  );

  const entries = activeIds.map((playerId) => ({
    race_id: race.id,
    player_id: playerId,
    lane: laneByPlayer.get(playerId) ?? 1,
    progress: 0,
    displayed_progress: 0,
    current_rank: 1,
    last_delta: 0,
    recent_deltas: [],
    race_score: 0,
    peak_race_score: 0,
    condition: 0,
  }));

  const ranked = rankEntries(entries);
  const { error: entryErr } = await supabase.from("race_entries").insert(ranked);
  if (entryErr) throw entryErr;

  const { error: gsErr } = await supabase.from("game_state").insert({
    id: 1,
    current_day: 1,
    current_race_number: 1,
    last_tick_at: new Date().toISOString(),
    god_score_awarded: false,
  });
  if (gsErr) throw gsErr;

  return true;
}

export async function assignLanesForRoster(
  supabase: SupabaseClient,
  rosterIds: string[],
  dayNumber: number,
  raceNumber: number
): Promise<Map<string, number>> {
  const { data: players, error } = await supabase
    .from("players")
    .select("id, grit, chaos, nerve, luck, burst, drag, rating")
    .in("id", rosterIds);

  if (error) throw error;

  return assignLanesBySkill(
    (players ?? []).map((p) => ({
      id: p.id,
      ovr: calculatePlayerOvr(p),
    })),
    dayNumber,
    raceNumber
  );
}

function rankEntries<T extends { race_score: number; is_injured?: boolean; is_disqualified?: boolean }>(
  entries: T[]
): (T & { current_rank: number; displayed_progress: number })[] {
  const healthy = entries
    .filter((e) => !e.is_injured && !e.is_disqualified)
    .sort((a, b) => b.race_score - a.race_score);
  const disqualified = entries
    .filter((e) => !e.is_injured && e.is_disqualified)
    .sort((a, b) => b.race_score - a.race_score);
  const injured = entries.filter((e) => e.is_injured).sort((a, b) => b.race_score - a.race_score);
  const sorted = [...healthy, ...disqualified, ...injured];
  return sorted.map((e, i) => ({
    ...e,
    current_rank: i + 1,
    displayed_progress: Math.round(roundRaceScore(e.race_score)),
  }));
}

export async function tickRace(supabase: SupabaseClient): Promise<void> {
  const tickDebug = process.env.TICK_DEBUG === "1";
  const logTick = (...args: unknown[]) => {
    if (tickDebug) console.log("[tickRace]", ...args);
  };

  const now = new Date();
  let { data: race, error: raceErr } = await supabase
    .from("races")
    .select("*")
    .eq("status", "active")
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (raceErr) throw raceErr;
  if (!race) {
    logTick("exit: no active race");
    return;
  }

  const cleared = await clearExpiredRaceDelay(supabase, race as Race, now);
  if (cleared) {
    race = cleared;
  }

  const startedAt = new Date(race.started_at);
  let endsAt = new Date(race.ends_at);

  if (now < startedAt) {
    logTick("exit: race not started yet", startedAt.toISOString());
    return;
  }

  if (isRaceDelayed(race as Race, now)) {
    logTick("exit: race delayed until", race.delay_until);
    await syncRaceWeatherEvents(supabase, race as Race, startedAt, now);
    await supabase
      .from("game_state")
      .update({ last_tick_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", 1);
    return;
  }

  if (now > endsAt) {
    logTick("exit: finalize race");
    await finalizeRace(supabase, race as Race);
    return;
  }

  const effectiveNow = getRaceEffectiveNow(race as Race, now);
  const percentComplete = calculatePercentComplete(startedAt, endsAt, effectiveNow);
  const tickNumber = getTickNumber(startedAt, endsAt, effectiveNow);

  if (
    shouldTriggerRaceDelay(
      race.id,
      tickNumber,
      percentComplete,
      Boolean(race.delay_until)
    )
  ) {
    logTick("exit: starting race delay at tick", tickNumber);
    await startRaceDelay(supabase, race as Race, tickNumber, percentComplete, now);
    await supabase
      .from("game_state")
      .update({ last_tick_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", 1);
    return;
  }

  const { data: entries, error: entriesErr } = await supabase
    .from("race_entries")
    .select("*, player:players!race_entries_player_id_fkey(*)")
    .eq("race_id", race.id);

  if (entriesErr) throw entriesErr;
  if (!entries?.length) {
    logTick("exit: no entries");
    return;
  }

  logTick("processing", { tickNumber, percentComplete, entryCount: entries.length });

  for (let i = 0; i < entries.length; i++) {
    entries[i] = clearEndedFights([entries[i]], tickNumber)[0];
  }

  const chaosUsed = new Map<string, boolean>();
  for (const entry of entries) {
    if (entry.event_note?.includes("CHAOS SURGE")) {
      chaosUsed.set(entry.player_id, true);
    }
  }

  const sim = buildRaceSim(
    entries.map((entry) => ({
      player_id: entry.player_id,
      player: entry.player as Player,
      lane: entry.lane,
      is_injured: Boolean(entry.is_injured),
      injured_at_tick: entry.injured_at_tick as number | null,
      is_fighting: Boolean(entry.is_fighting),
      fighting_at_tick: entry.fighting_at_tick as number | null,
      fight_end_tick: entry.fight_end_tick as number | null,
      fight_frozen_score: entry.fight_frozen_score as number | null,
      race_score: entry.race_score,
      bad_money_count: entry.bad_money_count,
    }))
  );

  replaySimToTick(race as Race, sim, tickNumber, startedAt, endsAt, chaosUsed);

  applyFanLiveBonusToSim(
    sim,
    entries.map((entry) => ({
      player_id: entry.player_id,
      fan_live_bonus: entry.fan_live_bonus,
      is_injured: Boolean(entry.is_injured),
      is_fighting: Boolean(entry.is_fighting),
      fighting_at_tick: entry.fighting_at_tick as number | null,
      fight_end_tick: entry.fight_end_tick as number | null,
    })),
    tickNumber
  );

  const fightStart = maybeStartSimFight(sim, {
    raceId: race.id,
    tickNumber,
    percentComplete,
  });

  if (fightStart) {
    const { pick, ticker } = fightStart;
    for (const playerId of [pick.playerAId, pick.playerBId]) {
      const entry = entries.find((e) => e.player_id === playerId);
      const simEntry = sim.find((s) => s.player_id === playerId);
      if (!entry || !simEntry) continue;
      const partnerId = playerId === pick.playerAId ? pick.playerBId : pick.playerAId;
      const partner = entries.find((e) => e.player_id === partnerId)!.player as Player;
      entry.is_fighting = true;
      entry.fighting_at_tick = tickNumber;
      entry.fight_end_tick = tickNumber + pick.durationTicks;
      entry.fight_partner_id = partnerId;
      entry.fight_frozen_score = simEntry.fight_frozen_score;
    }

    const nameA = formatRacerName(
      (entries.find((e) => e.player_id === pick.playerAId)!.player as Player).name
    );
    const nameB = formatRacerName(
      (entries.find((e) => e.player_id === pick.playerBId)!.player as Player).name
    );

    await saveTickerEvents(supabase, race.id, tickNumber, [ticker]);
    await addHistory(
      supabase,
      pick.playerAId,
      race.id,
      race.day_number,
      "fight",
      `${nameA} vs ${nameB}`,
      null,
      null
    );
    await addHistory(
      supabase,
      pick.playerBId,
      race.id,
      race.day_number,
      "fight",
      `${nameB} vs ${nameA}`,
      null,
      null
    );
  }

  const scoreById = new Map(sim.map((s) => [s.player_id, s.score]));

  const rankedBeforeTick = rankSimEntries(sim);
  const rankBeforeById = new Map(
    rankedBeforeTick.map((entry) => [entry.player_id, entry.current_rank])
  );

  const beforeSnapshots: TickerEntrySnapshot[] = entries.map((entry) => ({
    player_id: entry.player_id,
    player: entry.player as Player,
    current_rank: rankBeforeById.get(entry.player_id) ?? entry.current_rank,
    progress: scoreById.get(entry.player_id) ?? 0,
    last_delta: Number(entry.last_delta),
    event_note: entry.event_note,
  }));

  const tickResults = applySimTick(
    race as Race,
    sim,
    tickNumber,
    startedAt,
    endsAt,
    chaosUsed
  );
  const tickResultById = new Map(tickResults.map((r) => [r.player_id, r]));

  const updated = [];
  for (const entry of entries) {
    const player = entry.player as Player;
    const tickResult = tickResultById.get(entry.player_id)!;
    const newScore = sim.find((s) => s.player_id === entry.player_id)!.score;

    if (entry.is_injured) {
      updated.push({
        ...entry,
        race_score: newScore,
        progress: newScore,
        displayed_progress: Math.round(roundRaceScore(newScore)),
        last_delta: 0,
        recent_deltas: appendRecentDelta(entry.recent_deltas, 0),
        event_note: "INJURED",
      });
      continue;
    }

    if (entry.is_fighting) {
      const frozen = Number(entry.fight_frozen_score ?? newScore);
      updated.push({
        ...entry,
        race_score: frozen,
        progress: frozen,
        displayed_progress: Math.round(roundRaceScore(frozen)),
        last_delta: 0,
        recent_deltas: appendRecentDelta(entry.recent_deltas, 0),
        event_note: "FIGHT",
      });
      continue;
    }

    let isInjured = Boolean(entry.is_injured);
    let injuredAtTick = entry.injured_at_tick as number | null;
    let injuryName = entry.injury_name as string | null;
    let injurySeverity = entry.injury_severity as string | null;
    let injuryNote = entry.injury_note as string | null;
    let injuryRacesMissed = entry.injury_races_missed as number | null;

    const injuryCtx = {
      dayNumber: race.day_number,
      raceNumber: race.race_number,
      tickNumber,
      percentComplete,
      currentRank: rankBeforeById.get(entry.player_id) ?? entry.current_rank,
    };
    const injuryChance = calculateInjuryChance(player, entry, injuryCtx);
    const injurySeed = `${race.id}:${entry.player_id}:${tickNumber}:injury-roll`;

    if (shouldInjure(injurySeed, injuryChance)) {
      const injury = rollRaceInjury(race, player, injuryCtx);
      isInjured = true;
      injuredAtTick = tickNumber;
      injuryName = injury.injuryName;
      injurySeverity = injury.severity;
      injuryNote = injury.injuryNote;
      injuryRacesMissed = injury.racesMissed;

      await addHistory(
        supabase,
        player.id,
        race.id,
        race.day_number,
        "injured",
        `INJURED: ${injury.injuryName}`,
        null,
        roundRaceScore(newScore)
      );

      await supabase.from("injury_events").insert({
        player_id: player.id,
        race_id: race.id,
        day_number: race.day_number,
        injury_name: injury.injuryName,
        severity: injury.severity,
        races_missed: injury.racesMissed,
        occurred_at_tick: tickNumber,
        occurred_at_percent: percentComplete,
      });
    }

    updated.push({
      ...entry,
      progress: roundRaceScore(newScore),
      displayed_progress: Math.round(roundRaceScore(newScore)),
      last_delta: isInjured ? 0 : tickResult.delta,
      recent_deltas: appendRecentDelta(
        entry.recent_deltas,
        isInjured ? 0 : tickResult.delta
      ),
      event_note: isInjured ? "INJURED" : tickResult.event_note,
      race_score: roundRaceScore(newScore),
      is_injured: isInjured,
      injured_at_tick: injuredAtTick,
      injury_name: injuryName,
      injury_severity: injurySeverity,
      injury_note: injuryNote,
      injury_races_missed: injuryRacesMissed,
    });
  }

  const ranked = rankEntries(updated).map((entry) => {
    const prev = beforeSnapshots.find((b) => b.player_id === entry.player_id);
    const last_rank_change = prev ? prev.current_rank - entry.current_rank : 0;
    return { ...entry, last_rank_change };
  });

  const afterSnapshots: TickerEntrySnapshot[] = ranked.map((entry) => ({
    player_id: entry.player_id,
    player: entry.player as Player,
    current_rank: entry.current_rank,
    progress: Number(entry.race_score),
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

  await syncRaceWeatherEvents(supabase, race as Race, startedAt, effectiveNow);

  for (const entry of ranked) {
    const score = roundRaceScore(Number(entry.race_score));
    const peakRaceScore = normalizePeakRaceScore(Number(entry.peak_race_score ?? 0), score);
    entry.peak_race_score = peakRaceScore;
    entry.race_score = score;
    entry.progress = score;
    entry.displayed_progress = Math.round(score);

    const { error: entryErr } = await supabase
      .from("race_entries")
      .update({
        progress: score,
        displayed_progress: Math.round(score),
        current_rank: entry.current_rank,
        last_delta: entry.last_delta,
        recent_deltas: entry.recent_deltas ?? [],
        last_rank_change: entry.last_rank_change,
        event_note: entry.event_note,
        race_score: score,
        peak_race_score: peakRaceScore,
        is_injured: entry.is_injured ?? false,
        injured_at_tick: entry.injured_at_tick ?? null,
        injury_name: entry.injury_name ?? null,
        injury_severity: entry.injury_severity ?? null,
        injury_note: entry.injury_note ?? null,
        injury_races_missed: entry.injury_races_missed ?? null,
        is_fighting: entry.is_fighting ?? false,
        fighting_at_tick: entry.fighting_at_tick ?? null,
        fight_end_tick: entry.fight_end_tick ?? null,
        fight_partner_id: entry.fight_partner_id ?? null,
        fight_frozen_score: entry.fight_frozen_score ?? null,
        updated_at: now.toISOString(),
      })
      .eq("id", entry.id);

    if (entryErr) {
      throw new Error(`race_entries update failed (${entry.id}): ${entryErr.message}`);
    }

    const player = entry.player as Player;
    const { error: playerErr } = await supabase
      .from("players")
      .update({
        highest_career_score: Math.max(Number(player.highest_career_score ?? 0), score),
        biggest_comeback:
          entry.last_rank_change > 0
            ? Math.max(Number(player.biggest_comeback ?? 0), entry.last_rank_change)
            : player.biggest_comeback,
        updated_at: now.toISOString(),
      })
      .eq("id", player.id);

    if (playerErr) {
      throw new Error(`players update failed (${player.id}): ${playerErr.message}`);
    }
  }

  const { error: raceUpdateErr } = await supabase
    .from("races")
    .update({ percent_complete: percentComplete })
    .eq("id", race.id);
  if (raceUpdateErr) throw raceUpdateErr;

  const { error: gsErr } = await supabase
    .from("game_state")
    .update({ last_tick_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("id", 1);
  if (gsErr) throw gsErr;
}

async function processInjuredRecovery(supabase: SupabaseClient, currentDay: number): Promise<void> {
  const { data: injuredPlayers } = await supabase
    .from("players")
    .select("*")
    .eq("status", "injured");

  if (!injuredPlayers?.length) return;

  for (const player of injuredPlayers as Player[]) {
    const remaining = player.injury_races_remaining - 1;

    if (remaining > 0) {
      await supabase
        .from("players")
        .update({
          injury_races_remaining: remaining,
          age_days: player.age_days + 1,
          pressure: Math.max(0, player.pressure - 3),
          fatigue: Math.max(0, player.fatigue - 4),
          updated_at: new Date().toISOString(),
        })
        .eq("id", player.id);

      if (seededBool(`${player.id}:${currentDay}:still`, 0.15)) {
        await addHistory(
          supabase,
          player.id,
          null,
          currentDay,
          "injured",
          "STILL INJURED",
          null,
          null
        );
      }
      continue;
    }

    const comebackDays = player.archetype === "COMEBACKER" ? 6 : 3;
    const recoveryBonus = getSupportRecoveryBonus(player);
    const updates: Partial<Player> = {
      status: "holding",
      current_injury_name: null,
      injured_at_day: null,
      injury_races_remaining: 0,
      comeback_until_day: currentDay + comebackDays,
      pressure: Math.max(0, player.pressure - 10 - Math.round(recoveryBonus * 20)),
      fatigue: Math.max(0, player.fatigue - 12 - Math.round(recoveryBonus * 20)),
      age_days: player.age_days + 1,
    };

    if (seededBool(`${player.id}:${currentDay}:recmut`, getRecoveryMutationChance(player))) {
      const stat = pickWeightedAnyStat(`${player.id}:${currentDay}:recmuts`, player);
      const positive = seededBool(
        `${player.id}:${currentDay}:recmutp`,
        getRecoveryPositiveChance(player)
      );
      const delta = positive ? 1 : -1;
      updates[stat] = Math.max(1, Math.min(100, (player[stat] as number) + delta));
      await addHistory(
        supabase,
        player.id,
        null,
        currentDay,
        "recovery",
        `${stat.toUpperCase()} ${delta > 0 ? "+" : ""}${delta} AFTER INJURY`,
        null,
        null
      );
    }

    updates.rating = recalculateRatingFromPartial({ ...player, ...updates });

    await supabase
      .from("players")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", player.id);

    await addHistory(
      supabase,
      player.id,
      null,
      currentDay,
      "recovered",
      "RECOVERED TO HOLDING",
      null,
      null
    );
  }
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
    .select("*, player:players!race_entries_player_id_fkey(*)")
    .eq("race_id", race.id);

  if (entriesErr) throw entriesErr;
  if (!entries?.length) return;

  const { data: gameState } = await supabase.from("game_state").select("*").eq("id", 1).single();
  const currentDay = gameState?.current_day ?? race.day_number;

  await processInjuredRecovery(supabase, currentDay);

  const startedAt = new Date(race.started_at);
  const endsAt = new Date(race.ends_at);
  await syncRaceWeatherEvents(supabase, race, startedAt, endsAt);
  const chaosUsed = new Map<string, boolean>();
  for (const entry of entries) {
    if (entry.event_note?.includes("CHAOS SURGE")) {
      chaosUsed.set(entry.player_id, true);
    }
  }
  const sim = buildRaceSim(
    entries.map((entry) => ({
      player_id: entry.player_id,
      player: entry.player as Player,
      lane: entry.lane,
      is_injured: Boolean(entry.is_injured),
      injured_at_tick: entry.injured_at_tick as number | null,
      is_fighting: Boolean(entry.is_fighting),
      fighting_at_tick: entry.fighting_at_tick as number | null,
      fight_end_tick: entry.fight_end_tick as number | null,
      fight_frozen_score: entry.fight_frozen_score as number | null,
      race_score: entry.race_score,
      bad_money_count: entry.bad_money_count,
    }))
  );

  for (let t = 0; t < TICKS_PER_RACE; t++) {
    applySimTick(race, sim, t, startedAt, endsAt, chaosUsed, { allowNewStalls: t < TICKS_PER_RACE - 1 });
  }

  applyFanLiveBonusToSim(
    sim,
    entries.map((entry) => ({
      player_id: entry.player_id,
      fan_live_bonus: entry.fan_live_bonus,
      is_injured: Boolean(entry.is_injured),
      is_fighting: Boolean(entry.is_fighting),
      fighting_at_tick: entry.fighting_at_tick as number | null,
      fight_end_tick: entry.fight_end_tick as number | null,
    })),
    TICKS_PER_RACE - 1
  );

  const processed = entries.map((entry) => {
    const simEntry = sim.find((s) => s.player_id === entry.player_id)!;
    const isDisqualified = isStillFightingAtRaceEnd(entry, tickNumber);
    return {
      ...entry,
      player: entry.player as Player,
      progress: simEntry.score,
      race_score: simEntry.score,
      displayed_progress: Math.round(roundRaceScore(simEntry.score)),
      is_disqualified: isDisqualified,
    };
  });

  let ranked = rankEntries(processed);

  for (let i = 0; i < ranked.length; i++) {
    ranked[i].final_rank = i + 1;
  }

  const godScoreAwarded = Boolean(gameState?.god_score_awarded);
  const winnerForGod = ranked.find(
    (e) => !e.is_injured && !e.is_disqualified && e.final_rank === 1
  );
  let godScoreGranted = false;
  if (winnerForGod) {
    const resolved = resolveWinnerRaceScore(
      Number(winnerForGod.race_score),
      race.id,
      godScoreAwarded
    );
    if (resolved.score !== Number(winnerForGod.race_score)) {
      winnerForGod.race_score = resolved.score;
      winnerForGod.progress = resolved.score;
      winnerForGod.displayed_progress = resolved.score;
      const simWinner = sim.find((s) => s.player_id === winnerForGod.player_id);
      if (simWinner) simWinner.score = resolved.score;
    }
    godScoreGranted = resolved.godScoreGranted;
    if (godScoreGranted) {
      await supabase
        .from("game_state")
        .update({ god_score_awarded: true, updated_at: now.toISOString() })
        .eq("id", 1);
    }
  }

  const hadInjuries = ranked.some((e) => e.is_injured);
  const injuredIds = ranked.filter((e) => e.is_injured).map((e) => e.player_id);
  const dqIds = ranked.filter((e) => e.is_disqualified).map((e) => e.player_id);
  const hadDqs = dqIds.length > 0;
  const healthyFinishCount = ranked.filter((e) => !e.is_injured && !e.is_disqualified).length;

  const allTimeTop = await getAllTimeTop3(supabase);
  const top3Ids = new Set(allTimeTop.map((p) => p.id));

  await updateHoldingPlayers(supabase, currentDay);

  for (const entry of ranked) {
    const player = entry.player as Player;
    const finish = entry.final_rank ?? entry.current_rank;
    const isWinner = !entry.is_injured && !entry.is_disqualified && finish === 1;
    const isLast =
      !hadInjuries &&
      !hadDqs &&
      !entry.is_injured &&
      !entry.is_disqualified &&
      finish === healthyFinishCount;

    const peakScore = Math.max(
      Number(entry.peak_race_score ?? 0),
      roundRaceScore(Number(entry.race_score))
    );

    const { error: entryErr } = await supabase
      .from("race_entries")
      .update({
        progress: entry.race_score,
        displayed_progress: entry.displayed_progress,
        current_rank: entry.current_rank,
        final_rank: entry.final_rank,
        race_score: entry.race_score,
        peak_race_score: peakScore,
        is_injured: entry.is_injured ?? false,
        injured_at_tick: entry.injured_at_tick ?? null,
        injury_name: entry.injury_name ?? null,
        injury_severity: entry.injury_severity ?? null,
        injury_note: entry.injury_note ?? null,
        injury_races_missed: entry.injury_races_missed ?? null,
        is_fighting: false,
        fighting_at_tick: null,
        fight_end_tick: null,
        fight_partner_id: null,
        fight_frozen_score: null,
        updated_at: now.toISOString(),
      })
      .eq("id", entry.id);

    if (entryErr) {
      throw new Error(`finalize race_entries update failed (${entry.id}): ${entryErr.message}`);
    }

    const updates = mutatePlayerAfterRace(
      player,
      finish,
      isWinner,
      isLast,
      currentDay,
      top3Ids.has(player.id)
    );
    updates.highest_race_score = Math.max(Number(player.highest_race_score ?? 0), peakScore);
    updates.highest_career_score = Math.max(Number(player.highest_career_score ?? 0), peakScore);

    if (entry.is_injured) {
      const racesMissed = Number(entry.injury_races_missed ?? 1);
      const injuryRecord: InjuryRecord = {
        day: currentDay,
        name: entry.injury_name ?? "UNKNOWN",
        severity: entry.injury_severity ?? "NORMAL",
        races_missed: racesMissed,
        race_id: race.id,
      };
      const history = [...(player.injury_history ?? []), injuryRecord];

      updates.status = "injured";
      updates.current_injury_name = entry.injury_name;
      updates.injured_at_day = currentDay;
      updates.injury_races_remaining = racesMissed;
      updates.total_injuries = player.total_injuries + 1;
      updates.injury_history = history;
      updates.pressure = Math.max(0, (updates.pressure ?? player.pressure) - 6);
      updates.fatigue = Math.max(0, (updates.fatigue ?? player.fatigue) - 4);

      await addHistory(
        supabase,
        player.id,
        race.id,
        currentDay,
        "injured",
        `OUT ${racesMissed} RACES`,
        finish,
        roundRaceScore(Number(entry.race_score))
      );
    } else if (entry.is_disqualified) {
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
        "DISQUALIFIED — FIGHT AT FINISH",
        finish,
        roundRaceScore(Number(entry.race_score))
      );
    } else if (isLast) {
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
        roundRaceScore(Number(entry.race_score))
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
        roundRaceScore(Number(entry.race_score))
      );
    } else if (!entry.is_injured && !entry.is_disqualified) {
      await addHistory(
        supabase,
        player.id,
        race.id,
        currentDay,
        "finished",
        `FINISHED ${ordinal(finish)}`,
        finish,
        roundRaceScore(Number(entry.race_score))
      );
    }

    const abilityStats = ["grit", "chaos", "nerve", "luck", "burst", "drag"] as const;
    for (const stat of abilityStats) {
      const before = player[stat] as number;
      const after = (updates[stat] as number | undefined) ?? before;
      if (after > before) {
        await addHistory(
          supabase,
          player.id,
          race.id,
          currentDay,
          "mutation",
          `${stat.toUpperCase()} +${after - before}`,
          finish,
          roundRaceScore(Number(entry.race_score))
        );
      }
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

  await processBadMoneyAtFinalize(
    supabase,
    race,
    ranked as RaceEntryWithPlayer[],
    currentDay
  );

  const winnerEntry = ranked.find(
    (e) => e.final_rank === 1 && !e.is_injured && !e.is_disqualified
  );
  const lastHealthy = [...ranked]
    .reverse()
    .find((e) => !e.is_injured && !e.is_disqualified);
  if (winnerEntry && lastHealthy) {
    const finalizeMessages = generateFinalizeTickerEvents(
      (winnerEntry.player as Player).name,
      (lastHealthy.player as Player).name,
      race.race_number,
      winnerEntry.player_id,
      lastHealthy.player_id
    );
    if (godScoreGranted) {
      finalizeMessages.unshift({
        message: `${(winnerEntry.player as Player).name} hits 240 — GOD DESCENDS`,
        eventType: "god_score",
        playerId: winnerEntry.player_id,
        facts: {
          tickNumber: TICKS_PER_RACE - 1,
          percentComplete: 100,
          playerName: (winnerEntry.player as Player).name,
          progressAfter: 240,
        },
        priority: 99,
      });
    }
    await saveTickerEvents(supabase, race.id, TICKS_PER_RACE, finalizeMessages);
  }

  const slotsNeeded = injuredIds.length + dqIds.length + (hadInjuries || hadDqs ? 0 : 1);
  const excludeIds = new Set([...injuredIds, ...dqIds]);

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
  const { startedAt: nextStartedAt, endsAt: nextEndsAt } = getNextRaceDayBounds(
    new Date(race.ends_at)
  );

  const { data: activePlayers } = await supabase.from("players").select("id").eq("status", "active");
  let rosterIds = (activePlayers || []).map((p) => p.id);

  for (let i = 0; i < slotsNeeded; i++) {
    const replacement = await chooseReplacement(supabase, nextDay, {
      excludePlayerIds: [...excludeIds],
    });
    excludeIds.add(replacement.id);
    if (!rosterIds.includes(replacement.id)) {
      rosterIds.push(replacement.id);
    }
  }

  while (rosterIds.length > 8) {
    const idx = rosterIds.findIndex((id) => !excludeIds.has(id));
    if (idx >= 0) rosterIds.splice(idx, 1);
  }
  while (rosterIds.length < 8) {
    const replacement = await chooseReplacement(supabase, nextDay, {
      excludePlayerIds: [...excludeIds],
    });
    excludeIds.add(replacement.id);
    rosterIds.push(replacement.id);
  }

  for (const injuredId of injuredIds) {
    if (rosterIds.includes(injuredId)) {
      throw new Error("Injured racer cannot join the next race");
    }
  }

  await createRace(
    supabase,
    nextDay,
    nextRaceNumber,
    rosterIds.slice(0, 8),
    nextStartedAt,
    nextEndsAt
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
}

export function mutatePlayerAfterRace(
  player: Player,
  finish: number,
  isWinner: boolean,
  isLast: boolean,
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
  } else if (isLast) {
    updates.current_streak_type = "lose";
    updates.current_streak_count =
      player.current_streak_type === "lose" ? player.current_streak_count + 1 : 1;
  } else {
    updates.current_streak_type = "none";
    updates.current_streak_count = 0;
  }

  if (finish <= 3 && !isWinner) {
    updates.fatigue = (updates.fatigue ?? player.fatigue) + 1;
    updates.pressure = (updates.pressure ?? player.pressure) + 1;
  }

  const fatigueCtx = { isWinner, finish };
  updates.fatigue =
    (updates.fatigue ?? player.fatigue) +
    getArchetypeFatigueModifier(player, fatigueCtx);
  updates.pressure =
    (updates.pressure ?? player.pressure) +
    getArchetypePressureModifier(player, {
      isWinner,
      finish,
      isTop3AllTime,
    });

  if (isTop3AllTime) {
    updates.pressure = (updates.pressure ?? player.pressure) + 2;
  }

  const growthCtx = { finish, isWinner, currentDay, isTop3AllTime };
  const decayChance = getDecayChance(player, currentDay);
  if (decayChance > 0 && seededBool(`${player.id}:${currentDay}:decay`, decayChance)) {
    const stat = pickWeightedAnyStat(`${player.id}:${currentDay}:decay`, player);
    updates[stat] = Math.max(15, ((updates[stat] as number) ?? (player[stat] as number)) - 1);
  }

  const mutationChance = getPostRaceMutationChance(player);
  if (seededBool(`${player.id}:${currentDay}:mutate`, mutationChance)) {
    const stat = pickWeightedAnyStat(`${player.id}:${currentDay}:mut`, player);
    const delta = getMutationDelta(player, `${player.id}:${currentDay}:mutd`);
    updates[stat] = Math.max(1, Math.min(100, ((updates[stat] as number) ?? (player[stat] as number)) + delta));
  }

  const merged = { ...player, ...updates };
  updates.rating = recalculateRatingFromPartial(merged);

  return updates;
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
      pressure: Math.max(0, player.pressure - getHoldingPressureRecovery(player)),
      fatigue: Math.max(0, player.fatigue - getHoldingFatigueRecovery(player)),
    };

    if (player.archetype === "RELIC" && seededBool(`${player.id}:${currentDay}:relicdecay`, 0.06)) {
      const stat = pickWeightedAnyStat(`${player.id}:${currentDay}:relicdecay`, player);
      updates[stat] = Math.max(15, (player[stat] as number) - 1);
    }

    const holdMutChance = getHoldingMutationChance(player);
    if (seededBool(`${player.id}:${currentDay}:holdmut`, holdMutChance)) {
      const stat = pickWeightedAnyStat(`${player.id}:${currentDay}:holdmuts`, player);
      const delta = getMutationDelta(player, `${player.id}:${currentDay}:holdmutd`);
      updates[stat] = Math.max(1, Math.min(100, (player[stat] as number) + delta));
    }

    const merged = { ...player, ...updates };
    updates.rating = recalculateRatingFromPartial(merged);

    await supabase.from("players").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", player.id);
  }
}

export async function chooseReplacement(
  supabase: SupabaseClient,
  nextDay: number,
  options: { excludePlayerIds?: string[] } = {}
): Promise<Player> {
  const excluded = new Set(options.excludePlayerIds ?? []);

  const { data: queuedRookie } = await supabase
    .from("players")
    .select("id")
    .eq("slug", QUEUED_ROOKIE.slug)
    .maybeSingle();

  if (!queuedRookie) {
    return createPlayer(supabase, "active", nextDay);
  }

  const { data: holding } = await supabase
    .from("players")
    .select("*")
    .eq("status", "holding")
    .gte("races", 1);

  const eligible = (holding || []).filter((player) => !excluded.has(player.id));

  if (eligible.length && seededBool(`${nextDay}:replacement`, 0.3)) {
    const idx = seededInt(`${nextDay}:replacement-pick`, 0, eligible.length - 1);
    const picked = eligible[idx];
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

/** Next brand-new racer (one-time) — jumps the line before random generation resumes. */
export const QUEUED_ROOKIE = {
  name: "walhof",
  slug: "walhof",
  identity: {
    archetype: "STAR",
    traits: ["FAMOUS", "LOUD"],
    signature_stat: "burst",
  } satisfies PlayerIdentity,
} as const;

export async function createPlayer(
  supabase: SupabaseClient,
  status: "active" | "holding",
  day: number
): Promise<Player> {
  const { data: existing } = await supabase.from("players").select("slug");
  const slugs = new Set((existing || []).map((p) => p.slug));

  let name: string;
  let slug: string;
  let identityOverride: PlayerIdentity | undefined;

  if (!slugs.has(QUEUED_ROOKIE.slug)) {
    name = QUEUED_ROOKIE.name;
    slug = QUEUED_ROOKIE.slug;
    identityOverride = { ...QUEUED_ROOKIE.identity };
  } else {
    ({ name, slug } = generateUniqueName(`new-player-${day}-${Date.now()}`, slugs));
    identityOverride = undefined;
  }

  const seed = `player-${slug}-${day}`;
  const insert = buildPlayerInsert(name, slug, status, day, seed, identityOverride);

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

  const laneByPlayer = await assignLanesForRoster(
    supabase,
    rosterIds,
    dayNumber,
    raceNumber
  );

  const entries = rosterIds.map((playerId) => ({
    race_id: race.id,
    player_id: playerId,
    lane: laneByPlayer.get(playerId) ?? 1,
    progress: 0,
    displayed_progress: 0,
    current_rank: 1,
    last_delta: 0,
    recent_deltas: [],
    race_score: 0,
    peak_race_score: 0,
    condition: 0,
  }));

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
  const { error } = await supabase.from("player_history").insert({
    player_id: playerId,
    race_id: raceId,
    day_number: dayNumber,
    event_type: eventType,
    event_text: eventText,
    finish_rank: finishRank,
    progress,
  });

  if (error) {
    throw new Error(`player_history insert failed (${eventType}): ${error.message}`);
  }
}

export async function getAllTimeTop3(
  supabase: SupabaseClient
): Promise<Array<Pick<Player, "id" | "name" | "wins">>> {
  const { data } = await supabase
    .from("players")
    .select("id, name, wins, races, best_finish, created_day")
    .gt("wins", 0)
    .order("wins", { ascending: false })
    .limit(24);

  if (!data?.length) return [];

  const sorted = [...data].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.races !== b.races) return a.races - b.races;
    const aBest = a.best_finish ?? 99;
    const bBest = b.best_finish ?? 99;
    if (aBest !== bBest) return aBest - bBest;
    return a.created_day - b.created_day;
  });

  return sorted.slice(0, 3).map(({ id, name, wins }) => ({ id, name, wins }));
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
    const { data: entries, error: entriesErr } = await supabase
      .from("race_entries")
      .select(RACE_ENTRY_PLAYER_SELECT)
      .eq("race_id", lastRace.id)
      .order("lane", { ascending: true });
    if (entriesErr) throw entriesErr;
    return {
      race: lastRace as Race,
      entries: (entries || []) as unknown as RaceEntryWithPlayer[],
    };
  }

  const { data: entries, error: entriesErr } = await supabase
    .from("race_entries")
    .select(RACE_ENTRY_PLAYER_SELECT)
    .eq("race_id", race.id)
    .order("lane", { ascending: true });
  if (entriesErr) throw entriesErr;

  return {
    race: race as Race,
    entries: (entries || []) as unknown as RaceEntryWithPlayer[],
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
        highest_race_score: 0,
        highest_career_score: 0,
        biggest_comeback: 0,
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
