"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { FlatIcon } from "@/app/components/flat-icons";
import { formatCompactDuration, formatRaceBegan, formatRacerName } from "@/lib/format";
import { formatLaneBonus } from "@/lib/lanes";
import { getScorePipBackground } from "@/lib/score";
import { useDayNight, useHomeDayNightTheme } from "@/lib/use-day-night";
import type { LeagueCountBar, LeagueStatBar, LeagueStatsResponse } from "@/lib/types";

function StatPipBar({
  pct,
  isNight,
  slots = 20,
}: {
  pct: number;
  isNight: boolean;
  slots?: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * slots);

  return (
    <div
      className={`score-pip-track game-stat-pips${isNight ? " is-night" : ""}`}
      aria-hidden="true"
    >
      {Array.from({ length: slots }, (_, i) =>
        i < filled ? (
          <span
            key={i}
            className="score-pip score-pip-on"
            style={{ background: getScorePipBackground(i, slots, isNight) }}
          />
        ) : (
          <span key={i} className="score-pip score-pip-dim" />
        )
      )}
    </div>
  );
}

function GameStatRow({
  label,
  value,
  pct,
  sub,
  isNight,
  highlight,
}: {
  label: ReactNode;
  value: ReactNode;
  pct: number;
  sub?: ReactNode;
  isNight: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`game-stat-row${highlight ? " is-highlight" : ""}`}>
      <div className="game-stat-head">
        <span className="game-stat-label">{label}</span>
        <span className="game-stat-val">{value}</span>
      </div>
      <StatPipBar pct={pct} isNight={isNight} />
      {sub ? <div className="game-stat-sub">{sub}</div> : null}
    </div>
  );
}

function GamePanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="racer-card-panel">
      <h3 className="racer-card-panel-title">{title}</h3>
      {children}
    </section>
  );
}

function CountPanel({
  title,
  items,
  maxPct,
  isNight,
  highlight,
}: {
  title: string;
  items: LeagueCountBar[];
  maxPct?: number;
  isNight: boolean;
  highlight?: boolean;
}) {
  if (!items.length) return null;
  const peak = maxPct ?? Math.max(...items.map((i) => i.pct), 1);

  return (
    <GamePanel title={title}>
      {items.map((item) => (
        <GameStatRow
          key={item.label}
          label={item.label.toLowerCase()}
          value={
            <>
              {item.value}
              <span className="game-stat-val-muted"> · {item.pct}%</span>
            </>
          }
          pct={peak > 0 ? (item.pct / peak) * 100 : 0}
          isNight={isNight}
          highlight={highlight}
        />
      ))}
    </GamePanel>
  );
}

function GameField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="racer-field">
      <span className="racer-field-k">{label}</span>
      <span className="racer-field-v">{value}</span>
    </div>
  );
}

