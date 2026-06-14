"use client";

import { useMemo } from "react";
import { FlatIcon, type RaceIconId } from "@/app/components/flat-icons";
import {
  getPipFillState,
  getRollingTickAnimationState,
  normalizeRecentDeltas,
} from "@/lib/hybrid-live-score";
import {
  formatRaceScore,
  getScorePipBackground,
  HARD_SCORE_CAP,
  SCORE_TRACK_SLOTS,
} from "@/lib/score";

export function ScorePipTrack({
  score,
  confirmedScore,
  recentDeltas,
  segmentProgress = 1,
  animatingDelta,
  leaderScore,
  isLeader,
  isNight,
  statusOverlay,
}: {
  score: number;
  confirmedScore?: number;
  recentDeltas?: number[];
  segmentProgress?: number;
  animatingDelta: number;
  leaderScore: number;
  isLeader: boolean;
  isNight: boolean;
  statusOverlay?: { icon: RaceIconId; label: string };
  playerId?: string;
  raceId?: string;
}) {
  const slots = SCORE_TRACK_SLOTS;
  const confirmed = Math.max(0, Math.min(HARD_SCORE_CAP, confirmedScore ?? score));
  const deltas = useMemo(
    () => normalizeRecentDeltas(recentDeltas),
    [recentDeltas?.join(",")]
  );
  const seg = Math.max(0, Math.min(1, segmentProgress));

  const rolling = useMemo(
    () => getRollingTickAnimationState(confirmed, deltas, seg),
    [confirmed, deltas, seg]
  );
  const fill = useMemo(
    () => getPipFillState(confirmed, deltas, seg),
    [confirmed, deltas, seg]
  );

  const livePoints = Math.max(0, Math.min(HARD_SCORE_CAP, rolling.score));
  const displayPoints = Math.round(livePoints);
  const leader = Math.max(0, Math.round(leaderScore));
  const behind = leader - displayPoints;
  const colorSpan = slots;
  const hardenedBright = Math.floor(rolling.hardenedScore);
  const animatingBright = Math.ceil(livePoints);
  const isSegmentAnimating = deltas.length > 0 && seg < 1;
  const deltaBadge = animatingDelta !== 0 ? animatingDelta : rolling.animatingDelta;

  const isSegmentPip = (index: number, lit: boolean) =>
    lit && isSegmentAnimating && index >= hardenedBright && index <= animatingBright;

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
          isLeader ? " score-pip-track-leader" : ""
        }${
          statusOverlay?.icon === "fight" ? " score-pip-track-fight" : ""
        }${
          statusOverlay?.icon === "injured" ? " score-pip-track-injured" : ""
        }`}
        style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}
      >
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
        {statusOverlay && (
          <div className="row-scoreboard-overlay" aria-hidden="true">
            <FlatIcon id={statusOverlay.icon} className="race-emoji race-emoji-overlay" />
            <span className="row-scoreboard-overlay-label">{statusOverlay.label}</span>
          </div>
        )}
      </div>
      <span className="row-score-pip-num">{formatRaceScore(displayPoints)}</span>
      <span
        className={`row-score-pip-delta${
          deltaBadge < 0 ? " row-score-pip-delta-loss" : ""
        }${deltaBadge === 0 ? " row-score-pip-delta-empty" : ""}`}
        aria-hidden={deltaBadge === 0}
      >
        {deltaBadge !== 0 && (
          <>
            {deltaBadge > 0 ? "+" : ""}
            {formatRaceScore(deltaBadge)}
          </>
        )}
      </span>
    </div>
  );
}
