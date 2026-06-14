-- Rare global race delay events (hours-long pauses)

alter table races
  add column if not exists delay_until timestamptz,
  add column if not exists delay_started_at timestamptz,
  add column if not exists delay_title text,
  add column if not exists delay_body text,
  add column if not exists delay_frozen_percent integer;
