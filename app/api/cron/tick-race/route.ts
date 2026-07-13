import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveRaceWithEntries, runTickPipeline } from "@/lib/race-logic";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    await runTickPipeline(supabase);
    const active = await getActiveRaceWithEntries(supabase);
    return NextResponse.json({
      ok: true,
      raceNumber: active?.race.race_number ?? null,
      entryCount: active?.entries.length ?? 0,
      percentComplete: active?.race.percent_complete ?? null,
    });
  } catch (err) {
    console.error("GET /api/cron/tick-race", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
