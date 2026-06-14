import { formatRaceScore } from "./score";
import { seededBool } from "./seeded-rng";
import {
  BIG_LAP_PHRASES,
  CHAOS_SURGE_PHRASES,
  COLLAPSE_PHRASES,
  ELIMINATED_PHRASES,
  HOT_STRETCH_PHRASES,
  LATE_CLOSE_PHRASES,
  LEAD_CHANGE_PHRASES,
  LEAD_PRESSURE_PHRASES,
  pickTickerPhrase,
  RACE_START_PHRASES,
  RACE_WON_PHRASES,
  RANK_SLIP_PHRASES,
  RANK_SURGE_BIG_PHRASES,
  RANK_SURGE_TWO_PHRASES,
  RESTART_PHRASES,
  ROOKIE_RUN_PHRASES,
  STALL_LONG_PHRASES,
  STALL_TOP_PHRASES,
  UNDERDOG_PHRASES,
} from "./ticker-phrases";
import type { Player, TickerEventFacts } from "./types";

export interface TickerEntrySnapshot {
  player_id: string;
  player: Player;
  current_rank: number;
  progress: number;
  last_delta: number;
  event_note: string | null;
}

export type TickerEventType =
  | "lead_change"
  | "chaos_surge"
  | "collapse"
  | "rank_surge"
  | "rank_slip"
  | "big_lap"
  | "stall"
  | "underdog"
  | "rookie_run"
  | "late_close"
  | "lead_pressure"
  | "race_start"
  | "status_pulse"
  | "race_won"
  | "eliminated"
  | "race_delay"
  | "race_resumed"
  | "fight";

export interface TickerEventDraft {
  eventType: TickerEventType;
  playerId: string | null;
  message: string;
  facts: TickerEventFacts;
  priority: number;
}

function onAirName(name: string): string {
  return name.toUpperCase().trim();
}

function shouldBroadcast(seed: string, priority: number): boolean {
  if (priority >= 88) return true;
  if (priority >= 72) return seededBool(`${seed}:air`, 0.55);
  if (priority >= 58) return seededBool(`${seed}:air`, 0.38);
  return seededBool(`${seed}:air`, 0.22);
}

