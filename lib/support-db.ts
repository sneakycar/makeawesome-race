import type { SupabaseClient } from "@supabase/supabase-js";
import { clampNaturalRaceScore, normalizePeakRaceScore, roundRaceScore } from "./score";
import { appendRecentDelta } from "./hybrid-live-score";
import {
  computeLiveScoreGrant,
  computeNextVoteAt,
  MAX_VOTES_PER_VISITOR,
} from "./support-limits";
import { applyGrowthToPlayer, rollGrowthGains } from "./support-logic";
import type { EncouragementState, Player, Race } from "./types";

interface SupportRow {
  player_id: string;
  ip_hash: string;
  device_hash: string;
  live_score_granted: number;
  created_at: string;
}

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

async function fetchVisitorSupportRows(
  supabase: SupabaseClient,
  raceId: string,
  ipHash: string,
  deviceHash: string
): Promise<SupportRow[]> {
  const { data: byIp, error: ipErr } = await supabase
    .from("race_supports")
    .select("player_id, ip_hash, device_hash, live_score_granted, created_at")
    .eq("race_id", raceId)
    .eq("ip_hash", ipHash)
    .order("created_at", { ascending: true });

  if (ipErr) throw ipErr;

  if (!deviceHash) return (byIp ?? []) as SupportRow[];

  const { data: byDevice, error: deviceErr } = await supabase
    .from("race_supports")
    .select("player_id, ip_hash, device_hash, live_score_granted, created_at")
    .eq("race_id", raceId)
    .eq("device_hash", deviceHash)
    .order("created_at", { ascending: true });

  if (deviceErr) throw deviceErr;

  const merged = new Map<string, SupportRow>();
  for (const row of [...(byIp ?? []), ...(byDevice ?? [])]) {
    merged.set(`${row.created_at}:${row.player_id}`, row as SupportRow);
  }
  return [...merged.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export function buildEncouragementState(
  rows: SupportRow[],
  now = new Date()
): EncouragementState {
  const votesUsed = rows.length;
  const supportedPlayerId = rows[0]?.player_id ?? null;
  const lastVoteAt = rows.length ? new Date(rows[rows.length - 1].created_at) : null;
  const nextVoteAt = computeNextVoteAt(lastVoteAt, now);
  const votesRemaining = Math.max(0, MAX_VOTES_PER_VISITOR - votesUsed);
  const canVote = votesRemaining > 0 && nextVoteAt == null;

  return {
    supportedPlayerId,
    votesUsed,
    votesMax: MAX_VOTES_PER_VISITOR,
    votesRemaining,
    nextVoteAt: nextVoteAt?.toISOString() ?? null,
    canVote,
  };
}

export async function getVisitorEncouragementState(
  supabase: SupabaseClient,
  raceId: string,
  ipHash: string,
  deviceHash: string
): Promise<EncouragementState> {
  const rows = await fetchVisitorSupportRows(supabase, raceId, ipHash, deviceHash);
  return buildEncouragementState(rows);
}

/** @deprecated use getVisitorEncouragementState */
export async function getVisitorSupportForRace(
  supabase: SupabaseClient,
  raceId: string,
  ipHash: string
): Promise<string | null> {
  const state = await getVisitorEncouragementState(supabase, raceId, ipHash, "");
  return state.supportedPlayerId;
}

async function sumLiveScoreGranted(
  supabase: SupabaseClient,
  raceId: string,
  options: { playerId?: string } = {}
): Promise<number> {
  let query = supabase
    .from("race_supports")
    .select("live_score_granted")
    .eq("race_id", raceId);

  if (options.playerId) {
    query = query.eq("player_id", options.playerId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).reduce((sum, row) => sum + Number(row.live_score_granted ?? 0), 0);
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
      `Received ${supportCount} fan vote${supportCount === 1 ? "" : "s"}`
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

    const pressureBump = gains.length > 0 ? gains.length : 0;

    await supabase
      .from("players")
      .update({
        ...statUpdates,
        pressure: (statUpdates.pressure ?? player.pressure) + pressureBump,
        total_support_received: player.total_support_received + supportCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", playerId);
  }
}

export interface RecordEncouragementResult {
  ok: true;
  encouragement: EncouragementState;
  liveScoreGranted: number;
}

export async function recordEncouragement(
  supabase: SupabaseClient,
  raceId: string,
  playerId: string,
  ipHash: string,
  deviceHash: string
): Promise<RecordEncouragementResult | { ok: false; error: string }> {
  const now = new Date();

  const { data: race } = await supabase
    .from("races")
    .select("status")
    .eq("id", raceId)
    .maybeSingle();

  if (!race) return { ok: false, error: "Race not found" };
  if (race.status !== "active") return { ok: false, error: "Race is not active" };

  const visitorRows = await fetchVisitorSupportRows(supabase, raceId, ipHash, deviceHash);
  const state = buildEncouragementState(visitorRows, now);

  if (state.votesRemaining <= 0) {
    return { ok: false, error: "All votes used this race" };
  }

  if (state.nextVoteAt) {
    return { ok: false, error: "Cooldown — try again soon" };
  }

  if (state.supportedPlayerId && state.supportedPlayerId !== playerId) {
    return { ok: false, error: "Already backing another racer this race" };
  }

  const { data: entry } = await supabase
    .from("race_entries")
    .select("id, is_injured, is_fighting, race_score, fan_live_bonus, peak_race_score, recent_deltas, last_delta")
    .eq("race_id", raceId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (!entry) return { ok: false, error: "Player not in this race" };
  if (entry.is_injured) return { ok: false, error: "Cannot support injured racer" };
  if (entry.is_fighting) return { ok: false, error: "Cannot support fighting racer" };

  const fanLiveSoFar = visitorRows.reduce(
    (sum, row) => sum + Number(row.live_score_granted ?? 0),
    0
  );
  const racerLiveSoFar = await sumLiveScoreGranted(supabase, raceId, { playerId });
  const raceLiveSoFar = await sumLiveScoreGranted(supabase, raceId);
  const liveGrant = computeLiveScoreGrant({
    fanLiveSoFar,
    racerLiveSoFar,
    raceLiveSoFar,
  });

  const { error } = await supabase.from("race_supports").insert({
    race_id: raceId,
    player_id: playerId,
    ip_hash: ipHash,
    device_hash: deviceHash,
    live_score_granted: liveGrant.granted,
  });

  if (error) throw error;

  if (liveGrant.granted > 0) {
    const currentScore = Number(entry.race_score ?? 0);
    const currentBonus = Number(entry.fan_live_bonus ?? 0);
    const newBonus = currentBonus + liveGrant.granted;
    const newScore = clampNaturalRaceScore(currentScore + liveGrant.granted);
    const recentDeltas = appendRecentDelta(entry.recent_deltas, liveGrant.granted);
    const peakRaceScore = Math.max(
      normalizePeakRaceScore(Number(entry.peak_race_score ?? 0), 0),
      roundRaceScore(newScore)
    );

    await supabase
      .from("race_entries")
      .update({
        fan_live_bonus: newBonus,
        race_score: newScore,
        progress: newScore,
        displayed_progress: Math.round(roundRaceScore(newScore)),
        peak_race_score: peakRaceScore,
        recent_deltas: recentDeltas,
        last_delta: liveGrant.granted,
        updated_at: now.toISOString(),
      })
      .eq("id", entry.id);
  }

  const updatedRows = await fetchVisitorSupportRows(supabase, raceId, ipHash, deviceHash);
  const encouragement = buildEncouragementState(updatedRows, now);

  return {
    ok: true,
    encouragement,
    liveScoreGranted: liveGrant.granted,
  };
}
