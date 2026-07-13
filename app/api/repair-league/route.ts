import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActiveRaceWithEntries,
  repairLeagueRaceState,
  resetEmptyLeague,
} from "@/lib/race-logic";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Manual league recovery — requires CRON_SECRET bearer token. */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const before = await Promise.all([
      supabase.from("races").select("id", { count: "exact", head: true }),
      supabase.from("players").select("id", { count: "exact", head: true }),
      supabase
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("status", "holding"),
    ]);

    try {
      await repairLeagueRaceState(supabase);
    } catch (repairErr) {
      console.error("repairLeagueRaceState:", repairErr);
      await resetEmptyLeague(supabase);
    }

    const active = await getActiveRaceWithEntries(supabase);
    if (!active) {
      await resetEmptyLeague(supabase);
    }

    const activeAfter = await getActiveRaceWithEntries(supabase);
    const after = await supabase
      .from("races")
      .select("id", { count: "exact", head: true });

    return NextResponse.json({
      ok: Boolean(activeAfter),
      before: {
        raceCount: before[0].count ?? 0,
        totalPlayerCount: before[1].count ?? 0,
        activeCount: before[2].count ?? 0,
        holdingCount: before[3].count ?? 0,
      },
      after: {
        raceCount: after.count ?? 0,
        raceNumber: activeAfter?.race.race_number ?? null,
        raceStatus: activeAfter?.race.status ?? null,
        entryCount: activeAfter?.entries.length ?? 0,
      },
    });
  } catch (err) {
    console.error("POST /api/repair-league", err);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err && "message" in err
          ? String((err as { message: unknown }).message)
          : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
