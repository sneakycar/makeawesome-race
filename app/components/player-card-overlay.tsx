"use client";

import { useEffect, useState } from "react";
import { FlatIcon, type RaceIconId } from "@/app/components/flat-icons";
import { ScorePipTrack } from "@/app/components/score-pip-track";
import {
  formatRacerName,
  formatStreak,
  ordinal,
  pipCount20,
} from "@/lib/format";
import {
  getArchetypeExplainer,
  getStatAbilityExplainer,
  getTraitExplainer,
} from "@/lib/identity";
import { formatOvrRank } from "@/lib/ovr";
import { getPlayerHeaderStyle, getPlayerPalette } from "@/lib/player-colors";
import { formatRankDelta } from "@/lib/use-live-rank-delta";
import { formatRaceScore, roundRaceScore } from "@/lib/score";
import { abilityStatKey, getAbilityPipFill } from "@/lib/ability-pips";
import { getBadMoneyFlavorLine } from "@/lib/bad-money";
import { formatPlayerGender } from "@/lib/player-gender";
import type { PlayerProfileResponse } from "@/lib/types";

function AbilityRow({
  label,
  value,
  description,
  signature,
  isNight,
}: {
  label: string;
  value: number;
  description: string;
  signature?: boolean;
  isNight: boolean;
}) {
  const slots = 20;
  const filled = pipCount20(value);
  const statKey = abilityStatKey(label);

  return (
    <div className={`player-sheet-ability${signature ? " player-sheet-ability-sig" : ""}`}>
      <div className="player-sheet-ability-head">
        <span className="player-sheet-ability-label">{label}</span>
        {signature ? (
          <FlatIcon id="star" className="race-emoji race-emoji-star" aria-hidden="true" />
        ) : null}
        <span className="player-sheet-ability-num">{value}</span>
      </div>
      <div
        className={`ability-pip-track ability-pip-track--${statKey}${signature ? " ability-pip-track--sig" : ""}${isNight ? " is-night" : ""}`}
        aria-label={`${label} ${value} out of 100${signature ? ", signature" : ""}`}
      >
        {Array.from({ length: slots }, (_, i) =>
          i < filled ? (
            <span
              key={i}
              className="ability-pip ability-pip-on"
              style={{ backgroundColor: getAbilityPipFill(statKey, i, slots, signature) }}
              aria-hidden="true"
            />
          ) : (
            <span key={i} className="ability-pip ability-pip-off" aria-hidden="true" />
          )
        )}
      </div>
      <p className="player-sheet-ability-desc">{description}</p>
    </div>
  );
}

