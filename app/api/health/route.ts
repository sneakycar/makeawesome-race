import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  B3S_SUPABASE_PROJECT_REF,
  getConfiguredSupabaseHost,
  isB3sSupabaseConfigured,
} from "@/lib/supabase/project";

export const dynamic = "force-dynamic";

const STALE_TICK_WARN_MS = 20 * 60 * 1000;

/** Lightweight liveness probe — no tick side effects. */
export async function GET() {
  const supabaseHost = getConfiguredSupabaseHost();
  const configuredRef = isB3sSupabaseConfigured();

  try {
    const supabase = createAdminClient();
    const [raceResult, gameStateResult, raceCountResult] = await Promise.all([
      supabase
        .from("races")
        .select("id, race_number, status, ends_at")
        .eq("status", "active")
        .order("race_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("game_state").select("last_tick_at").eq("id", 1).maybeSingle(),
      supabase.from("races").select("id", { count: "exact", head: true }),
    ]);

    if (gameStateResult.error) {
      throw gameStateResult.error;
    }

    const lastTickAt = gameStateResult.data?.last_tick_at ?? null;
    const minutesSinceTick = lastTickAt
      ? (Date.now() - new Date(lastTickAt).getTime()) / 60000
      : null;
    const tickStale =
      minutesSinceTick != null && minutesSinceTick * 60000 >= STALE_TICK_WARN_MS;

    const ok =
      configuredRef &&
      Boolean(gameStateResult.data) &&
      Boolean(raceResult.data) &&
      !tickStale;

    return NextResponse.json(
      {
        ok,
        activeRace: raceResult.data?.race_number ?? null,
        lastTickAt,
        minutesSinceTick:
          minutesSinceTick != null ? Math.round(minutesSinceTick * 10) / 10 : null,
        tickStale,
        gameStateReady: Boolean(gameStateResult.data),
        raceCount: raceCountResult.count ?? 0,
        supabaseHost,
        expectedProjectRef: B3S_SUPABASE_PROJECT_REF,
        wrongDatabase: !configuredRef,
      },
      { status: ok ? 200 : 503 }
    );
  } catch (err) {
    console.error("GET /api/health", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "unhealthy",
        supabaseHost,
        expectedProjectRef: B3S_SUPABASE_PROJECT_REF,
        wrongDatabase: !configuredRef,
      },
      { status: 503 }
    );
  }
}
