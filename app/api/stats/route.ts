import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeagueStats } from "@/lib/league-stats";
import { initializeGameIfNeeded } from "@/lib/race-logic";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();
    await initializeGameIfNeeded(supabase);
    const stats = await getLeagueStats(supabase);
    return NextResponse.json(stats);
  } catch (err) {
    console.error("GET /api/stats", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
