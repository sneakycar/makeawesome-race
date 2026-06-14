import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveRaceWithEntries } from "@/lib/race-logic";
import type { PlayerProfileResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = createAdminClient();

    const { data: player, error } = await supabase
      .from("players")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const { data: history } = await supabase
      .from("player_history")
      .select("*")
      .eq("player_id", player.id)
      .order("day_number", { ascending: false })
      .limit(20);

    let currentRaceNumber: number | null = null;
    let currentRank: number | null = null;
    let currentProgress: number | null = null;

    const active = await getActiveRaceWithEntries(supabase);
    if (active) {
      currentRaceNumber = active.race.race_number;
      const entry = active.entries.find((e) => e.player_id === player.id);
      if (entry) {
        currentRank = entry.current_rank;
        currentProgress = entry.displayed_progress;
      }
    }

    const body: PlayerProfileResponse = {
      player,
      history: history || [],
      currentRaceNumber,
      currentRank,
      currentProgress,
    };

    return NextResponse.json(body);
  } catch (err) {
    console.error("GET /api/player/[slug]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
