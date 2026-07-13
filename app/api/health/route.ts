import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Lightweight liveness probe — no tick side effects. */
export async function GET() {
  try {
    const supabase = createAdminClient();
    const [raceResult, gameStateResult] = await Promise.all([
      supabase
        .from("races")
        .select("id, race_number, status, ends_at")
        .eq("status", "active")
        .order("race_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("game_state").select("last_tick_at").eq("id", 1).maybeSingle(),
    ]);

    if (gameStateResult.error) {
      throw gameStateResult.error;
    }

    return NextResponse.json({
      ok: true,
      activeRace: raceResult.data?.race_number ?? null,
      lastTickAt: gameStateResult.data?.last_tick_at ?? null,
      gameStateReady: Boolean(gameStateResult.data),
    });
  } catch (err) {
    console.error("GET /api/health", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unhealthy" },
      { status: 503 }
    );
  }
}
