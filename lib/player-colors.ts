import type { CSSProperties } from "react";
import { seededInt } from "./seeded-rng";
import type { Player } from "./types";

export const MIN_PALETTE_COLORS = 2;
export const MAX_PALETTE_COLORS = 4;

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

/** Seeded 2–4 color palette unique to each racer. */
export function generatePlayerPalette(seed: string): string[] {
  const count = seededInt(`${seed}:palette:n`, MIN_PALETTE_COLORS, MAX_PALETTE_COLORS);
  const baseHue = seededInt(`${seed}:palette:h0`, 0, 359);
  const colors: string[] = [];

  for (let i = 0; i < count; i++) {
    const hue =
      (baseHue + seededInt(`${seed}:palette:h${i}`, 18, 96) * (i + 1)) % 360;
    const sat = seededInt(`${seed}:palette:s${i}`, 42, 94);
    const lit = seededInt(`${seed}:palette:l${i}`, 24, 58);
    colors.push(hslToHex(hue, sat, lit));
  }

  return colors;
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
