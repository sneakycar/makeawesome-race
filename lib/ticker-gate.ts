import { isCompleteTickerMessage, pickGatedTickerPhrase } from "./ticker-phrases";
import type { TickerEntrySnapshot, TickerEventDraft, TickerEventType } from "./ticker-types";
import type { TickerEventFacts } from "./types";

/**
 * Ticker gate — every announcer call must match real tick data.
 *
 * | event_type      | data gate                                              |
 * |-----------------|--------------------------------------------------------|
 * | lead_change     | new P1, previous leader existed, rankBefore > 1        |
 * | chaos_surge     | event note CHAOS SURGE, lastDelta >= 3                 |
 * | collapse        | rankChange <= -3 (actual positions lost)               |
 * | score_collapse  | event note COLLAPSE, lastDelta <= -2, rank loss < 3    |
 * | rank_slip       | rankChange === -2                                      |
 * | rank_surge      | rankChange >= 2                                        |
 * | big_lap         | lastDelta >= 3, or HOT STRETCH + lastDelta >= 2        |
 * | stall           | STALL note + delta < 0.5, or P1–4 + delta < 0.15       |
 * | underdog        | 0 wins, now P1–3, was P4+                               |
 * | rookie_run      | rookie flag, now P1–2, was P5+, race < 70%              |
 * | lead_pressure   | still P1 late, lastDelta < 0.6                         |
 * | late_close      | final 12%, gap 1–7 pts to leader                       |
 *
 * Phrases with {loss}/{gain}/{delta}/{gap}/{rank} only air when those values are valid.
 */

function hasNote(note: string | null, token: string): boolean {
  return Boolean(note?.includes(token));
}

