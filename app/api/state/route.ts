import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, hashIp } from "@/lib/ip-hash";
import {
  getActiveRaceOnly,
  getActiveRaceWithEntries,
  getAllTimeTop3,
  getActiveStreaks,
  getNextRaceDayBounds,
  initializeGameIfNeeded,
} from "@/lib/race-logic";
import { getRaceClock } from "@/lib/race-clock";
import { getRaceDelayInfo, isRaceDelayed } from "@/lib/race-delay";
import { getVisitorEncouragementState } from "@/lib/support-db";
import { getVisitorBadMoneyState } from "@/lib/bad-money-db";
import { hashRequestIp, getRequestIp } from "@/lib/request-identity";
import { hashVisitorDeviceId, normalizeDeviceId } from "@/lib/visitor-id";
import { getRecentTickerEvents } from "@/lib/ticker-db";
import { getLastRaceRecap } from "@/lib/last-race-recap";
import { getLaneWinStats } from "@/lib/lane-stats";
import { getOvrRankings, ovrRankingsToRecord } from "@/lib/ovr";
import type { GameStateResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();
    await initializeGameIfNeeded(supabase);

    const active = await getActiveRaceWithEntries(supabase);
    if (!active) {
      return NextResponse.json({ error: "No race found" }, { status: 404 });
    }

    const { race, entries } = active;
    const now = new Date();
    const startedAt = new Date(race.started_at);
    const endsAt = new Date(race.ends_at);
    const delayActive = race.status === "active" && isRaceDelayed(race, now);
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

    const raceDelay =
      race.status === "active" ? getRaceDelayInfo(race, now) : null;
    const effectivePercent =
      delayActive && race.delay_frozen_percent != null
        ? race.delay_frozen_percent
        : clock.percentComplete;

    const allTime = await getAllTimeTop3(supabase);
    const streaks = await getActiveStreaks(supabase);
    const ovrRankings = ovrRankingsToRecord(await getOvrRankings(supabase));
    const laneStats = await getLaneWinStats(supabase);

    const { data: holding } = await supabase
      .from("players")
      .select("*")
      .eq("status", "holding")
      .gte("races", 1)
      .order("name", { ascending: true });

    const { data: injured } = await supabase
      .from("players")
      .select("*")
      .eq("status", "injured")
      .order("name", { ascending: true });

    const { data: gameState } = await supabase.from("game_state").select("*").eq("id", 1).single();

    const ipHash = hashIp(getClientIp(request));
    const deviceParam = new URL(request.url).searchParams.get("deviceId");
    const deviceId = normalizeDeviceId(deviceParam);
    const deviceHash = deviceId ? hashVisitorDeviceId(deviceId) : "";
    const encouragement =
      race.status === "active"
        ? await getVisitorEncouragementState(supabase, race.id, ipHash, deviceHash)
        : {
            supportedPlayerId: null,
            votesUsed: 0,
            votesMax: 6,
            votesRemaining: 6,
            nextVoteAt: null,
            canVote: false,
          };

    const badMoneyIpHash = hashRequestIp(getRequestIp(request));
    const badMoney =
      race.status === "active"
        ? await getVisitorBadMoneyState(supabase, race.id, badMoneyIpHash, true)
        : { betPlayerId: null, hasBet: false, canBet: false };

    const ticker = await getRecentTickerEvents(supabase, race.id, 12);
    const lastRaceRecap = await getLastRaceRecap(supabase);

    const activeRace = await getActiveRaceOnly(supabase);
    const betweenRaces = !activeRace && race.status === "finalized";
    const nextRaceNumber = betweenRaces ? race.race_number + 1 : null;
    const nextRaceStartsAt = betweenRaces
      ? getNextRaceDayBounds(new Date(race.ends_at)).startedAt.toISOString()
      : null;

    const body: GameStateResponse = {
      race: { ...race, percent_complete: effectivePercent },
      entries,
      allTime: allTime || [],
      streaks,
      holding: holding || [],
      injured: injured || [],
      ovrByPlayerId: ovrRankings,
      serverTime: now.toISOString(),
      remainingMs: clock.remainingMs,
      startsInMs: clock.startsInMs,
      racePhase: clock.phase,
      percentComplete: effectivePercent,
      raceDelay: raceDelay?.active ? raceDelay : null,
      laneStats,
      gameState: gameState!,
      encouragement,
      badMoney,
      ticker,
      lastRaceRecap,
      betweenRaces,
      nextRaceNumber,
      nextRaceStartsAt,
      devTools: process.env.NODE_ENV === "development",
    };

    return NextResponse.json(body);
  } catch (err) {
    console.error("GET /api/state", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
