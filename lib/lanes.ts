import { seededBool, seededInt } from "./seeded-rng";

export const LANE_COUNT = 8;

/** Best lane numbers in order — assigned to highest-OVR racers first. */
export const LANE_QUALITY_ORDER = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export interface LaneProfile {
  lane: number;
  label: string;
  /** Multiplicative tick bonus (e.g. 0.028 → +2.8% per tick). */
  bonus: number;
}

export const LANE_PROFILES: LaneProfile[] = [
  { lane: 1, label: "POLE", bonus: 0.028 },
  { lane: 2, label: "INSIDE", bonus: 0.022 },
  { lane: 3, label: "RAIL", bonus: 0.014 },
  { lane: 4, label: "FAST", bonus: 0.008 },
  { lane: 5, label: "MID", bonus: 0 },
  { lane: 6, label: "WIDE", bonus: -0.006 },
  { lane: 7, label: "OUTSIDE", bonus: -0.01 },
  { lane: 8, label: "SPOON", bonus: -0.016 },
];

const profileByLane = new Map(LANE_PROFILES.map((p) => [p.lane, p]));

export function getLaneProfile(lane: number): LaneProfile {
  return profileByLane.get(lane) ?? LANE_PROFILES[4];
}

export function getLanePerformanceMultiplier(lane: number): number {
  return 1 + getLaneProfile(lane).bonus;
}

export function formatLaneBonus(lane: number): string {
  const bonus = getLaneProfile(lane).bonus;
  if (bonus === 0) return "NEUTRAL";
  const pct = Math.round(Math.abs(bonus) * 1000) / 10;
  return bonus > 0 ? `+${pct}%` : `-${pct}%`;
}

/**
 * Assign lanes by OVR — best racers get the best lanes, with light seeded jitter.
 */
export function assignLanesBySkill(
  players: Array<{ id: string; ovr: number }>,
  dayNumber: number,
  raceNumber: number
): Map<string, number> {
  const sorted = [...players].sort(
    (a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id)
  );

  const laneOrder = [...LANE_QUALITY_ORDER];

  for (let swap = 0; swap < 2; swap++) {
    if (seededBool(`${dayNumber}:${raceNumber}:lane-jitter:${swap}`, 0.32)) {
      const i = seededInt(`${dayNumber}:${raceNumber}:lane-jitter-i:${swap}`, 0, LANE_COUNT - 2);
      [laneOrder[i], laneOrder[i + 1]] = [laneOrder[i + 1], laneOrder[i]];
    }
  }

  const result = new Map<string, number>();
  sorted.forEach((player, index) => {
    result.set(player.id, laneOrder[index] ?? LANE_COUNT);
  });

  return result;
}
