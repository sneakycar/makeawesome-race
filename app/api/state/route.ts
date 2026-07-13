import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchHomeState } from "@/lib/fetch-home-state";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();
    const body = await fetchHomeState(supabase, request);
    if (!body) {
      return NextResponse.json({ error: "No race found" }, { status: 404 });
    }
    return NextResponse.json(body);
  } catch (err) {
    console.error("GET /api/state", err);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err && "message" in err
          ? String((err as { message: unknown }).message)
          : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
