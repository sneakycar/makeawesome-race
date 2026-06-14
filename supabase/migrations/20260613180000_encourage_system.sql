-- Encourage system migration (run if upgrading existing database)

alter table players add column if not exists total_support_received integer not null default 0;

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

alter table race_supports enable row level security;

drop policy if exists "public read race_supports" on race_supports;
create policy "public read race_supports" on race_supports for select using (true);
