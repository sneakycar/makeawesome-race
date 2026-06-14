export type PlayerStatus = "active" | "holding" | "injured" | "retired";
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
  bad_money_total: number;
  bad_money_races: number;
  bad_money_wins: number;
  bad_money_losses: number;
  bad_money_pressure: number;
  bad_money_last_day: number | null;
  highest_race_score: number;
  highest_career_score: number;
  biggest_comeback: number;
  archetype: string;
  traits: string[];
  signature_stat: string;
  current_injury_name: string | null;
  injured_at_day: number | null;
  injury_races_remaining: number;
  total_injuries: number;
  injury_history: InjuryRecord[];
  palette_colors: string[];
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
  delay_until: string | null;
  delay_started_at: string | null;
  delay_title: string | null;
  delay_body: string | null;
  delay_frozen_percent: number | null;
  created_at: string;
}

export interface RaceDelayInfo {
  active: boolean;
  until: string | null;
  title: string | null;
  body: string | null;
  frozenPercent: number | null;
  resumesInMs: number | null;
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
  recent_deltas?: number[];
  last_rank_change: number;
  race_score: number;
  peak_race_score: number;
  condition: number;
  event_note: string | null;
  is_injured: boolean;
  injured_at_tick: number | null;
  injury_name: string | null;
  injury_severity: string | null;
  injury_note: string | null;
  injury_races_missed: number | null;
  is_fighting: boolean;
  fighting_at_tick: number | null;
  fight_end_tick: number | null;
  fight_partner_id: string | null;
  fight_frozen_score: number | null;
  fan_live_bonus?: number;
  bad_money_count?: number;
  bad_money_effect?: number;
  created_at: string;
  updated_at: string;
  player?: Player;
}

export interface InjuryRecord {
  day: number;
  name: string;
  severity: string;
  races_missed: number;
  race_id: string;
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
  god_score_awarded: boolean;
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

export interface OvrRanking {
  ovr: number;
  rank: number;
  total: number;
}

export interface StreakEntry {
  name: string;
  slug: string;
  current_streak_type: StreakType;
  current_streak_count: number;
  updated_at: string;
}

export interface LaneWinStat {
  lane: number;
  label: string;
  wins: number;
  starts: number;
  winPct: number;
  performanceBonus: number;
}

export interface LeagueStatBar {
  key: string;
  label: string;
  average: number;
  max: number;
  leaderName: string;
  leaderValue: number;
  color: string;
}

export interface LeagueCountBar {
  label: string;
  value: number;
  pct: number;
}

export interface LeagueHeadlineTile {
  label: string;
  value: number;
  accent: string;
}

export interface LeagueRecord {
  label: string;
  name: string;
  value: string;
}

export interface LeagueWinRateRow {
  name: string;
  wins: number;
  races: number;
  winPct: number;
}

export interface LeagueLaneBar extends LaneWinStat {
  barPct: number;
}

export type RaceWeatherType = "rain" | "wind" | "storm" | "heat" | "fog";

export interface LeagueWeatherEvent {
  id: string;
  raceNumber: number;
  type: RaceWeatherType;
  label: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
}

export interface LeagueStatsResponse {
  generatedAt: string;
  headline: {
    totalPlayers: number;
    racesFinalized: number;
    currentRace: number;
    currentDay: number;
  };
  tiles: LeagueHeadlineTile[];
  rosterMix: LeagueCountBar[];
  archetypes: LeagueCountBar[];
  traits: LeagueCountBar[];
  abilityAverages: LeagueStatBar[];
  careerTotals: LeagueCountBar[];
  records: LeagueRecord[];
  winRateChart: LeagueWinRateRow[];
  ovrBuckets: LeagueCountBar[];
  laneWinRates: LeagueLaneBar[];
  finishDistribution: LeagueCountBar[];
  tickerEvents: LeagueCountBar[];
  weatherTotal: number;
  weatherByType: LeagueCountBar[];
  weatherRecent: LeagueWeatherEvent[];
}

export interface EncouragementState {
  supportedPlayerId: string | null;
  votesUsed: number;
  votesMax: number;
  votesRemaining: number;
  nextVoteAt: string | null;
  canVote: boolean;
}

export interface BadMoneyState {
  betPlayerId: string | null;
  hasBet: boolean;
  canBet: boolean;
}

export interface GameStateResponse {
  race: Race;
  entries: RaceEntryWithPlayer[];
  allTime: Player[];
  streaks: StreakEntry[];
  holding: Player[];
  injured: Player[];
  ovrByPlayerId: Record<string, OvrRanking>;
  serverTime: string;
  remainingMs: number;
  startsInMs: number;
  racePhase: "upcoming" | "live" | "ended" | "delayed";
  percentComplete: number;
  raceDelay: RaceDelayInfo | null;
  laneStats: LaneWinStat[];
  gameState: GameState;
  encouragement: EncouragementState;
  badMoney: BadMoneyState;
  ticker: TickerEvent[];
  betweenRaces: boolean;
  nextRaceNumber: number | null;
  nextRaceStartsAt: string | null;
  devTools: boolean;
}

export interface PlayerProfileResponse {
  player: Player;
  history: PlayerHistory[];
  currentRaceNumber: number | null;
  currentRank: number | null;
  currentProgress: number | null;
  currentScore: number | null;
  ovr: number;
  ovrRank: number;
  ovrTotal: number;
  raceInjury?: {
    is_injured: boolean;
    injury_name: string | null;
    injury_severity: string | null;
  } | null;
}