export function StatsOverlay({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<LeagueStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isNight = useDayNight();
  useHomeDayNightTheme(isNight);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          if (data.error) setError(data.error);
          else setStats(data);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load stats");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "x" || e.key === "X") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const maxWinPct = Math.max(...(stats?.winRateChart.map((r) => r.winPct) ?? [1]), 1);
  const bestLane =
    stats?.laneWinRates.filter((l) => l.starts > 0).sort((a, b) => b.winPct - a.winPct)[0] ??
    null;

  return (
    <div
      className="overlay overlay--racer"
      data-theme={isNight ? "night" : "day"}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="stats-title"
    >
      <div className="racer-card stats-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="racer-card-close" onClick={onClose} aria-label="Close">
          close
        </button>

        {error && <p className="racer-card-message racer-card-message--error">{error}</p>}
        {!stats && !error && <p className="racer-card-message">loading...</p>}

        {stats && (
          <>
            <header className="racer-card-header racer-card-header--league">
              <span className="racer-card-kicker">league stats</span>
              <div className="racer-card-head-row">
                <h2 id="stats-title" className="racer-card-name">
                  data terminal
                </h2>
                <span className="racer-card-ovr">
                  <span className="racer-card-ovr-label">race {stats.headline.currentRace}</span>
                  <span className="racer-card-ovr-rank">day {stats.headline.currentDay}</span>
                </span>
              </div>
            </header>

            <div className="racer-card-body">
              <div className="game-tile-grid">
                {stats.tiles.map((tile) => (
                  <div key={tile.label} className="game-tile">
                    <span className="game-tile-num">{tile.value}</span>
                    <span className="game-tile-label">{tile.label.toLowerCase()}</span>
                  </div>
                ))}
              </div>

              <GamePanel title="ability averages">
                {stats.abilityAverages.map((stat: LeagueStatBar) => (
                  <GameStatRow
                    key={stat.key}
                    label={stat.label.toLowerCase()}
                    value={stat.average}
                    pct={stat.average}
                    isNight={isNight}
                    sub={
                      <>
                        peak {stat.leaderValue} · {formatRacerName(stat.leaderName)}
                      </>
                    }
                  />
                ))}
              </GamePanel>

              <div className="stats-panel-grid">
                <CountPanel
                  title="roster mix"
                  items={stats.rosterMix}
                  isNight={isNight}
                />
                <CountPanel
                  title="ovr spread"
                  items={stats.ovrBuckets}
                  isNight={isNight}
                />
              </div>

              <GamePanel title="win rate leaders">
                {stats.winRateChart.length === 0 ? (
                  <p className="game-stat-empty">no finished races yet</p>
                ) : (
                  stats.winRateChart.map((row) => (
                    <GameStatRow
                      key={row.name}
                      label={formatRacerName(row.name)}
                      value={
                        <>
                          {row.winPct}%
                          <span className="game-stat-val-muted">
                            {" "}
                            · {row.wins}/{row.races}
                          </span>
                        </>
                      }
                      pct={(row.winPct / maxWinPct) * 100}
                      isNight={isNight}
                      highlight={row.winPct === maxWinPct}
                    />
                  ))
                )}
              </GamePanel>

              <GamePanel title="lane win %">
                {stats.laneWinRates.every((l) => l.starts === 0) ? (
                  <p className="game-stat-empty">awaiting finalized races</p>
                ) : (
                  stats.laneWinRates.map((lane) => (
                    <GameStatRow
                      key={lane.lane}
                      label={
                        <>
                          L{lane.lane} {lane.label.toLowerCase()}
                          {bestLane?.lane === lane.lane ? (
                            <>
                              {" "}
                              <FlatIcon id="star" className="race-emoji race-emoji-star" />
                            </>
                          ) : null}
                        </>
                      }
                      value={
                        <>
                          {lane.winPct}%
                          <span className="game-stat-val-muted">
                            {" "}
                            · {lane.wins}/{lane.starts}
                          </span>
                        </>
                      }
                      pct={lane.barPct}
                      isNight={isNight}
                      highlight={bestLane?.lane === lane.lane}
                      sub={formatLaneBonus(lane.lane)}
                    />
                  ))
                )}
              </GamePanel>

              <div className="stats-panel-grid">
                <CountPanel
                  title="finish distribution"
                  items={stats.finishDistribution}
                  isNight={isNight}
                />
                <CountPanel title="archetypes" items={stats.archetypes} isNight={isNight} />
              </div>

              <CountPanel title="traits" items={stats.traits} isNight={isNight} />
              <CountPanel title="ticker events" items={stats.tickerEvents} isNight={isNight} />

              <GamePanel title={`weather log (${stats.weatherTotal})`}>
                {stats.weatherTotal === 0 ? (
                  <p className="game-stat-empty">no weather events logged yet</p>
                ) : (
                  <>
                    {stats.weatherByType.map((item) => (
                      <GameStatRow
                        key={item.label}
                        label={item.label.toLowerCase()}
                        value={
                          <>
                            {item.value}
                            <span className="game-stat-val-muted"> · {item.pct}%</span>
                          </>
                        }
                        pct={
                          stats.weatherTotal > 0 ? (item.value / stats.weatherTotal) * 100 : 0
                        }
                        isNight={isNight}
                      />
                    ))}
                    <div className="game-log-list">
                      {stats.weatherRecent.map((evt) => (
                        <p key={evt.id} className="game-log-line">
                          <span className="game-log-type">{evt.label.toLowerCase()}</span>
                          {" · "}
                          r{evt.raceNumber} · {formatRaceBegan(new Date(evt.startedAt))} ·{" "}
                          {formatCompactDuration(evt.durationSec * 1000)}
                        </p>
                      ))}
                    </div>
                  </>
                )}
              </GamePanel>

              <GamePanel title="all-time records">
                <div className="racer-card-grid">
                  {stats.records.map((rec) => (
                    <GameField
                      key={rec.label}
                      label={rec.label.toLowerCase()}
                      value={
                        <>
                          {formatRacerName(rec.name)} · {rec.value}
                        </>
                      }
                    />
                  ))}
                </div>
              </GamePanel>

              <GamePanel title="career totals">
                {stats.careerTotals.map((item) => (
                  <GameStatRow
                    key={item.label}
                    label={item.label.toLowerCase()}
                    value={item.value}
                    pct={item.pct}
                    isNight={isNight}
                  />
                ))}
              </GamePanel>
            </div>

            <p className="racer-card-footer">press x or tap outside to close</p>
          </>
        )}
      </div>
    </div>
  );
}
