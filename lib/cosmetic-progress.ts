import { useEffect, useRef, useState } from "react";

function hashSeed(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function formatCosmeticPercent(value: number): string {
  const clamped = Math.max(0, Math.min(100, value));
  return clamped.toFixed(2);
}

/** Client-only display value — never sent to the server or used in logic. */
export function useCosmeticProgress(
  basePercent: number,
  seed: string,
  active: boolean
): string {
  const initialHundredths = hashSeed(seed) % 100;

  const [display, setDisplay] = useState(
    () => basePercent + initialHundredths / 100
  );
  const baseRef = useRef(basePercent);

  useEffect(() => {
    if (baseRef.current !== basePercent) {
      baseRef.current = basePercent;
      const hundredths = hashSeed(`${seed}:${basePercent}`) % 100;
      setDisplay(basePercent + hundredths / 100);
    }
  }, [basePercent, seed]);

  useEffect(() => {
    if (!active) {
      setDisplay(basePercent);
      return;
    }

    if (basePercent >= 100) {
      setDisplay(100);
      return;
    }

    const intervalMs = 3500 + (hashSeed(`${seed}:interval`) % 4000);
    const startDelay = hashSeed(`${seed}:delay`) % 2500;

    let intervalId: ReturnType<typeof setInterval> | undefined;

    const timeoutId = setTimeout(() => {
      intervalId = setInterval(() => {
        setDisplay((prev) => {
          const base = baseRef.current;
          const cap = base >= 99 ? 99.99 : base + 0.99;
          const next = Math.round((prev + 0.01) * 100) / 100;
          if (next > cap) return cap;
          return next;
        });
      }, intervalMs);
    }, startDelay);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [active, basePercent, seed]);

  return formatCosmeticPercent(display);
}
