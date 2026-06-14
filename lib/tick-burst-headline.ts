import { formatRacerName, formatTickerForDisplay } from "./format";
import type { GameStateResponse, RaceEntryWithPlayer } from "./types";

export function didCronTickAdvance(
  prev: GameStateResponse,
  next: GameStateResponse
): boolean {
  const a = prev.gameState.last_tick_at;
  const b = next.gameState.last_tick_at;
  return Boolean(a && b && a !== b);
}

export function shouldPlayTickBurst(
  prev: GameStateResponse,
  next: GameStateResponse
): boolean {
  if (!didCronTickAdvance(prev, next)) return false;
  if (next.race.status !== "active") return false;
  if (next.raceDelay?.active) return false;
  return true;
}

function leader(entries: RaceEntryWithPlayer[]): RaceEntryWithPlayer {
  return [...entries].sort((a, b) => a.current_rank - b.current_rank)[0];
}

function formatBurstLine(text: string): string {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return "pack update!";
  if (/[!?.]$/.test(trimmed)) return trimmed;
  return `${trimmed}!`;
}

function deriveHeadline(
  prev: GameStateResponse,
  next: GameStateResponse
): string {
  const prevById = new Map(prev.entries.map((e) => [e.player_id, e]));
  const prevLeader = leader(prev.entries);
  const nextLeader = leader(next.entries);

  if (prevLeader.player_id !== nextLeader.player_id) {
    return formatBurstLine(
      `${formatRacerName(nextLeader.player.name)} took the lead`
    );
  }

  let bestGain = 0;
  let bestEntry: RaceEntryWithPlayer | null = null;
  for (const entry of next.entries) {
    const before = prevById.get(entry.player_id);
    if (!before) continue;
    const gain = before.current_rank - entry.current_rank;
    if (gain > bestGain) {
      bestGain = gain;
      bestEntry = entry;
    }
  }

  if (bestEntry && bestGain >= 3) {
    return formatBurstLine(
      `${formatRacerName(bestEntry.player.name)} rockets up ${bestGain} spots`
    );
  }
  if (bestEntry && bestGain === 2) {
    return formatBurstLine(
      `${formatRacerName(bestEntry.player.name)} surges two spots`
    );
  }
  if (bestEntry && bestGain === 1) {
    return formatBurstLine(
      `${formatRacerName(bestEntry.player.name)} moves up a spot`
    );
  }

  for (const entry of next.entries) {
    const before = prevById.get(entry.player_id);
    if (!before) continue;
    if (!before.is_fighting && entry.is_fighting) {
      return formatBurstLine(
        `${formatRacerName(entry.player.name)} is in a fight`
      );
    }
    if (!before.is_injured && entry.is_injured) {
      return formatBurstLine(
        `${formatRacerName(entry.player.name)} goes down injured`
      );
    }
    const delta = Number(entry.last_delta);
    if (delta >= 8) {
      return formatBurstLine(
        `${formatRacerName(entry.player.name)} rips a huge lap`
      );
    }
  }

  return formatBurstLine(
    `${formatRacerName(nextLeader.player.name)} still leads the pack`
  );
}

export function pickTickBurstHeadline(
  prev: GameStateResponse,
  next: GameStateResponse
): string {
  const prevIds = new Set(prev.ticker.map((e) => e.id));
  const fresh = next.ticker.find(
    (e) => !prevIds.has(e.id) && e.event_type !== "status_pulse"
  );
  if (fresh?.message) {
    return formatBurstLine(formatTickerForDisplay(fresh.message));
  }
  return deriveHeadline(prev, next);
}
