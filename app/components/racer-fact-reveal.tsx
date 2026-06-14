"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateRacerFact } from "@/lib/racer-facts";
import type { RaceEntryWithPlayer } from "@/lib/types";

const MAX_FACTS = 3;
const AUTO_DISMISS_MS = 7000;
const ENTER_MS = 180;
const EXIT_MS = 180;

const REVEAL_DELAYS_MS: [number, number][] = [
  [20_000, 60_000],
  [90_000, 180_000],
  [180_000, 360_000],
];

const RETRY_WHEN_BLOCKED_MS = 4000;

function sessionKey(raceId: string): string {
  return `racerFactsShown:${raceId}`;
}

function getShownCount(raceId: string): number {
  if (typeof window === "undefined") return MAX_FACTS;
  try {
    const raw = sessionStorage.getItem(sessionKey(raceId));
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? Math.min(n, MAX_FACTS) : 0;
  } catch {
    return 0;
  }
}

function setShownCount(raceId: string, count: number): void {
  try {
    sessionStorage.setItem(sessionKey(raceId), String(count));
  } catch {
    /* ignore */
  }
}

function randomDelayMs(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickEntry(entries: RaceEntryWithPlayer[]): RaceEntryWithPlayer {
  const healthy = entries.filter((e) => !e.is_injured);
  const pool = healthy.length > 0 ? healthy : entries;
  return pool[Math.floor(Math.random() * pool.length)];
}

type CardPhase = "hidden" | "entering" | "visible" | "exiting";

interface RacerFactRevealProps {
  activeEntries: RaceEntryWithPlayer[];
  raceId: string;
  dayNumber: number;
  raceActive: boolean;
  blocked: boolean;
}

export function RacerFactReveal({
  activeEntries,
  raceId,
  dayNumber,
  raceActive,
  blocked,
}: RacerFactRevealProps) {
  const [phase, setPhase] = useState<CardPhase>("hidden");
  const [title, setTitle] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [factText, setFactText] = useState("");
  const [typedFact, setTypedFact] = useState("");

  const shownCountRef = useRef(0);
  const scheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRevealRef = useRef(false);
  const pausedRemainingRef = useRef<number | null>(null);
  const scheduleStartedAtRef = useRef(0);
  const scheduleDelayRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const blockedRef = useRef(blocked);
  const entriesRef = useRef(activeEntries);
  const phaseRef = useRef<CardPhase>("hidden");
  const dismissRef = useRef<() => void>(() => {});
  const tryRevealRef = useRef<() => void>(() => {});

  blockedRef.current = blocked;
  entriesRef.current = activeEntries;
  phaseRef.current = phase;

  const clearCardTimers = useCallback(() => {
    for (const ref of [autoDismissRef, exitTimerRef, enterTimerRef]) {
      if (ref.current) {
        clearTimeout(ref.current);
        ref.current = null;
      }
    }
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
  }, []);

  const clearScheduleTimer = useCallback(() => {
    if (scheduleTimerRef.current) {
      clearTimeout(scheduleTimerRef.current);
      scheduleTimerRef.current = null;
    }
  }, []);

  const startTypewriter = useCallback((text: string) => {
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }

    if (reducedMotionRef.current || text.length === 0) {
      setTypedFact(text);
      return;
    }

    const totalMs = Math.min(900, Math.max(280, text.length * 18));
    const step = Math.max(1, Math.ceil(text.length / (totalMs / 24)));
    let idx = 0;
    setTypedFact("");

    typewriterRef.current = setInterval(() => {
      idx = Math.min(text.length, idx + step);
      setTypedFact(text.slice(0, idx));
      if (idx >= text.length && typewriterRef.current) {
        clearInterval(typewriterRef.current);
        typewriterRef.current = null;
      }
    }, 24);
  }, []);

  const scheduleNextReveal = useCallback(() => {
    clearScheduleTimer();

    if (shownCountRef.current >= MAX_FACTS) return;
    if (!raceActive || entriesRef.current.length === 0) return;

    const [min, max] = REVEAL_DELAYS_MS[shownCountRef.current];
    const delay = pausedRemainingRef.current ?? randomDelayMs(min, max);
    pausedRemainingRef.current = null;
    scheduleDelayRef.current = delay;
    scheduleStartedAtRef.current = Date.now();

    scheduleTimerRef.current = setTimeout(() => {
      scheduleTimerRef.current = null;
      pendingRevealRef.current = true;
      tryRevealRef.current();
    }, delay);
  }, [clearScheduleTimer, raceActive]);

  const tryReveal = useCallback(() => {
    const entries = entriesRef.current;
    if (entries.length === 0 || shownCountRef.current >= MAX_FACTS) {
      pendingRevealRef.current = false;
      return;
    }
    if (document.hidden || blockedRef.current) {
      pendingRevealRef.current = true;
      clearScheduleTimer();
      scheduleDelayRef.current = RETRY_WHEN_BLOCKED_MS;
      scheduleStartedAtRef.current = Date.now();
      scheduleTimerRef.current = setTimeout(() => {
        scheduleTimerRef.current = null;
        tryRevealRef.current();
      }, RETRY_WHEN_BLOCKED_MS);
      return;
    }

    pendingRevealRef.current = false;
    const entry = pickEntry(entries);
    const factIndex = shownCountRef.current;
    const seed = `${raceId}:${entry.player_id}:${dayNumber}:${factIndex}`;
    const generated = generateRacerFact(entry.player, entry, seed);

    shownCountRef.current += 1;
    setShownCount(raceId, shownCountRef.current);

    setTitle(generated.title);
    setPlayerName(generated.playerName);
    setFactText(generated.fact);
    setTypedFact("");
    setPhase("entering");

    enterTimerRef.current = setTimeout(() => {
      setPhase("visible");
      startTypewriter(generated.fact);
      autoDismissRef.current = setTimeout(() => dismissRef.current(), AUTO_DISMISS_MS);
    }, reducedMotionRef.current ? 0 : ENTER_MS);
  }, [raceId, dayNumber, clearScheduleTimer, startTypewriter]);

  tryRevealRef.current = tryReveal;

  const dismiss = useCallback(() => {
    if (phaseRef.current === "hidden" || phaseRef.current === "exiting") return;

    clearCardTimers();
    setPhase("exiting");

    exitTimerRef.current = setTimeout(() => {
      setPhase("hidden");
      setTitle("");
      setPlayerName("");
      setFactText("");
      setTypedFact("");
      if (shownCountRef.current < MAX_FACTS) {
        scheduleNextReveal();
      }
    }, reducedMotionRef.current ? 0 : EXIT_MS);
  }, [clearCardTimers, scheduleNextReveal]);

  dismissRef.current = dismiss;

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }, []);

  useEffect(() => {
    shownCountRef.current = getShownCount(raceId);
    clearScheduleTimer();
    clearCardTimers();
    pendingRevealRef.current = false;
    pausedRemainingRef.current = null;
    setPhase("hidden");

    if (!raceActive || entriesRef.current.length === 0) return;
    if (shownCountRef.current >= MAX_FACTS) return;

    scheduleNextReveal();

    return () => {
      clearScheduleTimer();
      clearCardTimers();
    };
  }, [
    raceId,
    raceActive,
    scheduleNextReveal,
    clearScheduleTimer,
    clearCardTimers,
  ]);

  useEffect(() => {
    if (!pendingRevealRef.current || blocked || document.hidden) return;
    if (phase !== "hidden") return;
    if (scheduleTimerRef.current) return;

    scheduleDelayRef.current = RETRY_WHEN_BLOCKED_MS;
    scheduleStartedAtRef.current = Date.now();
    scheduleTimerRef.current = setTimeout(() => {
      scheduleTimerRef.current = null;
      tryRevealRef.current();
    }, RETRY_WHEN_BLOCKED_MS);
  }, [blocked, phase]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (scheduleTimerRef.current) {
          const elapsed = Date.now() - scheduleStartedAtRef.current;
          pausedRemainingRef.current = Math.max(
            0,
            scheduleDelayRef.current - elapsed
          );
          clearScheduleTimer();
        }
        return;
      }

      if (
        pausedRemainingRef.current != null &&
        pausedRemainingRef.current > 0 &&
        phase === "hidden" &&
        !scheduleTimerRef.current &&
        shownCountRef.current < MAX_FACTS &&
        raceActive
      ) {
        scheduleNextReveal();
        return;
      }

      if (pendingRevealRef.current && phase === "hidden" && !scheduleTimerRef.current) {
        tryRevealRef.current();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [phase, raceActive, clearScheduleTimer, scheduleNextReveal]);

  useEffect(() => {
    if (phase === "hidden" || phase === "exiting") return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, dismiss]);

  if (phase === "hidden") return null;

  const visible = phase === "visible" || phase === "entering";
  const exiting = phase === "exiting";

  return (
    <button
      type="button"
      className={`factReveal${visible && !exiting ? " factRevealVisible" : ""}${
        exiting ? " factRevealExiting" : ""
      }`}
      onClick={dismiss}
      aria-live="polite"
    >
      <div className="factRevealTitle">{title}</div>
      <div className="factRevealName">{playerName}</div>
      <div className="factRevealText">{typedFact || factText}</div>
    </button>
  );
}
