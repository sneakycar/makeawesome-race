import type { SupabaseClient } from "@supabase/supabase-js";
import { seededBool } from "./seeded-rng";
import { isStillFightingAtRaceEnd } from "./fights";
import { getRaceTickCount } from "./race-logic";
import {
  applyBadMoneyStatDelta,
  getBadMoneyFlavorLine,
  getBadMoneyGrowthChance,
  getBadMoneyMagnitude,
  getBadMoneyPlayerPressure,
  getBadMoneyPressureBump,
  getBadMoneyRegressionChance,
  pickBadMoneyGrowthStat,
  pickBadMoneyRegressionStat,
} from "./bad-money";
import type { BadMoneyState, Player, Race, RaceEntryWithPlayer } from "./types";

interface BetRow {
  player_id: string;
  ip_hash: string;
  created_at: string;
}

async function addBadMoneyHistory(
  supabase: SupabaseClient,
  playerId: string,
  raceId: string,
  dayNumber: number,
  eventText: string
) {
  await supabase.from("player_history").insert({
    player_id: playerId,
    race_id: raceId,
    day_number: dayNumber,
    event_type: "bad_money",
    event_text: eventText,
    finish_rank: null,
    progress: null,
  });
}

export function buildBadMoneyState(
  row: BetRow | null | undefined,
  raceActive: boolean
): BadMoneyState {
  if (!raceActive) {
    return { betPlayerId: null, hasBet: false, canBet: false };
  }
  if (!row) {
    return { betPlayerId: null, hasBet: false, canBet: true };
  }
  return {
    betPlayerId: row.player_id,
    hasBet: true,
    canBet: false,
  };
}

export async function getVisitorBadMoneyState(
  supabase: SupabaseClient,
  raceId: string,
  ipHash: string,
  raceActive: boolean
): Promise<BadMoneyState> {
  const { data, error } = await supabase
    .from("race_bets")
    .select("player_id, ip_hash, created_at")
    .eq("race_id", raceId)
    .eq("ip_hash", ipHash)
    .maybeSingle();

  if (error) throw error;
  return buildBadMoneyState(data as BetRow | null, raceActive);
}

export async function recordBadMoneyBet(
  supabase: SupabaseClient,
  raceId: string,
  playerId: string,
  ipHash: string,
  userAgentHash: string | null,
  currentDay: number
): Promise<{ ok: true; message: string } | { ok: false; error: string; status: number }> {
  const { error: insertErr } = await supabase.from("race_bets").insert({
    race_id: raceId,
    player_id: playerId,
    ip_hash: ipHash,
    user_agent_hash: userAgentHash,
  });

  if (insertErr) {
    if (insertErr.code === "23505") {
      return { ok: false, error: "BAD MONEY ALREADY PLACED", status: 409 };
    }
    throw insertErr;
  }

  const { data: entry, error: entryErr } = await supabase
    .from("race_entries")
    .select("id, bad_money_count")
    .eq("race_id", raceId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (entryErr) throw entryErr;
  if (!entry) {
    return { ok: false, error: "Racer not in this race", status: 400 };
  }

  const nextCount = Number(entry.bad_money_count ?? 0) + 1;
  const effect = getBadMoneyMagnitude(nextCount);

  await supabase
    .from("race_entries")
    .update({
      bad_money_count: nextCount,
      bad_money_effect: effect,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entry.id);

  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("bad_money_total")
    .eq("id", playerId)
    .single();

  if (playerErr) throw playerErr;

  await supabase
    .from("players")
    .update({
      bad_money_total: Number(player.bad_money_total ?? 0) + 1,
      bad_money_last_day: currentDay,
      updated_at: new Date().toISOString(),
    })
    .eq("id", playerId);

  return { ok: true, message: "BAD MONEY ACCEPTED" };
}

export async function processBadMoneyAtFinalize(
  supabase: SupabaseClient,
  race: Race,
  entries: RaceEntryWithPlayer[],
  currentDay: number
): Promise<void> {
  for (const entry of entries) {
    const betCount = Number(entry.bad_money_count ?? 0);
    if (betCount <= 0) continue;

    const player = entry.player as Player;
    const lastTick = getRaceTickCount(new Date(race.started_at), new Date(race.ends_at)) - 1;
    const won =
      entry.final_rank === 1 &&
      !entry.is_injured &&
      !isStillFightingAtRaceEnd(entry, lastTick);

    await addBadMoneyHistory(
      supabase,
      player.id,
      race.id,
      currentDay,
      "BAD MONEY FOUND THEM"
    );

    const updates: Partial<Player> = {
      bad_money_races: Number(player.bad_money_races ?? 0) + 1,
      bad_money_pressure:
        Number(player.bad_money_pressure ?? 0) + getBadMoneyPressureBump(betCount),
      pressure: Math.min(
        100,
        Number(player.pressure ?? 0) + getBadMoneyPlayerPressure(betCount)
      ),
    };

    if (won) {
      updates.bad_money_wins = Number(player.bad_money_wins ?? 0) + betCount;
      const growthSeed = `${race.id}:${player.id}:bad-money:growth`;
      if (seededBool(growthSeed, getBadMoneyGrowthChance(betCount))) {
        const stat = pickBadMoneyGrowthStat(growthSeed, player);
        Object.assign(
          updates,
          applyBadMoneyStatDelta({ ...player, ...updates }, stat, 1)
        );
        await addBadMoneyHistory(
          supabase,
          player.id,
          race.id,
          currentDay,
          `BAD MONEY CHANGED ${stat.toUpperCase()} +1`
        );
      }
    } else if (!entry.is_injured) {
      updates.bad_money_losses = Number(player.bad_money_losses ?? 0) + betCount;
      const regressionSeed = `${race.id}:${player.id}:bad-money:regression`;
      if (seededBool(regressionSeed, getBadMoneyRegressionChance(betCount))) {
        const stat = pickBadMoneyRegressionStat(regressionSeed, player);
        Object.assign(
          updates,
          applyBadMoneyStatDelta({ ...player, ...updates }, stat, -1)
        );
        await addBadMoneyHistory(
          supabase,
          player.id,
          race.id,
          currentDay,
          `BAD MONEY DAMAGED ${stat.toUpperCase()} -1`
        );
      }
    }

    await supabase
      .from("players")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", player.id);
  }
}

export { getBadMoneyFlavorLine };
