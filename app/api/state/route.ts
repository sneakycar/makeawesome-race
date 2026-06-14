import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, hashIp } from "@/lib/ip-hash";
import {
  calculatePercentComplete,
  getActiveRaceOnly,
  getActiveRaceWithEntries,
  getAllTimeTop3,
  initializeGameIfNeeded,
} from "@/lib/race-logic";
import { getVisitorSupportForRace } from "@/lib/support-db";
import { getRecentTickerEvents } from "@/lib/ticker-db";
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
    const percentComplete =
      race.status === "finalized"
        ? 100
        : calculatePercentComplete(startedAt, endsAt, now);
    const remainingMs = Math.max(0, endsAt.getTime() - now.getTime());

    const allTime = await getAllTimeTop3(supabase);

    const { data: holding } = await supabase
      .from("players")
      .select("*")
      .eq("status", "holding")
      .order("name", { ascending: true });

    const { data: gameState } = await supabase.from("game_state").select("*").eq("id", 1).single();

    const ipHash = hashIp(getClientIp(request));
    const supportedPlayerId =
      race.status === "active"
        ? await getVisitorSupportForRace(supabase, race.id, ipHash)
        : null;

    const ticker = await getRecentTickerEvents(supabase, race.id, 6);

    const activeRace = await getActiveRaceOnly(supabase);
    const betweenRaces = !activeRace && race.status === "finalized";
    const nextRaceNumber = betweenRaces ? race.race_number + 1 : null;

    const body: GameStateResponse = {
      race: { ...race, percent_complete: percentComplete },
      entries,
      allTime: allTime || [],
      holding: holding || [],
      serverTime: now.toISOString(),
      remainingMs,
      percentComplete,
      gameState: gameState!,
      encouragement: { supportedPlayerId },
      ticker,
      betweenRaces,
      nextRaceNumber,
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
