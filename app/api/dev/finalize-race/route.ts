import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { forceFinalizeActiveRace } from "@/lib/race-logic";

export const dynamic = "force-dynamic";

function devOnly() {
  return process.env.NODE_ENV === "development";
}

export async function POST() {
  if (!devOnly()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const supabase = createAdminClient();
    await forceFinalizeActiveRace(supabase, false);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/dev/finalize-race", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
