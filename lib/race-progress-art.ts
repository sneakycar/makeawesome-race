import type { CSSProperties } from "react";

/** Hard-step palette: DOS blue → Tecmo turf → Madden red zone. */
export const RACE_PROGRESS_BITMAP_STOPS_DAY = [
  "#004488",
  "#005599",
  "#0077aa",
  "#009988",
  "#00aa66",
  "#44bb44",
  "#88cc22",
  "#bbcc00",
  "#dd9900",
  "#ff7700",
  "#ff5500",
  "#ff3300",
] as const;

export const RACE_PROGRESS_BITMAP_STOPS_NIGHT = [
  "#112255",
  "#223388",
  "#2244aa",
  "#226688",
  "#228855",
  "#449944",
  "#668833",
  "#998822",
  "#bb7722",
  "#cc5522",
  "#dd3322",
  "#ee2222",
] as const;

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

export function getRaceProgressBitmapStyle(isNight: boolean): CSSProperties {
  const stops = isNight ? RACE_PROGRESS_BITMAP_STOPS_NIGHT : RACE_PROGRESS_BITMAP_STOPS_DAY;
  return {
    backgroundImage: [
      "repeating-conic-gradient(from 0deg, rgba(0,0,0,0.2) 0deg 90deg, transparent 90deg 180deg, rgba(0,0,0,0.2) 180deg 270deg, transparent 270deg 360deg)",
      "repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 2px)",
      "repeating-linear-gradient(90deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 3px)",
      bitmapGradient(stops),
    ].join(", "),
    backgroundSize: "2px 2px, 100% 100%, 4px 100%, 100% 100%",
  };
}

export function getRaceProgressFillStyle(percent: number): CSSProperties {
  const clamped = Math.max(0.001, Math.min(100, percent));
  return {
    width: `${clamped}%`,
    ["--fill-pct" as string]: clamped,
  };
}
