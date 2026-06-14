-- Verifiable ticker events + comeback tracking on entries

alter table race_entries
  add column if not exists last_rank_change integer not null default 0;

alter table race_ticker_events
  add column if not exists event_type text;

alter table race_ticker_events
  add column if not exists player_id uuid references players(id) on delete set null;

alter table race_ticker_events
  add column if not exists facts jsonb not null default '{}'::jsonb;

update race_ticker_events set event_type = 'legacy' where event_type is null;

alter table race_ticker_events
  alter column event_type set default 'legacy';

alter table race_ticker_events
  alter column event_type set not null;
