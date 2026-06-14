-- Bad Money: one superstition bet per visitor IP per race (not real gambling).

create table if not exists race_bets (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  ip_hash text not null,
  user_agent_hash text,
  created_at timestamptz default now(),
  unique (race_id, ip_hash)
);

create index if not exists idx_race_bets_race on race_bets(race_id);
create index if not exists idx_race_bets_player on race_bets(player_id);
create index if not exists idx_race_bets_race_player on race_bets(race_id, player_id);
create index if not exists idx_race_bets_ip on race_bets(ip_hash);

alter table players
  add column if not exists bad_money_total integer not null default 0,
  add column if not exists bad_money_races integer not null default 0,
  add column if not exists bad_money_wins integer not null default 0,
  add column if not exists bad_money_losses integer not null default 0,
  add column if not exists bad_money_pressure integer not null default 0,
  add column if not exists bad_money_last_day integer;

alter table race_entries
  add column if not exists bad_money_count integer not null default 0,
  add column if not exists bad_money_effect numeric not null default 0;

alter table race_bets enable row level security;
create policy "public read race_bets" on race_bets for select using (true);
