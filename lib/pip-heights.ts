import { seededRange } from "./seeded-rng";
import { RACE_PIP_TICKS, SCORE_TRACK_SLOTS } from "./score";

const SLOTS_PER_TICK = SCORE_TRACK_SLOTS / RACE_PIP_TICKS;
const SMOOTH_WINDOW = 7;
/** Typical tick gain — used to bias trailing bands hot/cold. */
const BASELINE_DELTA = 3.2;

function smooth(values: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      sum += values[j];
      count++;
    }
    return sum / count;
  });
}

/** Per-slot quality 0–1: tick bands cluster, recent deltas lift or drop the tail. */
export function buildPipQualityProfile(
  playerId: string,
  raceId: string,
  slotCount = SCORE_TRACK_SLOTS,
  filledCount = 0,
  recentDeltas: number[] = []
): number[] {
  const tickCount = Math.ceil(slotCount / SLOTS_PER_TICK);
  const qualities: number[] = [];

  for (let tick = 0; tick < tickCount; tick++) {
    const tickQuality = seededRange(`${raceId}:${playerId}:tickq:${tick}`, 0.22, 0.78);
    for (let j = 0; j < SLOTS_PER_TICK && qualities.length < slotCount; j++) {
      const jitter = seededRange(`${raceId}:${playerId}:pq:${tick}:${j}`, -0.08, 0.08);
      qualities.push(Math.max(0, Math.min(1, tickQuality + jitter)));
    }
  }

  if (filledCount > 0 && recentDeltas.length > 0) {
    const band = Math.max(2, Math.round(SLOTS_PER_TICK));
    let end = filledCount;
    for (let i = recentDeltas.length - 1; i >= 0 && end > 0; i--) {
      const start = Math.max(0, end - band);
      const bias = Math.max(
        -0.32,
        Math.min(0.38, (Number(recentDeltas[i]) - BASELINE_DELTA) / (BASELINE_DELTA * 2.2))
      );
      for (let slot = start; slot < end; slot++) {
        qualities[slot] = Math.max(0, Math.min(1, qualities[slot] + bias));
      }
      end = start;
    }
  }

  return smooth(qualities, SMOOTH_WINDOW);
}

/** Height units per slot: 1 = short, 2 = tall (performance cluster). */
export function buildPipHeightUnits(
  playerId: string,
  raceId: string,
  slotCount = SCORE_TRACK_SLOTS,
  filledCount = 0,
  recentDeltas: number[] = []
): number[] {
  const qualities = buildPipQualityProfile(
    playerId,
    raceId,
    slotCount,
    filledCount,
    recentDeltas
  );
  return qualities.map((q) => (q >= 0.5 ? 2 : 1));
}
