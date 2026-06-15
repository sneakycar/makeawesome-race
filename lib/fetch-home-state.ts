import type { SupabaseClient } from "@supabase/supabase-js";
import { hashIp, getClientIp } from "./ip-hash";
import {
  getActiveRaceWithEntries,
  getAllTimeTop3,
  getActiveStreaks,
  getNextRaceDayBounds,
  initializeGameIfNeeded,
  ensureRaceTickedIfStale,
  repairActiveRaceSchedule,
} from "./race-logic";
import { getRaceClock } from "./race-clock";
import { getRaceDelayInfo, isRaceDelayed } from "./race-delay";
import { getVisitorEncouragementState } from "./support-db";
import { getVisitorBadMoneyState } from "./bad-money-db";
import { hashRequestIp, getRequestIp } from "./request-identity";
import { hashVisitorDeviceId, normalizeDeviceId } from "./visitor-id";
import { getRecentTickerEvents, getRaceTickLog } from "./ticker-db";
import { settledValue, withFallback } from "./server-resilience";
import type { GameStateResponse } from "./types";

const IDLE_ENCOURAGEMENT = {
  supportedPlayerId: null,
  votesUsed: 0,
  votesMax: 6,
  votesRemaining: 6,
  nextVoteAt: null,
  canVote: false,
} as const;

const IDLE_BAD_MONEY = {
  betPlayerId: null,
  hasBet: false,
  canBet: false,
} as const;

export async function fetchHomeState(
  supabase: SupabaseClient,
  request: Request
): Promise<GameStateResponse | null> {
  await withFallback("initializeGameIfNeeded", () => initializeGameIfNeeded(supabase), false);
  await withFallback("ensureRaceTickedIfStale", () => ensureRaceTickedIfStale(supabase), undefined);

  const active = await getActiveRaceWithEntries(supabase);
  if (!active) return null;

  let { race, entries } = active;
  race = await withFallback(
    "repairActiveRaceSchedule",
    () => repairActiveRaceSchedule(supabase, race),
    race
  );
  const now = new Date();
  const startedAt = new Date(race.started_at);
  const endsAt = new Date(race.ends_at);
  const raceIsActive = race.status === "active";
  const delayActive = raceIsActive && isRaceDelayed(race, now);
  const delayOpts =
    delayActive && race.delay_until && race.delay_frozen_percent != null
      ? { delayUntil: race.delay_until, frozenPercent: race.delay_frozen_percent }
      : null;

  const clock =
    race.status === "finalized"
      ? {
          phase: "ended" as const,
          percentComplete: 100,
          remainingMs: 0,
          startsInMs: 0,
        }
      : getRaceClock(startedAt, endsAt, now, delayOpts);

  const raceDelay = raceIsActive ? getRaceDelayInfo(race, now) : null;
  const effectivePercent =
    delayActive && race.delay_frozen_percent != null
      ? race.delay_frozen_percent
      : clock.percentComplete;

  const ipHash = hashIp(getClientIp(request));
  const deviceParam = new URL(request.url).searchParams.get("deviceId");
  const deviceId = normalizeDeviceId(deviceParam);
  const deviceHash = deviceId ? hashVisitorDeviceId(deviceId) : "";
  const badMoneyIpHash = hashRequestIp(getRequestIp(request));

  const [
    allTimeResult,
    streaksResult,
    gameStateResult,
    holdingResult,
    injuredResult,
    encouragementResult,
    badMoneyResult,
    tickerResult,
    raceLogResult,
  ] = await Promise.allSettled([
    getAllTimeTop3(supabase),
    getActiveStreaks(supabase),
    supabase.from("game_state").select("*").eq("id", 1).single(),
    supabase
      .from("players")
      .select("name, age_days")
      .eq("status", "holding")
      .gte("races", 1)
      .order("name", { ascending: true }),
    supabase
      .from("players")
      .select("name, current_injury_name, injury_races_remaining")
      .eq("status", "injured")
      .order("name", { ascending: true }),
    raceIsActive
      ? getVisitorEncouragementState(supabase, race.id, ipHash, deviceHash)
      : Promise.resolve(IDLE_ENCOURAGEMENT),
    raceIsActive
      ? getVisitorBadMoneyState(supabase, race.id, badMoneyIpHash, true)
      : Promise.resolve(IDLE_BAD_MONEY),
    getRecentTickerEvents(supabase, race.id, 1),
    getRaceTickLog(supabase, race.id),
  ]);

  const allTime = settledValue(allTimeResult, [], "getAllTimeTop3");
  const streaks = settledValue(streaksResult, [], "getActiveStreaks");
  const encouragement = settledValue(encouragementResult, IDLE_ENCOURAGEMENT, "encouragement");
  const badMoney = settledValue(badMoneyResult, IDLE_BAD_MONEY, "badMoney");
  const ticker = settledValue(tickerResult, [], "ticker");
  const raceLog = settledValue(raceLogResult, [], "raceLog");

  const gameStateResultValue =
    gameStateResult.status === "fulfilled" ? gameStateResult.value : null;
  const holdingResultValue =
    holdingResult.status === "fulfilled" ? holdingResult.value : { data: [], error: null };
  const injuredResultValue =
    injuredResult.status === "fulfilled" ? injuredResult.value : { data: [], error: null };

  if (gameStateResult.status === "rejected") {
    console.error("[game_state]", gameStateResult.reason);
  }
  if (holdingResult.status === "rejected") {
    console.error("[holding]", holdingResult.reason);
  }
  if (injuredResult.status === "rejected") {
    console.error("[injured]", injuredResult.reason);
  }

  const gameState = gameStateResultValue?.data;
  if (!gameState) throw new Error("game_state missing");

  const betweenRaces = race.status === "finalized";
  const nextRaceNumber = betweenRaces ? race.race_number + 1 : null;
  const nextRaceStartsAt = betweenRaces
    ? getNextRaceDayBounds(new Date(race.ends_at)).startedAt.toISOString()
    : null;

  return {
    race: { ...race, percent_complete: effectivePercent },
    entries,
    allTime: allTime || [],
    streaks,
    holding: holdingResultValue.data || [],
    injured: injuredResultValue.data || [],
    serverTime: now.toISOString(),
    remainingMs: clock.remainingMs,
    startsInMs: clock.startsInMs,
    racePhase: clock.phase,
    percentComplete: effectivePercent,
    raceDelay: raceDelay?.active ? raceDelay : null,
    gameState,
    encouragement,
    badMoney,
    ticker,
    raceLog,
    betweenRaces,
    nextRaceNumber,
    nextRaceStartsAt,
    devTools: process.env.NODE_ENV === "development",
  };
}
