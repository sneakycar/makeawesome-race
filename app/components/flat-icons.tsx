export type RaceIconId = "lead" | "comeback" | "last" | "fight" | "injured" | "check" | "star";

const EMOJI: Record<RaceIconId, string> = {
  lead: "🏆",
  comeback: "👀",
  last: "💀",
  fight: "👊",
  injured: "🏥",
  check: "✓",
  star: "⭐",
};

/** Race status emojis — rendered grayscale via `.race-emoji`. */
export function FlatIcon({ id, className }: { id: RaceIconId; className?: string }) {
  return (
    <span className={className ?? "race-emoji"} aria-hidden="true">
      {EMOJI[id]}
    </span>
  );
}
