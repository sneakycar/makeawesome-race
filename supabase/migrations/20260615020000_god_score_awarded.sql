alter table game_state
  add column if not exists god_score_awarded boolean not null default false;
