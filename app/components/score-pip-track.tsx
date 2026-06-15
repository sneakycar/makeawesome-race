"use client";

import { FlatIcon, type RaceIconId } from "@/app/components/flat-icons";
import {
  formatRaceScore,
  getScorePipBackground,
  HARD_SCORE_CAP,
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
  confirmedScore?: number;
  recentDeltas?: number[];
  segmentProgress?: number;
  minScore?: number;
}) {
  const slots = SCORE_TRACK_SLOTS;
  const livePoints = Math.max(0, Math.min(HARD_SCORE_CAP, score));
  const pipBright = Math.floor(livePoints);
  const pipPartial = livePoints - pipBright;
  const displayPoints = Math.round(livePoints);
  const leader = Math.max(0, Math.round(leaderScore));
  const behind = leader - displayPoints;
  const colorSpan = slots;

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
      {animatingDelta !== 0 && Math.round(Math.abs(animatingDelta)) > 0 && (
        <span
          className={`row-score-pip-delta${
            animatingDelta < 0 ? " row-score-pip-delta-loss" : ""
          }`}
          aria-hidden="true"
        >
          {animatingDelta > 0 ? "+" : ""}
          {formatRaceScore(animatingDelta)}
        </span>
      )}
    </div>
  );
}
