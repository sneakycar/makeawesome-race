import { formatRaceScore } from "./score";
import { seededBool } from "./seeded-rng";
import {
  pickTickerPhrase,
  RACE_START_PHRASES,
  RACE_WON_PHRASES,
  ELIMINATED_PHRASES,
} from "./ticker-phrases";
import {
  buildRaceTickContext,
  collectGatedTickCandidates,
  passesTickerGate,
} from "./ticker-gate";
import type { TickerEntrySnapshot, TickerEventDraft, TickerEventType } from "./ticker-types";

export type { TickerEntrySnapshot, TickerEventDraft, TickerEventType } from "./ticker-types";

function shouldBroadcast(seed: string, priority: number): boolean {
  if (priority >= 88) return true;
  if (priority >= 72) return seededBool(`${seed}:air`, 0.55);
  if (priority >= 58) return seededBool(`${seed}:air`, 0.38);
  return seededBool(`${seed}:air`, 0.22);
}

function onAirName(name: string): string {
  return name.toUpperCase().trim();
}

function baseFacts(
  entry: TickerEntrySnapshot,
  tickNumber: number,
  percentComplete: number,
  rankBefore?: number
) {
  return {
    tickNumber,
    percentComplete,
    playerName: entry.player.name,
    rankBefore,
    rankAfter: entry.current_rank,
    rankChange: rankBefore != null ? rankBefore - entry.current_rank : undefined,
    progressAfter: Math.round(Number(entry.progress)),
    lastDelta: Number(entry.last_delta.toFixed(2)),
    eventNote: entry.event_note,
  };
}

export function generateTickTickerEvents(
  before: TickerEntrySnapshot[],
  after: TickerEntrySnapshot[],
  percentComplete: number,
  raceId: string,
  tickNumber: number
): TickerEventDraft[] {
  const ctx = buildRaceTickContext(before, after, percentComplete, raceId, tickNumber);
  const candidates = collectGatedTickCandidates(ctx);

  const verified = candidates.filter(
    (c) =>
      passesTickerGate(c) &&
      shouldBroadcast(`${raceId}:${tickNumber}:${c.eventType}:${c.playerId}`, c.priority)
  );

  verified.sort((a, b) => b.priority - a.priority);

  if (verified.length === 0) return [];

  return [verified[0]];
}

/** Always-on standings line for each cron tick. */
export function generateStatusPulseTickerEvent(
  after: TickerEntrySnapshot[],
  raceNumber: number,
  percentComplete: number,
  tickNumber: number
): TickerEventDraft {
  const sorted = [...after].sort((a, b) => a.current_rank - b.current_rank);
  const leader = sorted[0];
  const last = sorted[sorted.length - 1];
  const leaderName = onAirName(leader.player.name);
  const lastName = onAirName(last.player.name);
  const leaderPts = Math.round(Number(leader.progress));
  const lastPts = Math.round(Number(last.progress));

  return {
    eventType: "status_pulse",
    playerId: leader.player_id,
    priority: 55,
    message: `${leaderName} LEADS ${formatRaceScore(leaderPts)} · ${lastName} ${formatRaceScore(lastPts)}`,
    facts: {
      ...baseFacts(leader, tickNumber, percentComplete),
      raceNumber,
      playerName: leader.player.name,
    },
  };
}

export function generateRaceStartTickerEvents(raceNumber: number): TickerEventDraft[] {
  return [
    {
      eventType: "race_start",
      playerId: null,
      priority: 85,
      message: pickTickerPhrase(`race-start:${raceNumber}`, RACE_START_PHRASES, {}),
      facts: {
        tickNumber: 0,
        percentComplete: 0,
        playerName: "",
        raceNumber,
      },
    },
  ];
}

export function generateFinalizeTickerEvents(
  winnerName: string,
  lastName: string,
  raceNumber: number,
  winnerId: string,
  lastId: string
): TickerEventDraft[] {
  const winner = onAirName(winnerName);
  const last = onAirName(lastName);
  return [
    {
      eventType: "race_won",
      playerId: winnerId,
      priority: 100,
      message: pickTickerPhrase(`finalize:${raceNumber}:win`, RACE_WON_PHRASES, { winner }),
      facts: {
        tickNumber: 48,
        percentComplete: 100,
        playerName: winnerName,
        winnerName,
        raceNumber,
        rankAfter: 1,
      },
    },
    {
      eventType: "eliminated",
      playerId: lastId,
      priority: 95,
      message: pickTickerPhrase(`finalize:${raceNumber}:last`, ELIMINATED_PHRASES, { last }),
      facts: {
        tickNumber: 48,
        percentComplete: 100,
        playerName: lastName,
        eliminatedName: lastName,
        rankAfter: 8,
        raceNumber,
      },
    },
  ];
}
