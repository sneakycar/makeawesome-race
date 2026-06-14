"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FlatIcon } from "@/app/components/flat-icons";
import {
  formatCurrentRaceLabel,
  formatRacerName,
  formatStreak,
  ordinal,
  pipCount20,
} from "@/lib/format";
import {
  formatTraitsDisplay,
  getArchetypeExplainer,
  getSignatureStatExplainer,
  getTraitExplainerLines,
} from "@/lib/identity";
import { formatOvrRank } from "@/lib/ovr";
import { getPlayerHeaderStyle, getPlayerPalette } from "@/lib/player-colors";
import { formatRaceScore, getScorePipBackground } from "@/lib/score";
import type { PlayerProfileResponse } from "@/lib/types";

function RacerAbilityRow({
  label,
  value,
  signature,
  isNight,
}: {
  label: string;
  value: number;
  signature?: boolean;
  isNight: boolean;
}) {
  const slots = 20;
  const filled = pipCount20(value);

  return (
    <div className={`racer-ability-row${signature ? " is-signature" : ""}`}>
      <div className="racer-ability-head">
        <span className="racer-ability-label">{label.toLowerCase()}</span>
        {signature ? (
          <FlatIcon id="star" className="race-emoji race-emoji-star" aria-hidden="true" />
        ) : null}
      </div>
      <div className="racer-ability-bar">
        <div
          className={`score-pip-track racer-ability-pips${isNight ? " is-night" : ""}`}
          aria-label={`${label} ${value} out of 100${signature ? ", signature ability" : ""}`}
        >
          {Array.from({ length: slots }, (_, i) =>
            i < filled ? (
              <span
                key={i}
                className="score-pip score-pip-on"
                style={{
                  background: getScorePipBackground(i, slots, isNight),
                }}
                aria-hidden="true"
              />
            ) : (
              <span key={i} className="score-pip score-pip-dim" aria-hidden="true" />
            )
          )}
        </div>
        <span className="racer-ability-num">{value}</span>
      </div>
    </div>
  );
}

function RacerField({
  label,
  value,
  wide,
  note,
}: {
  label: string;
  value: ReactNode;
  wide?: boolean;
  note?: ReactNode;
}) {
  return (
    <div className={`racer-field${wide ? " racer-field-wide" : ""}`}>
      <span className="racer-field-k">{label}</span>
      <span className="racer-field-v">{value}</span>
      {note ? <div className="racer-field-note">{note}</div> : null}
    </div>
  );
}

