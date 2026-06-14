-- Global race weather event log (deterministic bursts during each race)

create table if not exists race_weather_events (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races(id) on delete cascade,
  race_number integer not null,
  weather_slot bigint not null,
  weather_type text not null check (weather_type in ('rain', 'wind', 'storm', 'heat', 'fog')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  created_at timestamptz default now(),
  unique (race_id, weather_slot)
);

create index if not exists idx_race_weather_events_time on race_weather_events(started_at desc);
create index if not exists idx_race_weather_events_type on race_weather_events(weather_type);
create index if not exists idx_race_weather_events_race on race_weather_events(race_id);

alter table race_weather_events enable row level security;
create policy "public read race_weather_events" on race_weather_events for select using (true);
