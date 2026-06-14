export function hashStringToNumber(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed: string): number {
  const h = hashStringToNumber(seed);
  const x = Math.sin(h) * 10000;
  return x - Math.floor(x);
}

export function seededRange(seed: string, min: number, max: number): number {
  const r = seededRandom(seed);
  return min + r * (max - min);
}

export function seededInt(seed: string, min: number, max: number): number {
  return Math.floor(seededRange(seed, min, max + 1));
}

export function seededPick<T>(seed: string, array: T[]): T {
  if (array.length === 0) {
    throw new Error("seededPick: empty array");
  }
  const idx = seededInt(seed, 0, array.length - 1);
  return array[idx];
}

export function seededBool(seed: string, probability: number): boolean {
  return seededRandom(seed) < probability;
}
