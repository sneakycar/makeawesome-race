import type { Player, TickerEventFacts } from "./types";

export interface TickerEntrySnapshot {
  player_id: string;
  player: Player;
  current_rank: number;
  progress: number;
  last_delta: number;
  event_note: string | null;
}

export type TickerEventType =
  | "lead_change"
  | "chaos_surge"
  | "collapse"
  | "score_collapse"
  | "rank_slip"
  | "rank_surge"
  | "big_lap"
  | "stall"
  | "underdog"
  | "rookie_run"
  | "late_close"
  | "lead_pressure"
  | "race_start"
  | "status_pulse"
  | "race_won"
  | "eliminated"
  | "race_delay"
  | "delay_lost_tick"
  | "race_resumed"
  | "fight"
  | "god_score";

export interface TickerEventDraft {
  eventType: TickerEventType;
  playerId: string | null;
  message: string;
  facts: TickerEventFacts;
  priority: number;
}
