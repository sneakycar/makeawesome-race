export type PlayerStatus = "active" | "holding" | "retired";
export type RaceStatus = "active" | "finalized";
export type StreakType = "win" | "lose" | "none";

export interface Player {
  id: string;
  name: string;
  slug: string;
  status: PlayerStatus;
  created_day: number;
  age_days: number;
  active_days: number;
  holding_days: number;
  races: number;
  wins: number;
  eliminations: number;
  returns: number;
  best_finish: number | null;
  worst_finish: number | null;
  current_streak_type: StreakType;
  current_streak_count: number;
  longest_win_streak: number;
  total_holding_days: number;
  grit: number;
  chaos: number;
  nerve: number;
  luck: number;
  burst: number;
  drag: number;
  rating: number;
  fatigue: number;
  pressure: number;
  volatility: number;
  rookie_until_day: number | null;
  comeback_until_day: number | null;
  seed: string;
  total_support_received: number;
  created_at: string;
  updated_at: string;
}

export interface Race {
  id: string;
  race_number: number;
  day_number: number;
  status: RaceStatus;
  started_at: string;
  ends_at: string;
  finalized_at: string | null;
  percent_complete: number;
  created_at: string;
}

export interface RaceEntry {
  id: string;
  race_id: string;
  player_id: string;
  lane: number;
  progress: number;
  displayed_progress: number;
  current_rank: number;
  final_rank: number | null;
  last_delta: number;
  last_rank_change: number;
  race_score: number;
  condition: number;
  event_note: string | null;
  created_at: string;
  updated_at: string;
  player?: Player;
}

export interface PlayerHistory {
  id: string;
  player_id: string;
  race_id: string | null;
  day_number: number;
  event_type: string;
  event_text: string;
  finish_rank: number | null;
  progress: number | null;
  created_at: string;
}

export interface GameState {
  id: number;
  current_day: number;
  current_race_number: number;
  last_tick_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RaceEntryWithPlayer extends RaceEntry {
  player: Player;
}

export interface TickerEventFacts {
  tickNumber: number;
  percentComplete: number;
  playerName: string;
  rankBefore?: number;
  rankAfter?: number;
  rankChange?: number;
  progressAfter?: number;
  lastDelta?: number;
  gapToLeader?: number;
  eventNote?: string | null;
  previousLeaderName?: string;
  winnerName?: string;
  eliminatedName?: string;
  raceNumber?: number;
}

export interface TickerEvent {
  id: string;
  race_id: string;
  tick_number: number;
  message: string;
  event_type: string;
  player_id: string | null;
  facts: TickerEventFacts;
  created_at: string;
}

export interface GameStateResponse {
  race: Race;
  entries: RaceEntryWithPlayer[];
  allTime: Player[];
  holding: Player[];
  serverTime: string;
  remainingMs: number;
  startsInMs: number;
  racePhase: "upcoming" | "live" | "ended";
  percentComplete: number;
  gameState: GameState;
  encouragement: {
    supportedPlayerId: string | null;
  };
  ticker: TickerEvent[];
  betweenRaces: boolean;
  nextRaceNumber: number | null;
  nextRaceStartsAt: string | null;
  devTools: boolean;
}

export interface PlayerProfileResponse {
  player: Player;
  history: PlayerHistory[];
  currentRank: number | null;
  currentProgress: number | null;
}