function StatPanel({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string | number }>;
}) {
  return (
    <div className="live-odds player-sheet-panel">
      <div className="live-odds-title">{title}</div>
      <div className="live-odds-list">
        {rows.map((row) => (
          <div key={row.label} className="live-odds-row">
            <span className="live-odds-name">{row.label}</span>
            <span className="live-odds-american">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlayerCardOverlay({
  slug,
  liveScore,
  liveRank,
  animatingDelta = 0,
  leaderScore = 1,
  lastDelta = 0,
  rankDelta = 0,
  healthyEntryCount = 0,
  lane,
  isFighting = false,
  isInjured = false,
  barMark = null,
  ovrInfo,
  isNight,
  onClose,
  playerId,
  raceId,
  recentDeltas,
  confirmedScore,
  segmentProgress = 1,
}: {
  slug: string;
  liveScore?: number;
  liveRank?: number;
  animatingDelta?: number;
  leaderScore?: number;
  lastDelta?: number;
  rankDelta?: number;
  healthyEntryCount?: number;
  lane?: number;
  isFighting?: boolean;
  isInjured?: boolean;
  barMark?: RaceIconId | null;
  ovrInfo?: { ovr: number; rank: number; total: number };
  isNight: boolean;
  onClose: () => void;
  playerId?: string;
  raceId?: string;
  recentDeltas?: number[];
  confirmedScore?: number;
  segmentProgress?: number;
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
  const pipConfirmedScore =
    confirmedScore ??
    (profile?.currentScore != null
      ? roundRaceScore(Number(profile.currentScore))
      : 0);
  const rankDeltaLabel = formatRankDelta(rankDelta);
  const isLeader = barMark === "lead";
  const pipOverlay = isInjured
    ? { icon: "injured" as const, label: "INJURED" }
    : isFighting
      ? { icon: "fight" as const, label: "FIGHT" }
      : undefined;
  const traits = p?.traits ?? [];
  const signatureStat = (p?.signature_stat ?? "grit") as
    | "grit"
    | "chaos"
    | "nerve"
    | "luck"
    | "burst"
    | "drag";

  return (
    <div
      className="overlay player-sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={p ? "player-sheet-name" : undefined}
    >
      <div className="player-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="player-sheet-bar">
          <button type="button" className="stats-nav-link" onClick={onClose}>
            ← CLOSE
          </button>
        </div>

        {error && <p className="error">{error}</p>}
        {!profile && !error && <p className="loading">LOADING...</p>}

        {p && (
          <>
            <header
              className="retro-header retro-header--player-palette"
              style={getPlayerHeaderStyle(getPlayerPalette(p))}
            >
              <span className="retro-header-tag">RACER FILE</span>
              {ovr != null && ovrRank != null && ovrTotal != null && (
                <div className="retro-ovr">
                  <span className="retro-ovr-num">{ovr}</span>
                  <span className="retro-ovr-label">OVR</span>
                  <span className="retro-ovr-rank">
                    {formatOvrRank({ ovr, rank: ovrRank, total: ovrTotal })}
                  </span>
                </div>
              )}
              <h2 id="player-sheet-name" className="retro-name">
                {formatRacerName(p.name)}
              </h2>
              <span className="retro-header-badge">{p.status}</span>
            </header>

            <div className={`row-line${isLeader ? " row-line-leader" : ""}`}>
              <div className="row-head">
                {lane != null && <span className="row-archetype">L{lane}</span>}
                {profile.currentRaceNumber != null && (
                  <span className="row-live-badge">CURRENT RACE</span>
                )}
                {barMark ? (
                  <span className="row-mark-slot row-mark-slot-inline">
                    <FlatIcon id={barMark} className="race-emoji" />
                  </span>
                ) : null}
                {rankDeltaLabel && (
                  <span
                    className={`row-rank-delta${
                      rankDelta > 0 ? " row-rank-delta-up" : " row-rank-delta-down"
                    }`}
                  >
                    {rankDeltaLabel}
                  </span>
                )}
                {p.archetype && p.archetype !== "UNKNOWN" && (
                  <span className="row-archetype">{p.archetype}</span>
                )}
              </div>
              {profile.currentRaceNumber != null && (
                <div className="row-track">
                  <ScorePipTrack
                    confirmedScore={pipConfirmedScore}
                    lastDelta={lastDelta}
                    segmentProgress={segmentProgress}
                    animatingDelta={animatingDelta}
                    leaderScore={leaderScore}
                    isLeader={isLeader}
                    isNight={isNight}
                    statusOverlay={pipOverlay}
                  />
                  {rank != null && (
                    <span
                      className={`row-archetype row-place${
                        rank === 1
                          ? " row-place-1"
                          : rank === 2
                            ? " row-place-2"
                            : rank === 3
                              ? " row-place-3"
                              : " row-place-rest"
                      }${isFighting ? " row-place-fighting" : ""}`}
                    >
                      {ordinal(rank).toLowerCase()}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="divider">{"────────────────────────"}</div>

            <div className="section-label">IDENTITY</div>
            <p className="player-sheet-identity-line">
              <span className="player-sheet-identity-k">GENDER:</span>{" "}
              {formatPlayerGender(p.gender)}
            </p>
            <p className="player-sheet-identity-line">
              <span className="player-sheet-identity-k">TRAITS:</span>{" "}
              {traits.length > 0 ? traits.join(" ") : "—"}
            </p>
            <p className="player-sheet-identity-line">
              <span className="player-sheet-identity-k">SIGNATURE:</span>{" "}
              {signatureStat.toUpperCase()}{" "}
              <FlatIcon id="star" className="race-emoji race-emoji-inline" aria-hidden="true" /> (
              {p.status})
            </p>
            <p className="player-sheet-meta player-sheet-identity-block">
              {getArchetypeExplainer(p.archetype)}
            </p>
            {traits.map((trait) => (
              <p key={trait} className="player-sheet-meta player-sheet-identity-block">
                <span className="player-sheet-identity-k">{trait}</span> {getTraitExplainer(trait)}
              </p>
            ))}

            <div className="divider">{"────────────────────────"}</div>

            <div className="section-label">ABILITIES</div>
            <div className="player-sheet-abilities-grid">
              <AbilityRow
                label="GRIT"
                value={p.grit}
                description={getStatAbilityExplainer("grit")}
                signature={p.signature_stat === "grit"}
                isNight={isNight}
              />
              <AbilityRow
                label="CHAOS"
                value={p.chaos}
                description={getStatAbilityExplainer("chaos")}
                signature={p.signature_stat === "chaos"}
                isNight={isNight}
              />
              <AbilityRow
                label="NERVE"
                value={p.nerve}
                description={getStatAbilityExplainer("nerve")}
                signature={p.signature_stat === "nerve"}
                isNight={isNight}
              />
              <AbilityRow
                label="LUCK"
                value={p.luck}
                description={getStatAbilityExplainer("luck")}
                signature={p.signature_stat === "luck"}
                isNight={isNight}
              />
              <AbilityRow
                label="BURST"
                value={p.burst}
                description={getStatAbilityExplainer("burst")}
                signature={p.signature_stat === "burst"}
                isNight={isNight}
              />
              <AbilityRow
                label="DRAG"
                value={p.drag}
                description={getStatAbilityExplainer("drag")}
                signature={p.signature_stat === "drag"}
                isNight={isNight}
              />
            </div>

            <StatPanel
              title="RECORD"
              rows={[
                { label: "races", value: p.races },
                { label: "wins", value: p.wins },
                { label: "outs", value: p.eliminations },
                { label: "returns", value: p.returns },
                {
                  label: "best",
                  value: p.best_finish != null ? ordinal(p.best_finish) : "—",
                },
                {
                  label: "worst",
                  value: p.worst_finish != null ? ordinal(p.worst_finish) : "—",
                },
                {
                  label: "streak",
                  value: formatStreak(p.current_streak_type, p.current_streak_count),
                },
                { label: "win stk", value: p.longest_win_streak },
              ]}
            />

            <StatPanel
              title="PEAKS"
              rows={[
                { label: "high race", value: formatRaceScore(p.highest_race_score ?? 0) },
                {
                  label: "high career",
                  value: formatRaceScore(p.highest_career_score ?? 0),
                },
                {
                  label: "comeback",
                  value: p.biggest_comeback > 0 ? `+${p.biggest_comeback}` : "—",
                },
                { label: "age", value: `${p.age_days}d` },
                { label: "holding", value: `${p.total_holding_days}d` },
                { label: "support", value: p.total_support_received ?? 0 },
              ]}
            />

            <StatPanel
              title="BAD MONEY"
              rows={[
                { label: "total", value: p.bad_money_total ?? 0 },
                { label: "winning", value: p.bad_money_wins ?? 0 },
                { label: "losing", value: p.bad_money_losses ?? 0 },
                { label: "pressure", value: p.bad_money_pressure ?? 0 },
              ]}
            />
            <p className="tap-hint">{getBadMoneyFlavorLine(p.bad_money_total ?? 0)}</p>

            {(profile.raceInjury?.is_injured || p.status === "injured") && (
              <StatPanel
                title="INJURY"
                rows={[
                  {
                    label: "status",
                    value: profile.raceInjury?.injury_name ?? p.current_injury_name ?? "injured",
                  },
                  {
                    label: "out",
                    value:
                      p.status === "injured"
                        ? `${p.injury_races_remaining} races`
                        : "this race",
                  },
                ]}
              />
            )}

            <div className="section-label">RACE LOG</div>
            {profile.history.length === 0 ? (
              <p className="tap-hint">no entries yet</p>
            ) : (
              profile.history.map((h) => (
                <div key={h.id} className="all-time-row">
                  D{h.day_number} · {h.event_text}
                </div>
              ))
            )}

            <p className="tap-hint player-sheet-foot">CLOSE</p>
          </>
        )}
      </div>
    </div>
  );
}
