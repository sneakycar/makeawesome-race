import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTickPipeline } from "@/lib/race-logic";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    await runTickPipeline(supabase);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("GET /api/cron/tick-race", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
