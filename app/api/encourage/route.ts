import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, hashIp } from "@/lib/ip-hash";
import { getActiveRaceWithEntries } from "@/lib/race-logic";
import { isRaceDelayed } from "@/lib/race-delay";
import { recordEncouragement } from "@/lib/support-db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const playerId = String(body.playerId || "").trim();

    if (!playerId) {
      return NextResponse.json({ error: "playerId required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const active = await getActiveRaceWithEntries(supabase);

    if (!active || active.race.status !== "active") {
      return NextResponse.json({ error: "No active race" }, { status: 400 });
    }

    if (isRaceDelayed(active.race, new Date())) {
      return NextResponse.json({ error: "Race is delayed" }, { status: 409 });
    }

    const ipHash = hashIp(getClientIp(request));
    const result = await recordEncouragement(
      supabase,
      active.race.id,
      playerId,
      ipHash
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({ ok: true, supportedPlayerId: playerId });
  } catch (err) {
    console.error("POST /api/encourage", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