function onAirName(name: string): string {
  return name.toUpperCase().trim();
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

function draftCandidate(
  eventType: TickerEventType,
  playerId: string | null,
  priority: number,
  phraseSeed: string,
  phrases: readonly string[],
  vars: Record<string, string | number>,
  facts: TickerEventFacts
): TickerEventDraft | null {
  const message = pickGatedTickerPhrase(phraseSeed, phrases, vars);
  if (!message || !isCompleteTickerMessage(message)) return null;
  return { eventType, playerId, priority, message, facts };
}

/** Every announcer call must pass here before it can air. */
export function passesTickerGate(draft: TickerEventDraft): boolean {
  if (!isCompleteTickerMessage(draft.message)) return false;

  const facts = draft.facts;
  switch (draft.eventType) {
    case "lead_change":
      return (
        facts.rankAfter === 1 &&
        facts.rankBefore != null &&
        facts.rankBefore > 1 &&
        Boolean(facts.previousLeaderName)
      );
    case "chaos_surge":
      return hasNote(facts.eventNote ?? null, "CHAOS SURGE") && (facts.lastDelta ?? 0) >= 3;
    case "collapse":
      return (facts.rankChange ?? 0) <= -3;
    case "score_collapse":
      return hasNote(facts.eventNote ?? null, "COLLAPSE") && (facts.lastDelta ?? 0) <= -2;
    case "rank_slip":
      return facts.rankChange === -2;
    case "rank_surge":
      return (facts.rankChange ?? 0) >= 2;
    case "big_lap":
      return (facts.lastDelta ?? 0) >= 3 || hasNote(facts.eventNote ?? null, "HOT STRETCH");
    case "stall":
      return (facts.lastDelta ?? 0) < 0.5 || hasNote(facts.eventNote ?? null, "STALL");
    case "underdog":
      return (facts.rankAfter ?? 99) <= 3 && (facts.rankBefore ?? 99) > 3;
    case "rookie_run":
      return (facts.rankAfter ?? 99) <= 2 && (facts.rankBefore ?? 99) > 4;
    case "lead_pressure":
      return facts.rankAfter === 1 && (facts.lastDelta ?? 99) < 0.6;
    case "late_close":
      return facts.gapToLeader != null && facts.gapToLeader >= 1 && facts.gapToLeader < 8;
    case "fight":
      return Boolean(facts.playerName);
    case "race_start":
    case "race_won":
    case "eliminated":
    case "race_delay":
    case "race_resumed":
    case "status_pulse":
      return true;
    default:
      return false;
  }
}

export interface RaceTickContext {
  before: TickerEntrySnapshot[];
  after: TickerEntrySnapshot[];
  beforeById: Map<string, TickerEntrySnapshot>;
  afterSorted: TickerEntrySnapshot[];
  beforeSorted: TickerEntrySnapshot[];
  percentComplete: number;
  raceId: string;
  tickNumber: number;
}

export function buildRaceTickContext(
  before: TickerEntrySnapshot[],
  after: TickerEntrySnapshot[],
  percentComplete: number,
  raceId: string,
  tickNumber: number
): RaceTickContext {
  return {
    before,
    after,
    beforeById: new Map(before.map((e) => [e.player_id, e])),
    afterSorted: [...after].sort((a, b) => a.current_rank - b.current_rank),
    beforeSorted: [...before].sort((a, b) => a.current_rank - b.current_rank),
    percentComplete,
    raceId,
    tickNumber,
  };
}

export function collectGatedTickCandidates(ctx: RaceTickContext): TickerEventDraft[] {
  const candidates: TickerEventDraft[] = [];
  const { afterSorted, beforeSorted, beforeById, percentComplete, raceId, tickNumber } = ctx;

  const oldLeader = beforeSorted[0];
  const newLeader = afterSorted[0];

  if (oldLeader && newLeader && oldLeader.player_id !== newLeader.player_id) {
    const draft = draftCandidate(
      "lead_change",
      newLeader.player_id,
      100,
      `${raceId}:${tickNumber}:lead`,
      LEAD_CHANGE_PHRASES,
      { name: onAirName(newLeader.player.name), prev: onAirName(oldLeader.player.name) },
      {
        ...baseFacts(newLeader, tickNumber, percentComplete, oldLeader.current_rank),
        previousLeaderName: oldLeader.player.name,
      }
    );
    if (draft) candidates.push(draft);
  }

  for (const entry of ctx.after) {
    const prev = beforeById.get(entry.player_id);
    if (!prev) continue;

    const rankGain = prev.current_rank - entry.current_rank;
    const rankLoss = entry.current_rank - prev.current_rank;
    const delta = Number(entry.last_delta);
    const note = entry.event_note;
    const name = onAirName(entry.player.name);
    const seed = `${raceId}:${entry.player_id}:${tickNumber}`;
    const facts = baseFacts(entry, tickNumber, percentComplete, prev.current_rank);

    if (hasNote(note, "CHAOS SURGE") && delta >= 3) {
      const draft = draftCandidate(
        "chaos_surge",
        entry.player_id,
        94,
        `${seed}:chaos`,
        CHAOS_SURGE_PHRASES,
        { name },
        { ...facts, eventNote: "CHAOS SURGE" }
      );
      if (draft) candidates.push(draft);
    }

    if (rankLoss >= 3) {
      const draft = draftCandidate(
        "collapse",
        entry.player_id,
        90,
        `${seed}:rank-collapse`,
        COLLAPSE_PHRASES,
        { name, loss: rankLoss },
        facts
      );
      if (draft) candidates.push(draft);
    } else if (hasNote(note, "COLLAPSE") && delta <= -2) {
      const draft = draftCandidate(
        "score_collapse",
        entry.player_id,
        76,
        `${seed}:score-collapse`,
        SCORE_COLLAPSE_PHRASES,
        { name, delta: Math.max(1, Math.round(Math.abs(delta))) },
        { ...facts, eventNote: "COLLAPSE" }
      );
      if (draft) candidates.push(draft);
    } else if (rankLoss === 2) {
      const draft = draftCandidate(
        "rank_slip",
        entry.player_id,
        70,
        `${seed}:slip`,
        RANK_SLIP_PHRASES,
        { name },
        facts
      );
      if (draft) candidates.push(draft);
    }

    if (rankGain >= 3) {
      const draft = draftCandidate(
        "rank_surge",
        entry.player_id,
        82 + Math.min(rankGain, 5),
        `${seed}:surge`,
        RANK_SURGE_BIG_PHRASES,
        { name, gain: rankGain },
        facts
      );
      if (draft) candidates.push(draft);
    } else if (rankGain === 2) {
      const draft = draftCandidate(
        "rank_surge",
        entry.player_id,
        68,
        `${seed}:gain2`,
        RANK_SURGE_TWO_PHRASES,
        { name },
        facts
      );
      if (draft) candidates.push(draft);
    }

    if (delta >= 3 && rankGain < 2 && !hasNote(note, "HOT STRETCH")) {
      const draft = draftCandidate(
        "big_lap",
        entry.player_id,
        60,
        `${seed}:lap`,
        BIG_LAP_PHRASES,
        { name, delta: Math.round(delta) },
        facts
      );
      if (draft) candidates.push(draft);
    }

    if (hasNote(note, "HOT STRETCH") && delta >= 2) {
      const draft = draftCandidate(
        "big_lap",
        entry.player_id,
        70,
        `${seed}:hot`,
        HOT_STRETCH_PHRASES,
        { name },
        facts
      );
      if (draft) candidates.push(draft);
    }

    if (hasNote(note, "STALL") && delta < 0.5) {
      const draft = draftCandidate(
        "stall",
        entry.player_id,
        72,
        `${seed}:stall-long`,
        STALL_LONG_PHRASES,
        { name },
        facts
      );
      if (draft) candidates.push(draft);
    } else if (entry.current_rank <= 4 && delta < 0.15 && !hasNote(note, "STALL")) {
      const draft = draftCandidate(
        "stall",
        entry.player_id,
        56,
        `${seed}:stall-top`,
        STALL_TOP_PHRASES,
        { name, rank: entry.current_rank },
        facts
      );
      if (draft) candidates.push(draft);
    }

    if (hasNote(note, "RESTART") && delta >= 1.5) {
      const draft = draftCandidate(
        "rank_surge",
        entry.player_id,
        75,
        `${seed}:restart`,
        RESTART_PHRASES,
        { name },
        facts
      );
      if (draft) candidates.push(draft);
    }

    if (
      entry.player.wins === 0 &&
      entry.current_rank <= 3 &&
      prev.current_rank > 3 &&
      percentComplete > 40
    ) {
      const draft = draftCandidate(
        "underdog",
        entry.player_id,
        78,
        `${seed}:underdog`,
        UNDERDOG_PHRASES,
        { name, rank: entry.current_rank },
        facts
      );
      if (draft) candidates.push(draft);
    }

    if (
      entry.player.rookie_until_day != null &&
      entry.current_rank <= 2 &&
      prev.current_rank > 4 &&
      percentComplete < 70
    ) {
      const draft = draftCandidate(
        "rookie_run",
        entry.player_id,
        66,
        `${seed}:rookie`,
        ROOKIE_RUN_PHRASES,
        { name, rank: entry.current_rank },
        facts
      );
      if (draft) candidates.push(draft);
    }
  }

  if (percentComplete > 78 && newLeader && oldLeader) {
    const leaderAfter = ctx.after.find((e) => e.player_id === newLeader.player_id);
    const leaderBefore = beforeById.get(newLeader.player_id);
    if (
      leaderAfter &&
      leaderBefore &&
      leaderAfter.player_id === oldLeader.player_id &&
      leaderAfter.last_delta < 0.6
    ) {
      const draft = draftCandidate(
        "lead_pressure",
        newLeader.player_id,
        64,
        `${raceId}:${tickNumber}:tight`,
        LEAD_PRESSURE_PHRASES,
        { name: onAirName(newLeader.player.name) },
        baseFacts(leaderAfter, tickNumber, percentComplete, leaderBefore.current_rank)
      );
      if (draft) candidates.push(draft);
    }
  }

  if (percentComplete > 88) {
    const chaser = afterSorted[1];
    const leader = afterSorted[0];
    if (chaser && leader) {
      const gap = Number(leader.progress) - Number(chaser.progress);
      if (gap >= 1 && gap < 8) {
        const roundedGap = Math.round(gap);
        const draft = draftCandidate(
          "late_close",
          chaser.player_id,
          88,
          `${raceId}:${tickNumber}:close`,
          LATE_CLOSE_PHRASES,
          {
            chaser: onAirName(chaser.player.name),
            leader: onAirName(leader.player.name),
            gap: roundedGap,
          },
          {
            ...baseFacts(chaser, tickNumber, percentComplete, beforeById.get(chaser.player_id)?.current_rank),
            gapToLeader: Number(gap.toFixed(1)),
          }
        );
        if (draft) candidates.push(draft);
      }
    }
  }

  return candidates.filter(passesTickerGate);
}

import {
  BIG_LAP_PHRASES,
  CHAOS_SURGE_PHRASES,
  COLLAPSE_PHRASES,
  HOT_STRETCH_PHRASES,
  LATE_CLOSE_PHRASES,
  LEAD_CHANGE_PHRASES,
  LEAD_PRESSURE_PHRASES,
  RANK_SLIP_PHRASES,
  RANK_SURGE_BIG_PHRASES,
  RANK_SURGE_TWO_PHRASES,
  RESTART_PHRASES,
  ROOKIE_RUN_PHRASES,
  SCORE_COLLAPSE_PHRASES,
  STALL_LONG_PHRASES,
  STALL_TOP_PHRASES,
  UNDERDOG_PHRASES,
} from "./ticker-phrases";
