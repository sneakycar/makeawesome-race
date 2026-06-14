-- Ticker events migration

create table if not exists race_ticker_events (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races(id) on delete cascade,
  tick_number integer not null default 0,
  message text not null,
  created_at timestamptz default now()
);

create index if not exists idx_race_ticker_race_time on race_ticker_events(race_id, created_at desc);

alter table race_ticker_events enable row level security;

drop policy if exists "public read race_ticker_events" on race_ticker_events;
create policy "public read race_ticker_events" on race_ticker_events for select using (true);
