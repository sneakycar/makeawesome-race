-- Injury system

alter table players drop constraint if exists players_status_check;
alter table players add constraint players_status_check
  check (status in ('active', 'holding', 'injured', 'retired'));

alter table players
  add column if not exists current_injury_name text,
  add column if not exists injured_at_day integer,
  add column if not exists injury_races_remaining integer not null default 0,
  add column if not exists total_injuries integer not null default 0,
  add column if not exists injury_history jsonb not null default '[]'::jsonb;

alter table race_entries
  add column if not exists is_injured boolean not null default false,
  add column if not exists injured_at_tick integer,
  add column if not exists injury_name text,
  add column if not exists injury_severity text,
  add column if not exists injury_note text,
  add column if not exists injury_races_missed integer;

create table if not exists injury_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  race_id uuid not null references races(id) on delete cascade,
  day_number integer not null,
  injury_name text not null,
  severity text not null,
  races_missed integer not null,
  occurred_at_tick integer,
  occurred_at_percent integer,
  created_at timestamptz default now()
);

create index if not exists idx_injury_events_player on injury_events(player_id, created_at desc);
create index if not exists idx_injury_events_race on injury_events(race_id);

alter table injury_events enable row level security;
create policy "public read injury_events" on injury_events for select using (true);
