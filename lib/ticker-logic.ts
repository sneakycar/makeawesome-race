import { seededBool, seededInt } from "./seeded-rng";
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
  | "eliminated";

export interface TickerEventDraft {
  eventType: TickerEventType;
  playerId: string;
  message: string;
  facts: TickerEventFacts;
  priority: number;
}

function onAirName(name: string): string {
  return name.toUpperCase().trim();
}

function pickPhrase(seed: string, options: string[]): string {
  return options[seededInt(seed, 0, options.length - 1)];
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
      message: pickPhrase(`${raceId}:${tickNumber}:lead`, [
        `OH! ${name} TAKES THE LEAD — ${prevName} DROPPED!`,
        `LEAD CHANGE! ${name} IS OUT FRONT NOW!`,
        `${name} SEIZES THE POINT! WHAT A MOVE!`,
        `NEW LEADER! ${name} AT THE FRONT!`,
      ]),
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
        message: pickPhrase(`${seed}:chaos`, [
          `CHAOS SURGE! ${name} IS UNLEASHED!`,
          `${name} WENT ABSOLUTELY WILD!`,
          `OH MY — ${name} HIT A CHAOS BURST!`,
        ]),
        facts: { ...facts, eventNote: "CHAOS SURGE" },
      });
    }

    if (entry.event_note?.includes("COLLAPSE") || rankLoss >= 3) {
      candidates.push({
        eventType: "collapse",
        playerId: entry.player_id,
        priority: 90,
        message: pickPhrase(`${seed}:fade`, [
          `${name} IS FADING FAST — DOWN ${rankLoss} SPOTS!`,
          `DISASTER FOR ${name}! ${rankLoss}-SPOT COLLAPSE!`,
          `${name} IS FALLING APART OUT THERE!`,
        ]),
        facts,
      });
    } else if (rankLoss === 2) {
      candidates.push({
        eventType: "rank_slip",
        playerId: entry.player_id,
        priority: 70,
        message: pickPhrase(`${seed}:slip`, [
          `${name} SLIPPED TWO SPOTS — TROUBLE!`,
          `TWO-SPOT DROP FOR ${name}!`,
        ]),
        facts,
      });
    }

    if (rankGain >= 3) {
      candidates.push({
        eventType: "rank_surge",
        playerId: entry.player_id,
        priority: 82 + Math.min(rankGain, 5),
        message: pickPhrase(`${seed}:surge`, [
          `${name} SURGED ${rankGain} SPOTS! INCREDIBLE!`,
          `WHAT A RUN! ${name} CLIMBED ${rankGain} POSITIONS!`,
          `${name} IS CHARGING — UP ${rankGain} SPOTS!`,
        ]),
        facts,
      });
    } else if (rankGain === 2) {
      candidates.push({
        eventType: "rank_surge",
        playerId: entry.player_id,
        priority: 68,
        message: pickPhrase(`${seed}:gain2`, [
          `${name} MOVED UP TWO — COMEBACK ALERT!`,
          `TWO-SPOT GAIN FOR ${name}!`,
        ]),
        facts,
      });
    }

    if (entry.last_delta > 2.6 && rankGain < 2) {
      candidates.push({
        eventType: "big_lap",
        playerId: entry.player_id,
        priority: 60,
        message: pickPhrase(`${seed}:lap`, [
          `${name} WITH A MONSTER LAP — +${entry.last_delta.toFixed(1)}%!`,
          `BIG LAP FROM ${name}! GROUND GAINED!`,
        ]),
        facts,
      });
    }

    if (entry.event_note?.includes("STALL") || entry.last_delta < 0.15) {
      if (entry.current_rank <= 4) {
        candidates.push({
          eventType: "stall",
          playerId: entry.player_id,
          priority: 56,
          message: pickPhrase(`${seed}:stall`, [
            `${name} STALLED IN THE TOP FOUR!`,
            `WALL HIT! ${name} BARELY MOVED!`,
          ]),
          facts,
        });
      }
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
        message: pickPhrase(`${seed}:underdog`, [
          `WINLESS ${name} SHOCKS THE FIELD — P${entry.current_rank}!`,
          `${name} HAS ZERO WINS AND IS IN THE HUNT!`,
          `UNDERDOG ALERT! ${name} UP TO P${entry.current_rank}!`,
        ]),
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
        message: `${name} ON A ROOKIE RUN — NOW P${entry.current_rank}!`,
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
        message: pickPhrase(`${raceId}:${tickNumber}:tight`, [
          `${name} CLINGING TO THE LEAD — PRESSURE BUILDING!`,
          `CAN ${name} HOLD ON UP FRONT?!`,
        ]),
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
          message: pickPhrase(`${raceId}:${tickNumber}:close`, [
            `${chaserName} CLOSING ON ${leaderName} — ONLY ${gap.toFixed(1)}% BACK!`,
            `IT'S TIGHT! ${chaserName} HUNTING THE LEAD!`,
            `FINAL STRETCH DRAMA — ${chaserName} IS RIGHT THERE!`,
          ]),
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
  const leaderPct = Math.round(Number(leader.progress));

  return {
    eventType: "status_pulse",
    playerId: leader.player_id,
    priority: 55,
    message: `RACE ${raceNumber} AT ${percentComplete}% — ${leaderName} LEADS (${leaderPct}%) · ${lastName} LAST`,
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
      playerId: "",
      priority: 85,
      message: `RACE ${raceNumber} IS LIVE — 8 RACERS ON THE GRID`,
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
      message: `${winner} WINS RACE ${raceNumber}! CHECKERED FLAG!`,
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
      message: `${last} FINISHES LAST — SENT TO HOLDING!`,
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
