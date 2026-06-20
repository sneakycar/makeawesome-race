"use client";

import { useMemo } from "react";
import { FlatIcon, type RaceIconId } from "@/app/components/flat-icons";
import {
  getPipFillState,
  getRollingTickAnimationState,
} from "@/lib/hybrid-live-score";
import {
  formatRaceScore,
  getRelativePipFill,
  getScorePipBackground,
  HARD_SCORE_CAP,
  SCORE_PIP_SLOTS,
  SCORE_TRACK_SLOTS,
} from "@/lib/score";

export function ScorePipTrack({
  confirmedScore,
  lastDelta = 0,
  segmentProgress = 1,
  animatingDelta,
  leaderScore,
  minScore,
  isLeader,
  isNight,
  statusOverlay,
}: {
  /** Cron-confirmed score after the latest tick. */
  confirmedScore: number;
  /** Points gained/lost on the most recent tick only. */
  lastDelta?: number;
  /** 0–1 progress through the current 15m segment since last tick. */
  segmentProgress?: number;
  animatingDelta?: number;
  leaderScore: number;
  /** Field floor for relative bar scaling (race standings). */
  minScore?: number;
  isLeader: boolean;
  isNight: boolean;
  statusOverlay?: { icon: RaceIconId; label: string };
  playerId?: string;
  raceId?: string;
  /** @deprecated use confirmedScore + lastDelta + segmentProgress */
  score?: number;
  recentDeltas?: number[];
}) {
  const useRelativeScale =
    minScore != null && Math.round(leaderScore) > Math.round(minScore);
  const slots = useRelativeScale ? SCORE_PIP_SLOTS : SCORE_TRACK_SLOTS;
  const confirmed = Math.max(0, Math.min(HARD_SCORE_CAP, confirmedScore));
  const delta = Number(lastDelta ?? 0);
  const deltas = Math.abs(delta) > 0.001 ? [delta] : [];
  const seg = Math.max(0, Math.min(1, segmentProgress));

  const rolling = useMemo(
    () => getRollingTickAnimationState(confirmed, deltas, seg),
    [confirmed, delta, seg]
  );

  const isSegmentAnimating = deltas.length > 0 && seg < 1;

  const fill = useMemo(() => {
    if (useRelativeScale) {
      return getRelativePipFill(
        rolling.score,
        minScore!,
        leaderScore,
        slots
      );
    }
    return getPipFillState(confirmed, deltas, seg);
  }, [
    useRelativeScale,
    rolling.score,
    minScore,
    leaderScore,
    slots,
    confirmed,
    deltas,
    seg,
  ]);

  const hardenedFill = useMemo(() => {
    if (!useRelativeScale || !isSegmentAnimating) return null;
    return getRelativePipFill(
      rolling.hardenedScore,
      minScore!,
      leaderScore,
      slots
    );
  }, [
    useRelativeScale,
    isSegmentAnimating,
    rolling.hardenedScore,
    minScore,
    leaderScore,
    slots,
  ]);

  const displayPoints = Math.round(confirmed);
  const leader = Math.max(0, Math.round(leaderScore));
  const behind = leader - displayPoints;
  const colorSpan = slots;
  const hardenedBright = useRelativeScale
    ? (hardenedFill?.bright ?? fill.bright)
    : Math.floor(rolling.hardenedScore);
  const animatingBright = useRelativeScale
    ? fill.bright
    : Math.ceil(rolling.score);

  const litPips =
    fill.bright + (fill.partialIndex >= 0 && fill.partial > 0.001 ? 1 : 0);
  const outlineWidthPct =
    slots > 0 ? Math.min(100, (litPips / slots) * 100) : 0;
  const showOutline =
    litPips > 0 &&
    (isLeader ||
      statusOverlay?.icon === "fight" ||
      statusOverlay?.icon === "injured");
  const outlineClass = isLeader
    ? " score-pip-track-outline-leader"
    : statusOverlay?.icon === "fight"
      ? " score-pip-track-outline-fight"
      : statusOverlay?.icon === "injured"
        ? " score-pip-track-outline-injured"
        : "";

  const isSegmentPip = (index: number, lit: boolean) =>
    lit &&
    isSegmentAnimating &&
    index >= hardenedBright &&
    index <= animatingBright;

  return (
    <div
      className={`score-pip-viewport${
        statusOverlay ? " score-pip-viewport-paused" : ""
      }${isNight ? " is-night" : ""}`}
      aria-label={
        statusOverlay
          ? `${statusOverlay.label} — ${displayPoints} points`
          : isLeader
            ? `${displayPoints} points, race leader`
            : `${displayPoints} points, ${behind} behind leader`
      }
      title={
        statusOverlay
          ? `${statusOverlay.label} — ${displayPoints} pts`
          : isLeader
            ? `${displayPoints} points`
            : `${displayPoints} pts · ${behind} behind lead`
      }
    >
      <div
        className={`score-pip-track score-pip-track--race${
          statusOverlay ? " score-pip-track-paused" : ""
        }`}
      >
        <div className="score-pip-track-inner">
          {Array.from({ length: slots }, (_, i) => {
            if (i < fill.bright) {
              return (
                <span
                  key={i}
                  className={`score-pip score-pip-on${
                    isSegmentPip(i, true) ? " score-pip-segment" : ""
                  }`}
                  style={{
                    background: getScorePipBackground(i, colorSpan, isNight),
                  }}
                  aria-hidden="true"
                />
              );
            }
            if (i === fill.partialIndex && fill.partial > 0.001) {
              return (
                <span
                  key={i}
                  className={`score-pip score-pip-on score-pip-partial${
                    isSegmentPip(i, true) ? " score-pip-segment" : ""
                  }`}
                  style={{
                    background: getScorePipBackground(i, colorSpan, isNight),
                    opacity: Math.max(0.15, fill.partial),
                  }}
                  aria-hidden="true"
                />
              );
            }
            return <span key={i} className="score-pip score-pip-dim" aria-hidden="true" />;
          })}
        </div>
        {showOutline && (
          <div
            className={`score-pip-track-outline${outlineClass}`}
            style={{ width: `${outlineWidthPct}%` }}
            aria-hidden="true"
          />
        )}
        {statusOverlay && (
          <div
            className="row-scoreboard-overlay"
            style={{
              width: `${outlineWidthPct}%`,
            }}
            aria-hidden="true"
          >
            <FlatIcon id={statusOverlay.icon} className="race-emoji race-emoji-overlay" />
            <span className="row-scoreboard-overlay-label">{statusOverlay.label}</span>
          </div>
        )}
      </div>
      <span className="row-score-pip-num">{formatRaceScore(displayPoints)}</span>
    </div>
  );
}
