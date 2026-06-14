import type { SupabaseClient } from "@supabase/supabase-js";
import { applyGrowthToPlayer, rollGrowthGains } from "./support-logic";
import type { Player, Race } from "./types";

async function addSupportHistory(
  supabase: SupabaseClient,
  playerId: string,
  raceId: string,
  dayNumber: number,
  eventType: string,
  eventText: string
) {
  await supabase.from("player_history").insert({
    player_id: playerId,
    race_id: raceId,
    day_number: dayNumber,
    event_type: eventType,
    event_text: eventText,
    finish_rank: null,
    progress: null,
  });
}

export async function processRaceSupports(
  supabase: SupabaseClient,
  race: Race,
  currentDay: number
): Promise<void> {
  const { data: supports, error } = await supabase
    .from("race_supports")
    .select("player_id")
    .eq("race_id", race.id);

  if (error) throw error;
  if (!supports?.length) return;

  const countByPlayer = new Map<string, number>();
  for (const row of supports) {
    countByPlayer.set(row.player_id, (countByPlayer.get(row.player_id) ?? 0) + 1);
  }

  const { data: allPlayers } = await supabase.from("players").select("*");
  if (!allPlayers?.length) return;

  for (const [playerId, supportCount] of countByPlayer) {
    const { data: freshPlayer } = await supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .single();

    const player = freshPlayer as Player | null;
    if (!player || supportCount <= 0) continue;

    await addSupportHistory(
      supabase,
      playerId,
      race.id,
      currentDay,
      "support",
      "Received Support"
    );

    const gains = rollGrowthGains(
      race.id,
      playerId,
      player,
      supportCount,
      currentDay,
      allPlayers as Player[]
    );

    const statUpdates = applyGrowthToPlayer(player, gains);

    for (const gain of gains) {
      await addSupportHistory(
        supabase,
        playerId,
        race.id,
        currentDay,
        "growth",
        gain.label
      );
    }

    await supabase
      .from("players")
      .update({
        ...statUpdates,
        total_support_received: player.total_support_received + supportCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", playerId);
  }
}

export async function getVisitorSupportForRace(
  supabase: SupabaseClient,
  raceId: string,
  ipHash: string
): Promise<string | null> {
  const { data } = await supabase
    .from("race_supports")
    .select("player_id")
    .eq("race_id", raceId)
    .eq("ip_hash", ipHash)
    .maybeSingle();

  return data?.player_id ?? null;
}

export async function recordEncouragement(
  supabase: SupabaseClient,
  raceId: string,
  playerId: string,
  ipHash: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: race } = await supabase
    .from("races")
    .select("status")
    .eq("id", raceId)
    .maybeSingle();

  if (!race) return { ok: false, error: "Race not found" };
  if (race.status !== "active") return { ok: false, error: "Race is not active" };

  const existing = await getVisitorSupportForRace(supabase, raceId, ipHash);
  if (existing) return { ok: false, error: "Already encouraged this race" };

  const { data: entry } = await supabase
    .from("race_entries")
    .select("id, is_injured")
    .eq("race_id", raceId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (!entry) return { ok: false, error: "Player not in this race" };
  if (entry.is_injured) return { ok: false, error: "Cannot support injured racer" };

  const { error } = await supabase.from("race_supports").insert({
    race_id: raceId,
    player_id: playerId,
    ip_hash: ipHash,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Already encouraged this race" };
    }
    throw error;
  }

  return { ok: true };
}
