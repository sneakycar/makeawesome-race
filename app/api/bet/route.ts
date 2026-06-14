import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordBadMoneyBet } from "@/lib/bad-money-db";
import { getActiveRaceWithEntries } from "@/lib/race-logic";
import { isRaceDelayed } from "@/lib/race-delay";
import {
  getRequestIp,
  hashRequestIp,
  hashUserAgent,
} from "@/lib/request-identity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const raceId = String(body.raceId || "").trim();
    const playerId = String(body.playerId || "").trim();

    if (!raceId || !playerId) {
      return NextResponse.json({ error: "raceId and playerId required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const active = await getActiveRaceWithEntries(supabase);

    if (!active || active.race.status !== "active") {
      return NextResponse.json({ error: "No active race" }, { status: 400 });
    }

    if (active.race.id !== raceId) {
      return NextResponse.json({ error: "Race is not active" }, { status: 400 });
    }

    if (isRaceDelayed(active.race, new Date())) {
      return NextResponse.json({ error: "Race is delayed" }, { status: 409 });
    }

    const entry = active.entries.find((e) => e.player_id === playerId);
    if (!entry) {
      return NextResponse.json({ error: "Racer not in this race" }, { status: 400 });
    }

    if (entry.is_injured) {
      return NextResponse.json({ error: "Racer is injured" }, { status: 400 });
    }

    const { data: gameState } = await supabase
      .from("game_state")
      .select("current_day")
      .eq("id", 1)
      .single();

    const ipHash = hashRequestIp(getRequestIp(request));
    const userAgent = request.headers.get("user-agent") ?? "";
    const userAgentHash = userAgent ? hashUserAgent(userAgent) : null;

    const result = await recordBadMoneyBet(
      supabase,
      raceId,
      playerId,
      ipHash,
      userAgentHash,
      gameState?.current_day ?? active.race.day_number
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      message: result.message,
      betPlayerId: playerId,
    });
  } catch (err) {
    console.error("POST /api/bet", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
