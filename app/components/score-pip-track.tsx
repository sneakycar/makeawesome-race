"use client";

import { FlatIcon, type RaceIconId } from "@/app/components/flat-icons";
import {
  formatLiveRaceScore,
  getScorePipBackground,
  HARD_SCORE_CAP,
  roundRaceScore,
  SCORE_TRACK_SLOTS,
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
  const slots = SCORE_TRACK_SLOTS;
  const livePoints = roundRaceScore(Math.max(0, Math.min(HARD_SCORE_CAP, score)));
  const pipBright = Math.floor(livePoints);
  const pipPartial = livePoints - pipBright;
  const leader = roundRaceScore(Math.max(0, leaderScore));
  const behind = roundRaceScore(leader - livePoints);
  const colorSpan = slots;

  const fillPercent = Math.min(100, (livePoints / slots) * 100);
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
        {Array.from({ length: slots }, (_, i) => {
          if (i < pipBright) {
            return (
              <span
                key={i}
                className="score-pip score-pip-on"
                style={{
                  background: getScorePipBackground(i, colorSpan, isNight),
                }}
                aria-hidden="true"
              />
            );
          }
          if (i === pipBright && pipPartial > 0.001) {
            return (
              <span
                key={i}
                className="score-pip score-pip-on score-pip-partial"
                style={{
                  background: getScorePipBackground(i, colorSpan, isNight),
                  opacity: Math.max(0.15, pipPartial),
                }}
                aria-hidden="true"
              />
            );
          }
          return (
            <span key={i} className="score-pip score-pip-empty" aria-hidden="true" />
          );
        })}
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
