-- HOLES RACE schema

create extension if not exists "pgcrypto";

-- players
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  status text not null check (status in ('active', 'holding', 'retired')),
  created_day integer not null,
  age_days integer not null default 0,
  active_days integer not null default 0,
  holding_days integer not null default 0,
  races integer not null default 0,
  wins integer not null default 0,
  eliminations integer not null default 0,
  returns integer not null default 0,
  best_finish integer,
  worst_finish integer,
  current_streak_type text check (current_streak_type in ('win', 'lose', 'none')) default 'none',
  current_streak_count integer not null default 0,
  longest_win_streak integer not null default 0,
  total_holding_days integer not null default 0,
  grit integer not null,
  chaos integer not null,
  nerve integer not null,
  luck integer not null,
  burst integer not null,
  drag integer not null,
  rating integer not null,
  fatigue integer not null default 0,
  pressure integer not null default 0,
  volatility integer not null default 0,
  rookie_until_day integer,
  comeback_until_day integer,
  seed text not null,
  total_support_received integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- races
create table if not exists races (
  id uuid primary key default gen_random_uuid(),
  race_number integer unique not null,
  day_number integer unique not null,
  status text not null check (status in ('active', 'finalized')),
  started_at timestamptz not null,
  ends_at timestamptz not null,
  finalized_at timestamptz,
  percent_complete integer not null default 0,
  created_at timestamptz default now()
);

-- race_entries
create table if not exists race_entries (
  id uuid primary key default gen_random_uuid(),
  race_id uuid references races(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  lane integer not null,
  progress numeric not null default 0,
  displayed_progress integer not null default 0,
  current_rank integer not null,
  final_rank integer,
  last_delta numeric not null default 0,
  last_rank_change integer not null default 0,
  race_score numeric not null default 0,
  condition integer not null default 0,
  event_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (race_id, player_id),
  unique (race_id, lane)
);

-- player_history
create table if not exists player_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  race_id uuid references races(id) on delete set null,
  day_number integer not null,
  event_type text not null,
  event_text text not null,
  finish_rank integer,
  progress integer,
  created_at timestamptz default now()
);

-- race_supports (encourage system — one per IP hash per race)
create table if not exists race_supports (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  ip_hash text not null,
  created_at timestamptz default now(),
  unique (race_id, ip_hash)
);

create index if not exists idx_race_supports_race on race_supports(race_id);
create index if not exists idx_race_supports_player on race_supports(player_id);

-- race_ticker_events (narrative feed after each cron tick)
create table if not exists race_ticker_events (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races(id) on delete cascade,
  tick_number integer not null default 0,
  message text not null,
  event_type text not null default 'legacy',
  player_id uuid references players(id) on delete set null,
  facts jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_race_ticker_race_time on race_ticker_events(race_id, created_at desc);

-- game_state
create table if not exists game_state (
  id integer primary key default 1 check (id = 1),
  current_day integer not null,
  current_race_number integer not null,
  last_tick_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_players_status on players(status);
create index if not exists idx_players_slug on players(slug);
create index if not exists idx_players_wins on players(wins desc);
create index if not exists idx_race_entries_race on race_entries(race_id);
create index if not exists idx_player_history_player on player_history(player_id, day_number desc);

alter table players enable row level security;
alter table races enable row level security;
alter table race_entries enable row level security;
alter table player_history enable row level security;
alter table game_state enable row level security;
alter table race_supports enable row level security;
alter table race_ticker_events enable row level security;

create policy "public read players" on players for select using (true);
create policy "public read races" on races for select using (true);
create policy "public read race_entries" on race_entries for select using (true);
create policy "public read player_history" on player_history for select using (true);
create policy "public read game_state" on game_state for select using (true);
create policy "public read race_supports" on race_supports for select using (true);
create policy "public read race_ticker_events" on race_ticker_events for select using (true);
