"use client";

import { useEffect, useRef } from "react";
import type { RaceWeatherState, RaceWeatherType } from "@/lib/race-weather";

interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
  opacity: number;
  drift: number;
}

interface Streak {
  x: number;
  y: number;
  len: number;
  speed: number;
  opacity: number;
}

function particleCount(type: RaceWeatherType, area: number): number {
  const density =
    type === "storm" ? 0.14 : type === "rain" ? 0.1 : type === "wind" ? 0.08 : 0;
  return Math.min(420, Math.max(48, Math.round(area * density)));
}

function seedDrops(count: number, w: number, h: number, spreadY = true): Drop[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: spreadY ? Math.random() * h : Math.random() * h * 0.5 - h * 0.25,
    len: 6 + Math.random() * 14,
    speed: 7 + Math.random() * 11,
    opacity: 0.15 + Math.random() * 0.45,
    drift: 0.4 + Math.random() * 1.2,
  }));
}

function seedStreaks(count: number, w: number, h: number): Streak[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w - w * 0.2,
    y: Math.random() * h,
    len: 18 + Math.random() * 36,
    speed: 4 + Math.random() * 9,
    opacity: 0.12 + Math.random() * 0.35,
  }));
}

function drawRain(
  ctx: CanvasRenderingContext2D,
  drops: Drop[],
  w: number,
  h: number,
  isNight: boolean,
  wind: number
) {
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = "round";
  for (const d of drops) {
    ctx.strokeStyle = isNight
      ? `rgba(190, 210, 255, ${d.opacity * 0.75})`
      : `rgba(90, 130, 170, ${d.opacity})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + wind, d.y + d.len);
    ctx.stroke();

    d.y += d.speed;
    d.x += d.drift + wind * 0.08;
    if (d.y > h + d.len) {
      d.y = -d.len - Math.random() * 40;
      d.x = Math.random() * w;
    }
    if (d.x > w + 20) d.x = -20;
  }
}

function drawWind(
  ctx: CanvasRenderingContext2D,
  streaks: Streak[],
  w: number,
  h: number,
  isNight: boolean
) {
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = "round";
  for (const s of streaks) {
    ctx.strokeStyle = isNight
      ? `rgba(210, 220, 230, ${s.opacity * 0.7})`
      : `rgba(120, 130, 140, ${s.opacity})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + s.len, s.y + (Math.sin(s.x * 0.04) * 1.5));
    ctx.stroke();

    s.x += s.speed;
    if (s.x > w + s.len) {
      s.x = -s.len - Math.random() * 60;
      s.y = Math.random() * h;
    }
  }
}

function WeatherCanvas({
  type,
  isNight,
}: {
  type: RaceWeatherType;
  isNight: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Drop[] | Streak[]>([]);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || type === "heat" || type === "fog") return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = particleCount(type === "storm" ? "storm" : type, w * h);
      particlesRef.current =
        type === "wind" ? seedStreaks(count, w, h) : seedDrops(count, w, h);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const wind = type === "storm" ? 2.4 : type === "rain" ? 1.1 : 0;

    const tick = () => {
      const w = canvas.parentElement?.clientWidth ?? 0;
      const h = canvas.parentElement?.clientHeight ?? 0;
      if (w && h) {
        if (type === "wind") {
          drawWind(ctx, particlesRef.current as Streak[], w, h, isNight);
        } else {
          drawRain(ctx, particlesRef.current as Drop[], w, h, isNight, wind);
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
  }, [type, isNight]);

  if (type === "heat" || type === "fog") return null;

  return <canvas ref={canvasRef} className="race-weather-canvas" aria-hidden="true" />;
}

const WEATHER_ICONS: Record<RaceWeatherType, string> = {
  rain: "🌧",
  wind: "💨",
  storm: "⛈",
  heat: "🌡",
  fog: "🌫",
};

export function RaceWeatherOverlay({
  weather,
  isNight,
}: {
  weather: RaceWeatherState;
  isNight: boolean;
}) {
  return (
    <div
      className={`race-weather race-weather--${weather.type}${isNight ? " is-night" : ""}`}
      style={{ opacity: weather.opacity }}
      aria-hidden="true"
    >
      <div className="race-weather-sky" />
      <WeatherCanvas type={weather.type} isNight={isNight} />
      {weather.type === "fog" && (
        <>
          <div className="race-weather-mist race-weather-mist-a" />
          <div className="race-weather-mist race-weather-mist-b" />
          <div className="race-weather-mist race-weather-mist-c" />
        </>
      )}
      {weather.type === "heat" && <div className="race-weather-heat-wave" />}
      {weather.type === "storm" && <div className="race-weather-lightning" />}
      <div className="race-weather-badge">
        <span className="race-weather-badge-icon">{WEATHER_ICONS[weather.type]}</span>
        <span>{weather.label}</span>
      </div>
    </div>
  );
}
