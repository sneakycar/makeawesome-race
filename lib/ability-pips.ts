import type { SignatureStat } from "./identity";

type AbilityPalette = {
  fill: string;
  highlight: string;
  shadow: string;
};

const ABILITY_PALETTES: Record<SignatureStat, AbilityPalette> = {
  grit: { fill: "#e84000", highlight: "#ffaa44", shadow: "#882000" },
  chaos: { fill: "#c018ff", highlight: "#ff77ff", shadow: "#5a0088" },
  nerve: { fill: "#00b8d4", highlight: "#66ffff", shadow: "#006878" },
  luck: { fill: "#00cc44", highlight: "#88ff88", shadow: "#006622" },
  burst: { fill: "#ffcc00", highlight: "#ffff66", shadow: "#997700" },
  drag: { fill: "#667788", highlight: "#99aabb", shadow: "#334455" },
};

const SIGNATURE_PALETTE: AbilityPalette = {
  fill: "#ff9900",
  highlight: "#ffd700",
  shadow: "#994400",
};

/** Chunky 8-bit fill color — steps brighter toward the right edge of the bar. */
export function getAbilityPipFill(
  stat: string,
  index: number,
  slots: number,
  signature = false
): string {
  const key = (stat.toLowerCase() as SignatureStat) in ABILITY_PALETTES
    ? (stat.toLowerCase() as SignatureStat)
    : "grit";
  const palette = signature ? SIGNATURE_PALETTE : ABILITY_PALETTES[key];
  const t = slots <= 1 ? 1 : index / (slots - 1);
  if (t >= 0.72) return palette.highlight;
  if (t >= 0.38) return palette.fill;
  return palette.shadow;
}

export function abilityStatKey(label: string): SignatureStat {
  const key = label.toLowerCase() as SignatureStat;
  return key in ABILITY_PALETTES ? key : "grit";
}