export function PlayerCardOverlay({
  slug,
  liveScore,
  liveRank,
  animatingDelta = 0,
  lane,
  isFighting = false,
  isInjured = false,
  isLeader = false,
  ovrInfo,
  isNight,
  onClose,
}: {
  slug: string;
  liveScore?: number;
  liveRank?: number;
  animatingDelta?: number;
  leaderScore?: number;
  lane?: number;
  isFighting?: boolean;
  isInjured?: boolean;
  isLeader?: boolean;
  ovrInfo?: { ovr: number; rank: number; total: number };
  isNight: boolean;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<PlayerProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/player/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          if (data.error) setError(data.error);
          else setProfile(data);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load player");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "x" || e.key === "X") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const p = profile?.player;
  const ovr = ovrInfo?.ovr ?? profile?.ovr;
  const ovrRank = ovrInfo?.rank ?? profile?.ovrRank;
  const ovrTotal = ovrInfo?.total ?? profile?.ovrTotal;
  const rank = liveRank ?? profile?.currentRank ?? null;
  const scorePoints =
    liveScore ??
    (profile?.currentScore != null ? Math.round(Number(profile.currentScore)) : null);
  const scoreDisplay = scorePoints != null ? formatRaceScore(scorePoints) : null;
  const statusClass =
    p?.status === "active"
      ? "racer-card-status racer-card-status--active"
      : p?.status === "injured"
        ? "racer-card-status racer-card-status--injured"
        : "racer-card-status";

  return (
    <div
      className="overlay overlay--racer"
      data-theme={isNight ? "night" : "day"}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={p ? "racer-card-name" : undefined}
    >
      <div className="racer-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="racer-card-close" onClick={onClose} aria-label="Close">
          close
        </button>

        {error && <p className="racer-card-message racer-card-message--error">{error}</p>}
        {!profile && !error && <p className="racer-card-message">loading...</p>}

        {p && (
          <>
            <header
              className="racer-card-header"
              style={getPlayerHeaderStyle(getPlayerPalette(p))}
            >
              <span className="racer-card-kicker">
                racer file{lane != null ? ` · lane ${lane}` : ""}
              </span>
              <div className="racer-card-head-row">
                <h2 id="racer-card-name" className="racer-card-name">
                  {formatRacerName(p.name)}
                </h2>
                {ovr != null && ovrRank != null && ovrTotal != null && (
                  <span className="racer-card-ovr">
                    <span className="racer-card-ovr-num">{ovr}</span>
                    <span className="racer-card-ovr-label">ovr</span>
                    <span className="racer-card-ovr-rank">
                      {formatOvrRank({ ovr, rank: ovrRank, total: ovrTotal })}
                    </span>
                  </span>
                )}
              </div>
              <div className="racer-card-head-meta">
                {p.archetype && p.archetype !== "UNKNOWN" && (
                  <span className="racer-card-archetype">{p.archetype.toLowerCase()}</span>
                )}
                <span className={statusClass}>{p.status}</span>
              </div>
            </header>

            <div className="racer-card-body">
              <section className="racer-card-panel">
                <h3 className="racer-card-panel-title">status</h3>
                <div className="racer-card-grid">
                  {isFighting && (
                    <RacerField
                      wide
                      label="race status"
                      value={
                        <span className="racer-inline-icon">
                          <FlatIcon id="fight" className="race-emoji race-emoji-inline" />
                          fighting
                        </span>
                      }
                    />
                  )}
                  {(isInjured || profile.raceInjury?.is_injured) && (
                    <>
                      <RacerField
                        wide
                        label="race status"
                        value={
                          <span className="racer-inline-icon">
                            <FlatIcon id="injured" className="race-emoji race-emoji-inline" />
                            injured
                          </span>
                        }
                      />
                      {profile.raceInjury?.injury_name && (
                        <RacerField wide label="injury" value={profile.raceInjury.injury_name} />
                      )}
                    </>
                  )}
                  {isLeader && !isFighting && !isInjured && (
                    <RacerField
                      wide
                      label="race status"
                      value={
                        <span className="racer-inline-icon">
                          <FlatIcon id="lead" className="race-emoji race-emoji-inline" />
                          leading
                        </span>
                      }
                    />
                  )}
                  {p.status === "injured" && (
                    <>
                      <RacerField wide label="status" value="injured" />
                      {p.current_injury_name && (
                        <RacerField wide label="injury" value={p.current_injury_name} />
                      )}
                      <RacerField
                        label="out"
                        value={`${p.injury_races_remaining} races remaining`}
                      />
                      <RacerField label="return" value="holding" />
                    </>
                  )}
                  <RacerField label="age" value={`${p.age_days} days`} />
                  {profile.currentRaceNumber != null && (
                    <RacerField
                      label="race"
                      value={formatCurrentRaceLabel(profile.currentRaceNumber, rank)}
                    />
                  )}
                  {rank != null && profile.currentRaceNumber != null && (
                    <RacerField label="place" value={ordinal(rank).toLowerCase()} />
                  )}
                  {scoreDisplay != null && (
                    <RacerField
                      wide
                      label="score"
                      value={
                        <>
                          {scoreDisplay}
                          {animatingDelta !== 0 && (
                            <span
                              className={`racer-score-delta${
                                animatingDelta < 0 ? " racer-score-delta-loss" : ""
                              }`}
                            >
                              {animatingDelta > 0 ? "+" : ""}
                              {formatRaceScore(animatingDelta)}
                            </span>
                          )}
                        </>
                      }
                    />
                  )}
                </div>
              </section>

              <section className="racer-card-panel">
                <h3 className="racer-card-panel-title">identity</h3>
                <div className="racer-card-grid">
                  <RacerField
                    wide
                    label="archetype"
                    value={p.archetype ?? "unknown"}
                    note={getArchetypeExplainer(p.archetype)}
                  />
                  <RacerField
                    wide
                    label="traits"
                    value={formatTraitsDisplay(p.traits ?? [])}
                    note={getTraitExplainerLines(p.traits ?? []).map((line, i) => (
                      <span key={`${p.traits?.[i] ?? i}-${line}`}>{line}</span>
                    ))}
                  />
                  <RacerField
                    wide
                    label="signature"
                    value={(p.signature_stat ?? "grit").toLowerCase()}
                    note={getSignatureStatExplainer(p.signature_stat)}
                  />
                </div>
              </section>

              <section className="racer-card-panel">
                <h3 className="racer-card-panel-title">stats</h3>
                <div className="racer-card-grid">
                  <RacerField
                    label="high race"
                    value={formatRaceScore(p.highest_race_score ?? 0)}
                  />
                  <RacerField
                    label="high career"
                    value={formatRaceScore(p.highest_career_score ?? 0)}
                  />
                  <RacerField
                    label="comeback"
                    value={p.biggest_comeback > 0 ? `+${p.biggest_comeback} spots` : "—"}
                  />
                </div>
              </section>

              <section className="racer-card-panel">
                <h3 className="racer-card-panel-title">abilities</h3>
                <RacerAbilityRow
                  label="GRIT"
                  value={p.grit}
                  signature={p.signature_stat === "grit"}
                  isNight={isNight}
                />
                <RacerAbilityRow
                  label="CHAOS"
                  value={p.chaos}
                  signature={p.signature_stat === "chaos"}
                  isNight={isNight}
                />
                <RacerAbilityRow
                  label="NERVE"
                  value={p.nerve}
                  signature={p.signature_stat === "nerve"}
                  isNight={isNight}
                />
                <RacerAbilityRow
                  label="LUCK"
                  value={p.luck}
                  signature={p.signature_stat === "luck"}
                  isNight={isNight}
                />
                <RacerAbilityRow
                  label="BURST"
                  value={p.burst}
                  signature={p.signature_stat === "burst"}
                  isNight={isNight}
                />
                <RacerAbilityRow
                  label="DRAG"
                  value={p.drag}
                  signature={p.signature_stat === "drag"}
                  isNight={isNight}
                />
              </section>

              <section className="racer-card-panel">
                <h3 className="racer-card-panel-title">career</h3>
                <div className="racer-card-grid racer-card-grid--career">
                  <RacerField label="races" value={p.races} />
                  <RacerField label="wins" value={p.wins} />
                  <RacerField label="outs" value={p.eliminations} />
                  <RacerField label="returns" value={p.returns} />
                  <RacerField
                    label="best"
                    value={p.best_finish != null ? ordinal(p.best_finish) : "—"}
                  />
                  <RacerField
                    label="worst"
                    value={p.worst_finish != null ? ordinal(p.worst_finish) : "—"}
                  />
                  <RacerField
                    label="streak"
                    value={formatStreak(p.current_streak_type, p.current_streak_count)}
                  />
                  <RacerField label="win stk" value={p.longest_win_streak} />
                  <RacerField label="holding" value={`${p.total_holding_days}d`} />
                  <RacerField label="support" value={p.total_support_received ?? 0} />
                </div>
              </section>

              <section className="racer-card-panel">
                <h3 className="racer-card-panel-title">game log</h3>
                <div className="racer-card-log">
                  {profile.history.length === 0 ? (
                    <p className="racer-card-log-empty">no entries yet</p>
                  ) : (
                    profile.history.map((h) => (
                      <p key={h.id} className="racer-card-log-line">
                        day {h.day_number} · {h.event_text}
                      </p>
                    ))
                  )}
                </div>
              </section>
            </div>

            <p className="racer-card-footer">press x or tap outside to close</p>
          </>
        )}
      </div>
    </div>
  );
}
