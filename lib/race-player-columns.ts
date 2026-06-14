/** Player columns needed on the home race board (skip heavy JSON blobs). */
export const RACE_PLAYER_SELECT = [
  "id",
  "name",
  "slug",
  "status",
  "archetype",
  "traits",
  "signature_stat",
  "grit",
  "chaos",
  "nerve",
  "luck",
  "burst",
  "drag",
  "rating",
  "current_streak_type",
  "current_streak_count",
  "wins",
  "fatigue",
  "pressure",
  "bad_money_total",
  "palette_colors",
  "gender",
].join(", ");

export const RACE_ENTRY_PLAYER_SELECT = `*, player:players!race_entries_player_id_fkey(${RACE_PLAYER_SELECT})`;
