import type { Player } from "./types";
import {
  calculateFightChance,
  fightTraitMultiplier,
  pickFightPair,
  shouldStartFight,
  type FightPairPick,
} from "./fights";
import { rankSimEntries, type RaceSimEntry } from "./race-sim";
import type { TickerEventDraft } from "./ticker-types";

export interface FightTickContext {
  raceId: string;
  tickNumber: number;
  percentComplete: number;
}

export interface SimFightStartResult {
  pick: FightPairPick;
  ticker: TickerEventDraft;
}

/** Deterministic fight roll + sim mutation (shared by live ticks and ticker backfill). */
export function maybeStartSimFight(
  sim: RaceSimEntry[],
  ctx: FightTickContext
): SimFightStartResult | null {
  if (sim.some((entry) => entry.is_fighting)) return null;

  const ranked = rankSimEntries(sim);
  const eligible = ranked
    .filter((entry) => !entry.is_injured && !entry.is_fighting)
    .map((entry) => ({
      player_id: entry.player_id,
      current_rank: entry.current_rank,
      player: entry.player,
    }));

  const fightChance =
    calculateFightChance(ctx) * fightTraitMultiplier(eligible.map((e) => e.player));
  const fightSeed = `${ctx.raceId}:${ctx.tickNumber}:fight-roll`;

  if (!shouldStartFight(fightSeed, fightChance)) return null;

  const pick = pickFightPair(ctx.raceId, ctx.tickNumber, eligible);
  if (!pick) return null;

  const applyFightStart = (playerId: string, partnerId: string) => {
    const simEntry = sim.find((s) => s.player_id === playerId);
    if (!simEntry) return;
    const frozen = simEntry.score;
    simEntry.is_fighting = true;
    simEntry.fighting_at_tick = ctx.tickNumber;
    simEntry.fight_end_tick = ctx.tickNumber + pick.durationTicks;
    simEntry.fight_frozen_score = frozen;
  };

  applyFightStart(pick.playerAId, pick.playerBId);
  applyFightStart(pick.playerBId, pick.playerAId);

  const playerA = sim.find((s) => s.player_id === pick.playerAId)!.player as Player;
  const playerB = sim.find((s) => s.player_id === pick.playerBId)!.player as Player;

  return {
    pick,
    ticker: {
      message: `${playerA.name} and ${playerB.name} throw down — FIGHT!`,
      eventType: "fight",
      playerId: pick.playerAId,
      facts: {
        tickNumber: ctx.tickNumber,
        percentComplete: ctx.percentComplete,
        playerName: playerA.name,
        fightPartnerName: playerB.name,
      },
      priority: 78,
    },
  };
}

export function parseFightTickerMessage(message: string): { a: string; b: string } | null {
  const cleaned = message.replace(/\s+/g, " ").trim();
  const match = cleaned.match(/^(.+?)\s+and\s+(.+?)\s+throw down/i);
  if (!match) return null;
  return { a: match[1]!.trim(), b: match[2]!.trim() };
}
