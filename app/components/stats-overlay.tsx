"use client";

import { useEffect, useState } from "react";
import { formatCompactDuration, formatRaceBegan, formatRacerName } from "@/lib/format";
import { formatLaneBonus } from "@/lib/lanes";
import type { LeagueCountBar, LeagueStatBar, LeagueStatsResponse } from "@/lib/types";

function InfoBar({
  label,
  value,
  pct,
  color = "#00ff88",
  suffix = "",
}: {
  label: string;
  value: number | string;
  pct: number;
  color?: string;
  suffix?: string;
}) {
  return (
    <div className="info-bar-row">
      <div className="info-bar-head">
        <span className="info-bar-label">{label}</span>
        <span className="info-bar-val">
          {value}
          {suffix}
        </span>
      </div>
      <div className="info-bar-track">
        <div
          className="info-bar-fill"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
        />
      </div>
    </div>
  );
}

function AbilityBar({ stat }: { stat: LeagueStatBar }) {
  return (
    <div className="info-bar-row">
      <div className="info-bar-head">
        <span className="info-bar-label">{stat.label}</span>
        <span className="info-bar-val">{stat.average}</span>
      </div>
      <div className="info-bar-track">
        <div
          className="info-bar-fill"
          style={{
            width: `${Math.max(0, Math.min(100, stat.average))}%`,
            background: stat.color,
          }}
        />
      </div>
      <div className="info-bar-sub">
        PEAK {stat.leaderValue} · {formatRacerName(stat.leaderName)}
      </div>
    </div>
  );
}

function CountSection({
  title,
  items,
  maxPct,
  color = "#ffd700",
}: {
  title: string;
  items: LeagueCountBar[];
  maxPct?: number;
  color?: string;
}) {
  if (!items.length) return null;
  const peak = maxPct ?? Math.max(...items.map((i) => i.pct), 1);
  return (
    <div className="retro-box">
      <div className="retro-box-title">{title}</div>
      {items.map((item) => (
        <InfoBar
          key={item.label}
          label={item.label}
          value={item.value}
          pct={peak > 0 ? (item.pct / peak) * 100 : 0}
          color={color}
          suffix={` · ${item.pct}%`}
        />
      ))}
    </div>
  );
}

export function StatsOverlay({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<LeagueStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="stats-title">
      <div className="overlay-scanlines" aria-hidden="true" />
      <div className="retro-screen stats-screen" onClick={(e) => e.stopPropagation()}>
        {error && <p className="retro-error">{error}</p>}
        {!stats && !error && <p className="retro-loading">LOADING...</p>}
        {stats && (
          <>
            <div className="retro-header">
              <span className="retro-header-tag">DATA TERMINAL</span>
              <h2 id="stats-title" className="retro-name">
                LEAGUE STATS
              </h2>
              <span className="retro-header-badge">
                RACE {stats.headline.currentRace} · DAY {stats.headline.currentDay}
              </span>
            </div>

            <div className="info-tile-grid">
              {stats.tiles.map((tile) => (
                <div key={tile.label} className="info-tile">
                  <span className="info-tile-num" style={{ color: tile.accent }}>
                    {tile.value}
                  </span>
                  <span className="info-tile-label">{tile.label}</span>
                </div>
              ))}
            </div>

            <div className="retro-box">
              <div className="retro-box-title">▶ ABILITY AVERAGES</div>
              {stats.abilityAverages.map((stat) => (
                <AbilityBar key={stat.key} stat={stat} />
              ))}
            </div>

            <div className="stats-chart-grid">
              <CountSection title="▶ ROSTER MIX" items={stats.rosterMix} color="#00ff88" />
              <CountSection title="▶ OVR SPREAD" items={stats.ovrBuckets} color="#6688ff" />
            </div>

            <div className="retro-box">
              <div className="retro-box-title">▶ WIN RATE LEADERS</div>
              {stats.winRateChart.length === 0 ? (
                <p className="info-empty">NO FINISHED RACES YET</p>
              ) : (
                stats.winRateChart.map((row) => (
                  <InfoBar
                    key={row.name}
                    label={formatRacerName(row.name)}
                    value={`${row.winPct}%`}
                    pct={(row.winPct / maxWinPct) * 100}
                    color="#ffd700"
                    suffix={` · ${row.wins}/${row.races}`}
                  />
                ))
              )}
            </div>

            <div className="retro-box">
              <div className="retro-box-title">▶ LANE WIN %</div>
              {stats.laneWinRates.every((l) => l.starts === 0) ? (
                <p className="info-empty">AWAITING FINALIZED RACES</p>
              ) : (
                stats.laneWinRates.map((lane) => (
                  <InfoBar
                    key={lane.lane}
                    label={`L${lane.lane} ${lane.label}${bestLane?.lane === lane.lane ? " ★" : ""}`}
                    value={`${lane.winPct}%`}
                    pct={lane.barPct}
                    color={bestLane?.lane === lane.lane ? "#ffd700" : "#ff6600"}
                    suffix={` · ${lane.wins}/${lane.starts} · ${formatLaneBonus(lane.lane)}`}
                  />
                ))
              )}
            </div>

            <div className="stats-chart-grid">
              <CountSection
                title="▶ FINISH DISTRIBUTION"
                items={stats.finishDistribution}
                color="#ff2244"
              />
              <CountSection title="▶ ARCHETYPES" items={stats.archetypes} color="#ff44ff" />
            </div>

            <CountSection title="▶ TRAITS" items={stats.traits} color="#aa55ff" />
            <CountSection title="▶ TICKER EVENTS" items={stats.tickerEvents} color="#00ccaa" />

            <div className="retro-box">
              <div className="retro-box-title">▶ WEATHER LOG ({stats.weatherTotal})</div>
              {stats.weatherTotal === 0 ? (
                <p className="info-empty">NO WEATHER EVENTS LOGGED YET</p>
              ) : (
                <>
                  {stats.weatherByType.map((item) => (
                    <InfoBar
                      key={item.label}
                      label={item.label}
                      value={item.value}
                      pct={
                        stats.weatherTotal > 0
                          ? (item.value / stats.weatherTotal) * 100
                          : 0
                      }
                      color="#66ccff"
                      suffix={` · ${item.pct}%`}
                    />
                  ))}
                  <div className="weather-log-list">
                    {stats.weatherRecent.map((evt) => (
                      <div key={evt.id} className="weather-log-row">
                        <span className="weather-log-type">{evt.label}</span>
                        <span className="weather-log-meta">
                          R{evt.raceNumber} · {formatRaceBegan(new Date(evt.startedAt))} ·{" "}
                          {formatCompactDuration(evt.durationSec * 1000)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="retro-box">
              <div className="retro-box-title">▶ ALL-TIME RECORDS</div>
              <div className="retro-status-grid">
                {stats.records.map((rec) => (
                  <div key={rec.label} className="retro-kv">
                    <span className="retro-k">{rec.label}</span>
                    <span className="retro-v">
                      {formatRacerName(rec.name)} · {rec.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="retro-box">
              <div className="retro-box-title">▶ CAREER TOTALS</div>
              {stats.careerTotals.map((item) => (
                <InfoBar
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  pct={item.pct}
                  color="#4466cc"
                />
              ))}
            </div>

            <button type="button" className="retro-close" onClick={onClose}>
              ◄ PRESS [X] TO CLOSE ►
            </button>
          </>
        )}
      </div>
    </div>
  );
}
