import { seededInt } from "./seeded-rng";
import type { Player } from "./types";

export interface TickerEntrySnapshot {
  player_id: string;
  player: Player;
  current_rank: number;
  progress: number;
  last_delta: number;
  event_note: string | null;
}

function tickerName(name: string): string {
  const lower = name.toLowerCase().trim();
  if (lower.length <= 14) return lower;
  return lower.split(" ").slice(0, 2).join(" ");
}

function pickPhrase(seed: string, options: string[]): string {
  return options[seededInt(seed, 0, options.length - 1)];
}

interface ScoredEvent {
  priority: number;
  message: string;
  playerId: string;
}

export function generateTickTickerEvents(
  before: TickerEntrySnapshot[],
  after: TickerEntrySnapshot[],
  percentComplete: number,
  raceId: string,
  tickNumber: number
): string[] {
  const beforeById = new Map(before.map((e) => [e.player_id, e]));
  const afterSorted = [...after].sort((a, b) => a.current_rank - b.current_rank);
  const beforeSorted = [...before].sort((a, b) => a.current_rank - b.current_rank);

  const oldLeader = beforeSorted[0];
  const newLeader = afterSorted[0];
  const candidates: ScoredEvent[] = [];

  if (oldLeader && newLeader && oldLeader.player_id !== newLeader.player_id) {
    const name = tickerName(newLeader.player.name);
    const msg = pickPhrase(`${raceId}:${tickNumber}:lead`, [
      `${name} took the lead`,
      `${name} seized the front`,
      `${name} is out front now`,
      `new leader: ${name}`,
    ]);
    candidates.push({ priority: 100, message: msg, playerId: newLeader.player_id });
  }

  for (const entry of after) {
    const prev = beforeById.get(entry.player_id);
    if (!prev) continue;

    const name = tickerName(entry.player.name);
    const rankGain = prev.current_rank - entry.current_rank;
    const rankLoss = entry.current_rank - prev.current_rank;
    const seed = `${raceId}:${entry.player_id}:${tickNumber}`;

    if (entry.event_note?.includes("CHAOS SURGE")) {
      candidates.push({
        priority: 92,
        message: pickPhrase(`${seed}:chaos`, [
          `${name} unleashed chaos`,
          `${name} went wild`,
          `${name} hit a chaos surge`,
        ]),
        playerId: entry.player_id,
      });
    }

    if (entry.event_note?.includes("COLLAPSE") || rankLoss >= 3) {
      candidates.push({
        priority: 88,
        message: pickPhrase(`${seed}:fade`, [
          `${name} is fading fast`,
          `${name} is falling apart`,
          `${name} is slipping away`,
        ]),
        playerId: entry.player_id,
      });
    } else if (rankLoss === 2) {
      candidates.push({
        priority: 72,
        message: pickPhrase(`${seed}:slip`, [
          `${name} dropped two spots`,
          `${name} lost ground`,
        ]),
        playerId: entry.player_id,
      });
    }

    if (rankGain >= 3) {
      candidates.push({
        priority: 80 + rankGain,
        message: pickPhrase(`${seed}:surge`, [
          `${name} surged ${rankGain} spots`,
          `${name} climbed fast`,
          `${name} is charging hard`,
        ]),
        playerId: entry.player_id,
      });
    } else if (rankGain === 2) {
      candidates.push({
        priority: 68,
        message: `${name} moved up two spots`,
        playerId: entry.player_id,
      });
    }

    if (entry.last_delta > 2.6 && rankGain < 2) {
      candidates.push({
        priority: 58,
        message: pickPhrase(`${seed}:lap`, [
          `${name} put in a big lap`,
          `${name} gained serious ground`,
        ]),
        playerId: entry.player_id,
      });
    }

    if (entry.event_note?.includes("STALL") || entry.last_delta < 0.15) {
      if (entry.current_rank <= 4) {
        candidates.push({
          priority: 52,
          message: pickPhrase(`${seed}:stall`, [
            `${name} stalled out`,
            `${name} hit a wall`,
          ]),
          playerId: entry.player_id,
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
        priority: 76,
        message: pickPhrase(`${seed}:underdog`, [
          `${name} shocks the field`,
          `${name} is in contention`,
          `winless ${name} is lurking up front`,
        ]),
        playerId: entry.player_id,
      });
    }

    if (
      entry.player.rookie_until_day != null &&
      entry.current_rank <= 2 &&
      prev.current_rank > 4 &&
      percentComplete < 70
    ) {
      candidates.push({
        priority: 64,
        message: `${name} is making a rookie run`,
        playerId: entry.player_id,
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
      const name = tickerName(newLeader.player.name);
      candidates.push({
        priority: 62,
        message: pickPhrase(`${raceId}:${tickNumber}:tight`, [
          `${name} is holding on up front`,
          `${name} clings to the lead`,
        ]),
        playerId: newLeader.player_id,
      });
    }
  }

  if (percentComplete > 88) {
    const chaser = afterSorted[1];
    const leader = afterSorted[0];
    if (chaser && leader) {
      const gap = Number(leader.progress) - Number(chaser.progress);
      if (gap < 8 && gap > 0) {
        const chaserName = tickerName(chaser.player.name);
        candidates.push({
          priority: 86,
          message: pickPhrase(`${raceId}:${tickNumber}:close`, [
            `${chaserName} is closing in`,
            `it's tight behind the leader`,
            `${chaserName} is hunting the front`,
          ]),
          playerId: chaser.player_id,
        });
      }
    }
  }

  candidates.sort((a, b) => b.priority - a.priority);

  const usedPlayers = new Set<string>();
  const messages: string[] = [];

  for (const c of candidates) {
    if (messages.length >= 2) break;
    if (usedPlayers.has(c.playerId) && c.priority < 90) continue;
    usedPlayers.add(c.playerId);
    messages.push(c.message);
  }

  if (messages.length === 0 && tickNumber > 0 && percentComplete > 5) {
    const mid = afterSorted[Math.min(3, afterSorted.length - 1)];
    if (mid) {
      const name = tickerName(mid.player.name);
      messages.push(
        pickPhrase(`${raceId}:${tickNumber}:quiet`, [
          `${name} keeps grinding mid-pack`,
          `the field is holding steady`,
          `no major moves this tick`,
        ])
      );
    }
  }

  return messages;
}

export function generateFinalizeTickerEvents(
  winnerName: string,
  lastName: string,
  raceNumber: number
): string[] {
  const winner = tickerName(winnerName);
  const last = tickerName(lastName);
  return [
    `${winner} wins race ${raceNumber}`,
    `${last} sent to holding`,
  ];
}
