import type { CSSProperties } from "react";
import { seededInt } from "./seeded-rng";
import type { Player } from "./types";

export const MIN_PALETTE_COLORS = 2;
export const MAX_PALETTE_COLORS = 4;

/** Max hue spread for primary-family stripes — keeps cards off the rainbow. */
const PRIMARY_HUE_SPREAD = 34;

type TeamScheme = "monochrome" | "analogous" | "primary-accent";

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function wrapHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

function pickTeamScheme(seed: string): TeamScheme {
  const roll = seededInt(`${seed}:palette:scheme`, 0, 99);
  if (roll < 36) return "monochrome";
  if (roll < 86) return "analogous";
  return "primary-accent";
}

function lightnessTiers(count: number, seed: string, prefix: string): number[] {
  const presets: Record<number, number[]> = {
    2: [44, 28],
    3: [48, 34, 24],
    4: [50, 38, 30, 22],
  };
  const base = presets[count] ?? presets[4];
  return base.map((lit, i) => {
    const jitter = seededInt(`${seed}:palette:${prefix}l${i}`, -3, 3);
    return Math.max(18, Math.min(56, lit + jitter));
  });
}

function buildPrimaryHues(
  seed: string,
  baseHue: number,
  count: number,
  spread: number
): number[] {
  if (count === 1) {
    return [wrapHue(baseHue + seededInt(`${seed}:palette:j0`, -4, 4))];
  }
  return Array.from({ length: count }, (_, i) => {
    const t = (i / (count - 1)) * 2 - 1;
    const jitter = seededInt(`${seed}:palette:j${i}`, -4, 4);
    return wrapHue(baseHue + t * spread + jitter);
  });
}

/** Seeded 2–4 color palette — team-style tiers, not rainbow. */
export function generatePlayerPalette(seed: string): string[] {
  const count = seededInt(`${seed}:palette:n`, MIN_PALETTE_COLORS, MAX_PALETTE_COLORS);
  const baseHue = seededInt(`${seed}:palette:h0`, 0, 359);
  const scheme = pickTeamScheme(seed);
  const lits = lightnessTiers(count, seed, scheme === "primary-accent" ? "a" : "p");

  let hues: number[] = [];
  let accentIndex = -1;

  if (scheme === "monochrome") {
    hues = buildPrimaryHues(seed, baseHue, count, seededInt(`${seed}:palette:spread`, 0, 8));
  } else if (scheme === "analogous") {
    const spread = seededInt(`${seed}:palette:spread`, 14, PRIMARY_HUE_SPREAD);
    hues = buildPrimaryHues(seed, baseHue, count, spread);
  } else {
    accentIndex = seededInt(`${seed}:palette:accent-i`, count - 1, count - 1);
    const primaryCount = count - 1;
    const primarySpread = seededInt(`${seed}:palette:pspread`, 10, 22);
    const primaryHues = buildPrimaryHues(seed, baseHue, primaryCount, primarySpread);
    const accentOffset = seededInt(`${seed}:palette:accent`, 155, 205);
    const accentHue = wrapHue(baseHue + accentOffset);

    hues = [];
    let pi = 0;
    for (let i = 0; i < count; i++) {
      if (i === accentIndex) {
        hues.push(accentHue);
      } else {
        hues.push(primaryHues[pi]!);
        pi += 1;
      }
    }
  }

  const colors = hues.map((hue, i) => {
    const isAccent = i === accentIndex;
    const sat = isAccent
      ? seededInt(`${seed}:palette:s${i}`, 58, 90)
      : seededInt(`${seed}:palette:s${i}`, 48, 88);
    return hslToHex(hue, sat, lits[i]!);
  });

  // Light → dark left-to-right reads like jersey stripes.
  return colors
    .map((color, i) => ({ color, lit: lits[i]! }))
    .sort((a, b) => b.lit - a.lit)
    .map((entry) => entry.color);
}

export function normalizePlayerPalette(colors: string[] | null | undefined): string[] {
  const cleaned = (colors ?? [])
    .filter((c) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c))
    .slice(0, MAX_PALETTE_COLORS);

  if (cleaned.length >= MIN_PALETTE_COLORS) return cleaned;
  return generatePlayerPalette("fallback-palette");
}

export function getPlayerPalette(
  player: Pick<Player, "seed" | "palette_colors">
): string[] {
  const stored = player.palette_colors ?? [];
  if (stored.length >= MIN_PALETTE_COLORS) {
    return normalizePlayerPalette(stored);
  }
  return generatePlayerPalette(player.seed);
}

function bitmapGradient(stops: readonly string[]): string {
  const n = stops.length;
  const bands = stops
    .map((color, i) => {
      const start = ((i / n) * 100).toFixed(2);
      const end = (((i + 1) / n) * 100).toFixed(2);
      return `${color} ${start}%, ${color} ${end}%`;
    })
    .join(", ");
  return `linear-gradient(90deg, ${bands})`;
}

/** Pixel-step header fill from a player's palette. */
export function getPlayerHeaderStyle(colors: string[]): CSSProperties {
  const palette = normalizePlayerPalette(colors);
  const edge = palette[palette.length - 1];

  return {
    backgroundColor: palette[0],
    backgroundImage: [
      "repeating-conic-gradient(from 0deg, rgba(0,0,0,0.14) 0deg 90deg, transparent 90deg 180deg, rgba(0,0,0,0.14) 180deg 270deg, transparent 270deg 360deg)",
      "repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 2px, transparent 2px, transparent 4px)",
      bitmapGradient(palette),
    ].join(", "),
    backgroundSize: "2px 2px, 100% 100%, 100% 100%",
    borderBottomColor: edge,
    boxShadow: `inset 0 -4px 0 ${edge}`,
  };
}
