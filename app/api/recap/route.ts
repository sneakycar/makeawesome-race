import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLastRaceRecap } from "@/lib/last-race-recap";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const lastRaceRecap = await getLastRaceRecap(supabase);
    return NextResponse.json(
      { lastRaceRecap },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    console.error("GET /api/recap", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
