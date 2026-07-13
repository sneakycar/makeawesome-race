import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchHomeState } from "@/lib/fetch-home-state";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();
    const body = await fetchHomeState(supabase, request);
    if (!body) {
      const [
        { count: raceCount },
        { count: totalPlayerCount },
        { count: activeCount },
        { count: holdingCount },
      ] = await Promise.all([
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
      return NextResponse.json(
        {
          error: "No race found",
          raceCount: raceCount ?? 0,
          totalPlayerCount: totalPlayerCount ?? 0,
          activeCount: activeCount ?? 0,
          holdingCount: holdingCount ?? 0,
        },
        { status: 404 }
      );
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
