import { seededRange } from "./seeded-rng";
import { RACE_PIP_TICKS, SCORE_TRACK_SLOTS } from "./score";

const SLOTS_PER_TICK = SCORE_TRACK_SLOTS / RACE_PIP_TICKS;
const SMOOTH_WINDOW = 2;
/** Typical tick gain — dramatic bumps only well above this. */
const BASELINE_DELTA = 3.2;
/** Quality at or above this maps to the +1px tall pip. */
const TALL_THRESHOLD = 0.84;
/** Minimum tick delta to lift a band at all. */
const DRAMATIC_DELTA = 7.5;

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

/** Per-slot quality 0–1: nearly flat; only huge recent deltas lift a band. */
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
    for (let j = 0; j < SLOTS_PER_TICK && qualities.length < slotCount; j++) {
      const jitter = seededRange(`${raceId}:${playerId}:pq:${tick}:${j}`, -0.012, 0.012);
      qualities.push(Math.max(0, Math.min(1, 0.5 + jitter)));
    }
  }

  if (filledCount > 0 && recentDeltas.length > 0) {
    const band = Math.max(2, Math.round(SLOTS_PER_TICK));
    let end = filledCount;
    for (let i = recentDeltas.length - 1; i >= 0 && end > 0; i--) {
      const delta = Number(recentDeltas[i]);
      if (delta < DRAMATIC_DELTA) {
        end = Math.max(0, end - band);
        continue;
      }

      const start = Math.max(0, end - band);
      const bias = Math.min(
        0.42,
        0.2 + (delta - DRAMATIC_DELTA) / (BASELINE_DELTA * 4)
      );
      for (let slot = start; slot < end; slot++) {
        qualities[slot] = Math.max(0, Math.min(1, qualities[slot] + bias));
      }
      end = start;
    }
  }

  return smooth(qualities, SMOOTH_WINDOW);
}

/** Height units per slot: 1 = baseline, 2 = +1px bump (rare, dramatic only). */
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
  return qualities.map((q) => (q >= TALL_THRESHOLD ? 2 : 1));
}