function baseFacts(
  entry: TickerEntrySnapshot,
  tickNumber: number,
  percentComplete: number,
  rankBefore?: number
): TickerEventFacts {
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
  const beforeById = new Map(before.map((e) => [e.player_id, e]));
  const afterSorted = [...after].sort((a, b) => a.current_rank - b.current_rank);
  const beforeSorted = [...before].sort((a, b) => a.current_rank - b.current_rank);

  const oldLeader = beforeSorted[0];
  const newLeader = afterSorted[0];
  const candidates: TickerEventDraft[] = [];

  if (oldLeader && newLeader && oldLeader.player_id !== newLeader.player_id) {
    const name = onAirName(newLeader.player.name);
    const prevName = onAirName(oldLeader.player.name);
    candidates.push({
      eventType: "lead_change",
      playerId: newLeader.player_id,
      priority: 100,
      message: pickTickerPhrase(`${raceId}:${tickNumber}:lead`, LEAD_CHANGE_PHRASES, {
        name,
        prev: prevName,
      }),
      facts: {
        ...baseFacts(newLeader, tickNumber, percentComplete, oldLeader.current_rank),
        previousLeaderName: oldLeader.player.name,
      },
    });
  }

  for (const entry of after) {
    const prev = beforeById.get(entry.player_id);
    if (!prev) continue;

    const name = onAirName(entry.player.name);
    const rankGain = prev.current_rank - entry.current_rank;
    const rankLoss = entry.current_rank - prev.current_rank;
    const seed = `${raceId}:${entry.player_id}:${tickNumber}`;
    const facts = baseFacts(entry, tickNumber, percentComplete, prev.current_rank);

    if (entry.event_note?.includes("CHAOS SURGE")) {
      candidates.push({
        eventType: "chaos_surge",
        playerId: entry.player_id,
        priority: 94,
        message: pickTickerPhrase(`${seed}:chaos`, CHAOS_SURGE_PHRASES, { name }),
        facts: { ...facts, eventNote: "CHAOS SURGE" },
      });
    }

    if (entry.event_note?.includes("COLLAPSE") || rankLoss >= 3) {
      candidates.push({
        eventType: "collapse",
        playerId: entry.player_id,
        priority: 90,
        message: pickTickerPhrase(`${seed}:fade`, COLLAPSE_PHRASES, { name, loss: rankLoss }),
        facts,
      });
    } else if (rankLoss === 2) {
      candidates.push({
        eventType: "rank_slip",
        playerId: entry.player_id,
        priority: 70,
        message: pickTickerPhrase(`${seed}:slip`, RANK_SLIP_PHRASES, { name }),
        facts,
      });
    }

    if (rankGain >= 3) {
      candidates.push({
        eventType: "rank_surge",
        playerId: entry.player_id,
        priority: 82 + Math.min(rankGain, 5),
        message: pickTickerPhrase(`${seed}:surge`, RANK_SURGE_BIG_PHRASES, { name, gain: rankGain }),
        facts,
      });
    } else if (rankGain === 2) {
      candidates.push({
        eventType: "rank_surge",
        playerId: entry.player_id,
        priority: 68,
        message: pickTickerPhrase(`${seed}:gain2`, RANK_SURGE_TWO_PHRASES, { name }),
        facts,
      });
    }

    if (entry.last_delta > 2.6 && rankGain < 2) {
      candidates.push({
        eventType: "big_lap",
        playerId: entry.player_id,
        priority: 60,
        message: pickTickerPhrase(`${seed}:lap`, BIG_LAP_PHRASES, {
          name,
          delta: Math.round(entry.last_delta),
        }),
        facts,
      });
    }

    if (entry.event_note?.includes("HOT STRETCH")) {
      candidates.push({
        eventType: "big_lap",
        playerId: entry.player_id,
        priority: 70,
        message: pickTickerPhrase(`${seed}:hot`, HOT_STRETCH_PHRASES, { name }),
        facts,
      });
    }

    if (entry.event_note?.includes("STALL") || entry.last_delta < 0.15) {
      const stalled = entry.event_note?.includes("STALL");
      if (entry.current_rank <= 4 || stalled) {
        candidates.push({
          eventType: "stall",
          playerId: entry.player_id,
          priority: stalled ? 72 : 56,
          message: pickTickerPhrase(
            `${seed}:stall`,
            stalled ? STALL_LONG_PHRASES : STALL_TOP_PHRASES,
            { name, rank: entry.current_rank }
          ),
          facts,
        });
      }
    }

    if (entry.event_note?.includes("RESTART")) {
      candidates.push({
        eventType: "rank_surge",
        playerId: entry.player_id,
        priority: 75,
        message: pickTickerPhrase(`${seed}:restart`, RESTART_PHRASES, { name }),
        facts,
      });
    }

    if (
      entry.player.wins === 0 &&
      entry.current_rank <= 3 &&
      prev.current_rank > 3 &&
      percentComplete > 40
    ) {
      candidates.push({
        eventType: "underdog",
        playerId: entry.player_id,
        priority: 78,
        message: pickTickerPhrase(`${seed}:underdog`, UNDERDOG_PHRASES, {
          name,
          rank: entry.current_rank,
        }),
        facts,
      });
    }

    if (
      entry.player.rookie_until_day != null &&
      entry.current_rank <= 2 &&
      prev.current_rank > 4 &&
      percentComplete < 70
    ) {
      candidates.push({
        eventType: "rookie_run",
        playerId: entry.player_id,
        priority: 66,
        message: pickTickerPhrase(`${seed}:rookie`, ROOKIE_RUN_PHRASES, {
          name,
          rank: entry.current_rank,
        }),
        facts,
      });
    }
  }

  if (percentComplete > 78 && newLeader) {
    const leaderAfter = after.find((e) => e.player_id === newLeader.player_id);
    const leaderBefore = beforeById.get(newLeader.player_id);
    if (
      leaderAfter &&
      leaderBefore &&
      leaderAfter.player_id === oldLeader?.player_id &&
      leaderAfter.last_delta < 0.6
    ) {
      const name = onAirName(newLeader.player.name);
      candidates.push({
        eventType: "lead_pressure",
        playerId: newLeader.player_id,
        priority: 64,
        message: pickTickerPhrase(`${raceId}:${tickNumber}:tight`, LEAD_PRESSURE_PHRASES, {
          name,
        }),
        facts: baseFacts(leaderAfter, tickNumber, percentComplete, leaderBefore.current_rank),
      });
    }
  }

  if (percentComplete > 88) {
    const chaser = afterSorted[1];
    const leader = afterSorted[0];
    if (chaser && leader) {
      const gap = Number(leader.progress) - Number(chaser.progress);
      if (gap < 8 && gap > 0) {
        const chaserName = onAirName(chaser.player.name);
        const leaderName = onAirName(leader.player.name);
        candidates.push({
          eventType: "late_close",
          playerId: chaser.player_id,
          priority: 88,
          message: pickTickerPhrase(`${raceId}:${tickNumber}:close`, LATE_CLOSE_PHRASES, {
            chaser: chaserName,
            leader: leaderName,
            gap: Math.round(gap),
          }),
          facts: {
            ...baseFacts(chaser, tickNumber, percentComplete, beforeById.get(chaser.player_id)?.current_rank),
            gapToLeader: Number(gap.toFixed(1)),
          },
        });
      }
    }
  }

  const verified = candidates.filter((c) =>
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
