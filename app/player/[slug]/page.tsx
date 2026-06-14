"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PlayerProfileResponse } from "@/lib/types";
import {
  formatPips,
  formatStreak,
  ordinal,
} from "@/lib/format";

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

          {"\n\n"}STATUS: {p.status.toUpperCase()}
          {"\n"}AGE: {p.age_days} DAYS
          {profile!.currentRank != null && (
            <>
              {"\n"}CURRENT RACE: {ordinal(profile!.currentRank!)}
            </>
          )}
          {profile!.currentProgress != null && (
            <>
              {"\n"}CURRENT PROGRESS: {profile!.currentProgress}%
            </>
          )}

          {"\n\n"}ABILITIES

          {"\n\n"}GRIT      {formatPips(p.grit)}
          {"\n"}CHAOS     {formatPips(p.chaos)}
          {"\n"}NERVE     {formatPips(p.nerve)}
          {"\n"}LUCK      {formatPips(p.luck)}
          {"\n"}BURST     {formatPips(p.burst)}
          {"\n"}DRAG      {formatPips(p.drag)}

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
