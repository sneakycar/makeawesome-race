import type { RaceIconId } from "@/app/components/flat-icons";

/** Hide lead / comeback / last bar marks during this window after race start. */
export const EARLY_RACE_MARK_MS = 2 * 60 * 60 * 1000;

export interface RaceBarMarkEntry {
  playerId: string;
  rank: number;
  rankDelta: number;
  isInjured: boolean;
  isFighting: boolean;
}

export function isEarlyRaceWindow(
  startedAt: Date,
  now: Date = new Date()
): boolean {
  const elapsed = now.getTime() - startedAt.getTime();
  return elapsed >= 0 && elapsed < EARLY_RACE_MARK_MS;
}

/** Assign lead / last / comeback icons to distinct eligible racers. */
export function computeRaceBarMarks(
  entries: RaceBarMarkEntry[],
  options: { earlyRace: boolean }
): Map<string, RaceIconId> {
  const marks = new Map<string, RaceIconId>();

  if (options.earlyRace) return marks;

  const eligible = entries.filter((e) => !e.isInjured && !e.isFighting);

  if (eligible.length === 0) return marks;

  const byRank = [...eligible].sort((a, b) => a.rank - b.rank);
  const leader = byRank[0];
  const last = byRank[byRank.length - 1];

  marks.set(leader.playerId, "lead");

  if (last.playerId !== leader.playerId) {
    marks.set(last.playerId, "last");
  }

  const middle = byRank.filter(
    (e) => e.playerId !== leader.playerId && e.playerId !== last.playerId
  );

  if (middle.length === 0) return marks;

  const naturalComeback = middle.find((e) => e.rankDelta >= 2);
  if (naturalComeback) {
    marks.set(naturalComeback.playerId, "comeback");
  }

  return marks;
}
