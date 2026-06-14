"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PlayerProfileResponse } from "@/lib/types";
import {
  formatPips,
  formatStreak,
  formatCurrentRaceLabel,
  ordinal,
} from "@/lib/format";
import { formatStoredScore } from "@/lib/score";
import { formatOvrRank } from "@/lib/ovr";
import { formatTraitsDisplay, getIdentityText } from "@/lib/identity";

function abilityLine(label: string, value: number, signature: boolean): string {
  const pips = formatPips(value);
  return `${label.padEnd(8)} ${pips}${signature ? " ★" : ""}`;
}

export default function PlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [slug, setSlug] = useState<string | null>(null);
  const [profile, setProfile] = useState<PlayerProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setSlug(p.slug));
  }, [params]);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/player/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setProfile(data);
      })
      .catch(() => setError("Failed to load player"));
  }, [slug]);

  const p = profile?.player;
  const sig = p?.signature_stat ?? "grit";

  return (
    <div className="player-page">
      <Link href="/" className="back-link">
        [BACK TO RACE]
      </Link>

      {error && <p className="error">{error}</p>}
      {!profile && !error && <p className="loading">LOADING...</p>}

      {p && (
        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
          {p.name}

          {"\n\n"}OVR: {profile!.ovr} ({formatOvrRank({
            ovr: profile!.ovr,
            rank: profile!.ovrRank,
            total: profile!.ovrTotal,
          })})
          {"\n"}STATUS: {p.status.toUpperCase()}
          {p.status === "injured" && p.current_injury_name && (
            <>
              {"\n"}INJURY: {p.current_injury_name}
              {"\n"}OUT: {p.injury_races_remaining} RACES
              {"\n"}RETURNING TO: HOLDING
            </>
          )}
          {profile!.raceInjury?.is_injured && (
            <>
              {"\n"}RACE STATUS: 🏥 INJURED
              {profile!.raceInjury.injury_name && (
                <>
                  {"\n"}INJURY: {profile!.raceInjury.injury_name}
                </>
              )}
            </>
          )}
          {"\n"}AGE: {p.age_days} DAYS
          {profile!.currentRaceNumber != null && (
            <>
              {"\n"}CURRENT RACE:{" "}
              {formatCurrentRaceLabel(profile!.currentRaceNumber, profile!.currentRank)}
            </>
          )}
          {profile!.currentScore != null && (
            <>
              {"\n"}CURRENT SCORE: {formatStoredScore(profile!.currentScore)}
            </>
          )}

          {"\n\n"}ARCHETYPE
          {"\n"}{p.archetype ?? "UNKNOWN"}

          {"\n\n"}TRAITS
          {"\n"}{formatTraitsDisplay(p.traits ?? [])}

          {"\n\n"}SIGNATURE
          {"\n"}{sig.toUpperCase()} ★

          {"\n\n"}{getIdentityText(p)}

          {"\n\n"}STATS

          {"\n\n"}HIGH RACE SCORE: {formatStoredScore(p.highest_race_score ?? 0)}
          {"\n"}HIGH CAREER SCORE: {formatStoredScore(p.highest_career_score ?? 0)}
          {"\n"}BIGGEST COMEBACK: {p.biggest_comeback > 0 ? `+${p.biggest_comeback} SPOTS` : "—"}

          {"\n\n"}ABILITIES

          {"\n\n"}
          {abilityLine("GRIT", p.grit, sig === "grit")}
          {"\n"}
          {abilityLine("CHAOS", p.chaos, sig === "chaos")}
          {"\n"}
          {abilityLine("NERVE", p.nerve, sig === "nerve")}
          {"\n"}
          {abilityLine("LUCK", p.luck, sig === "luck")}
          {"\n"}
          {abilityLine("BURST", p.burst, sig === "burst")}
          {"\n"}
          {abilityLine("DRAG", p.drag, sig === "drag")}

          {"\n\n"}CAREER

          {"\n\n"}RACES: {p.races}
          {"\n"}WINS: {p.wins}
          {"\n"}ELIMINATIONS: {p.eliminations}
          {"\n"}RETURNS: {p.returns}
          {"\n"}BEST FINISH: {p.best_finish != null ? ordinal(p.best_finish) : "—"}
          {"\n"}WORST FINISH: {p.worst_finish != null ? ordinal(p.worst_finish) : "—"}
          {"\n"}CURRENT STREAK: {formatStreak(p.current_streak_type, p.current_streak_count)}
          {"\n"}LONGEST WIN STREAK: {p.longest_win_streak}
          {"\n"}TOTAL DAYS IN HOLDING: {p.total_holding_days}
          {"\n"}TOTAL SUPPORT RECEIVED: {p.total_support_received ?? 0}
          {p.total_injuries > 0 && (
            <>
              {"\n"}TOTAL INJURIES: {p.total_injuries}
            </>
          )}

          {"\n\n"}HISTORY

          {"\n\n"}
          {profile!.history.length === 0
            ? "NO HISTORY YET"
            : profile!.history
                .map((h) => `DAY ${h.day_number} — ${h.event_text}`)
                .join("\n")}
        </pre>
      )}
    </div>
  );
}
