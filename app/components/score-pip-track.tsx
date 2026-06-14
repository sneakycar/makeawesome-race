"use client";

import { FlatIcon, type RaceIconId } from "@/app/components/flat-icons";
import {
  formatLiveRaceScore,
  getScoreTrackFillGradient,
  HARD_SCORE_CAP,
  roundRaceScore,
} from "@/lib/score";

export function ScorePipTrack({
  score,
  animatingDelta,
  leaderScore,
  isLeader,
  isNight,
  statusOverlay,
}: {
  score: number;
  animatingDelta: number;
  leaderScore: number;
  isLeader: boolean;
  isNight: boolean;
  statusOverlay?: { icon: RaceIconId; label: string };
  playerId?: string;
  raceId?: string;
  recentDeltas?: number[];
}) {
  const livePoints = roundRaceScore(Math.max(0, Math.min(HARD_SCORE_CAP, score)));
  const leader = roundRaceScore(Math.max(0, leaderScore));
  const behind = roundRaceScore(leader - livePoints);
  const fillPercent = Math.min(100, (livePoints / HARD_SCORE_CAP) * 100);
  const showOutline =
    fillPercent > 0 &&
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

  return (
    <div
      className={`score-pip-viewport${
        statusOverlay ? " score-pip-viewport-paused" : ""
      }${isNight ? " is-night" : ""}`}
      aria-label={
        statusOverlay
          ? `${statusOverlay.label} — ${formatLiveRaceScore(livePoints)} points`
          : isLeader
            ? `${formatLiveRaceScore(livePoints)} points, race leader`
            : `${formatLiveRaceScore(livePoints)} points, ${formatLiveRaceScore(behind)} behind leader`
      }
      title={
        statusOverlay
          ? `${statusOverlay.label} — ${formatLiveRaceScore(livePoints)} pts`
          : isLeader
            ? `${formatLiveRaceScore(livePoints)} points`
            : `${formatLiveRaceScore(livePoints)} pts · ${formatLiveRaceScore(behind)} behind lead`
      }
    >
      <div
        className={`score-pip-track score-pip-track--race${
          statusOverlay ? " score-pip-track-paused" : ""
        }`}
      >
        <div
          className="score-pip-fill"
          style={{
            width: `${fillPercent}%`,
            background: getScoreTrackFillGradient(livePoints, isNight),
          }}
          aria-hidden="true"
        />
        {showOutline && (
          <div
            className={`score-pip-track-outline${outlineClass}`}
            style={{ width: `${fillPercent}%` }}
            aria-hidden="true"
          />
        )}
        {statusOverlay && (
          <div
            className="row-scoreboard-overlay"
            style={{ width: `${fillPercent}%` }}
            aria-hidden="true"
          >
            <FlatIcon id={statusOverlay.icon} className="race-emoji race-emoji-overlay" />
            <span className="row-scoreboard-overlay-label">{statusOverlay.label}</span>
          </div>
        )}
      </div>
      <span className="row-score-pip-num">{formatLiveRaceScore(livePoints)}</span>
      {animatingDelta !== 0 && (
        <span
          className={`row-score-pip-delta${
            animatingDelta < 0 ? " row-score-pip-delta-loss" : ""
          }`}
          aria-hidden="true"
        >
          {animatingDelta > 0 ? "+" : ""}
          {formatLiveRaceScore(animatingDelta)}
        </span>
      )}
    </div>
  );
}
