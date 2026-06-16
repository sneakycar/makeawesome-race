"use client";

import { useMemo } from "react";
import { FlatIcon, type RaceIconId } from "@/app/components/flat-icons";
import {
  getPipFillState,
  getRollingTickAnimationState,
} from "@/lib/hybrid-live-score";
import { formatRankDelta } from "@/lib/use-live-rank-delta";
import {
  formatRaceScore,
  getScorePipBackground,
  HARD_SCORE_CAP,
  SCORE_TRACK_SLOTS,
} from "@/lib/score";

const SCORE_PIP_STEP_PX = 3;

export function ScorePipTrack({
  confirmedScore,
  lastDelta = 0,
  segmentProgress = 1,
  animatingDelta,
  leaderScore,
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
  isLeader: boolean;
  isNight: boolean;
  statusOverlay?: { icon: RaceIconId; label: string };
  playerId?: string;
  raceId?: string;
  /** @deprecated use confirmedScore + lastDelta + segmentProgress */
  score?: number;
  recentDeltas?: number[];
  minScore?: number;
}) {
  const slots = SCORE_TRACK_SLOTS;
  const confirmed = Math.max(
    0,
    Math.min(HARD_SCORE_CAP, confirmedScore)
  );
  const delta = Number(lastDelta ?? 0);
  const deltas = Math.abs(delta) > 0.001 ? [delta] : [];
  const seg = Math.max(0, Math.min(1, segmentProgress));

  const rolling = useMemo(
    () => getRollingTickAnimationState(confirmed, deltas, seg),
    [confirmed, delta, seg]
  );
  const fill = useMemo(
    () => getPipFillState(confirmed, deltas, seg),
    [confirmed, delta, seg]
  );

  const displayPoints = Math.round(confirmed);
  const leader = Math.max(0, Math.round(leaderScore));
  const behind = leader - displayPoints;
  const colorSpan = slots;
  const hardenedBright = Math.floor(rolling.hardenedScore);
  const animatingBright = Math.ceil(rolling.score);
  const isSegmentAnimating = deltas.length > 0 && seg < 1;
  const deltaBadge =
    animatingDelta !== undefined && animatingDelta !== 0
      ? animatingDelta
      : rolling.animatingDelta;
  const showDelta = Math.round(Math.abs(deltaBadge)) > 0;
  const deltaLabel = formatRankDelta(Math.round(deltaBadge));
  // Tick delta badge: green ▲ / red ▼ — do not replace with +/- text.

  const litPips =
    fill.bright + (fill.partialIndex >= 0 && fill.partial > 0.001 ? 1 : 0);
  const outlineWidthPx = Math.max(litPips > 0 ? 4 : 0, litPips * SCORE_PIP_STEP_PX - 1);
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
            style={{ width: `${outlineWidthPx}px`, maxWidth: "100%" }}
            aria-hidden="true"
          />
        )}
        {statusOverlay && (
          <div
            className="row-scoreboard-overlay"
            style={{
              width: `${outlineWidthPx}px`,
              maxWidth: "100%",
            }}
            aria-hidden="true"
          >
            <FlatIcon id={statusOverlay.icon} className="race-emoji race-emoji-overlay" />
            <span className="row-scoreboard-overlay-label">{statusOverlay.label}</span>
          </div>
        )}
      </div>
      <span className="row-score-pip-num">{formatRaceScore(displayPoints)}</span>
      <span
        className={`row-score-pip-delta${
          deltaBadge < 0 ? " row-score-pip-delta-loss" : " row-score-pip-delta-up"
        }${!showDelta ? " row-score-pip-delta-empty" : ""}`}
        aria-hidden={!showDelta}
      >
        {showDelta && deltaLabel}
      </span>
    </div>
  );
}
