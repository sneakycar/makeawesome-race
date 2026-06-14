-- Multi-vote encourage: up to 6 per visitor per race, live bonus + growth rolls.

alter table race_supports drop constraint if exists race_supports_race_id_ip_hash_key;

alter table race_supports add column if not exists device_hash text not null default '';
alter table race_supports add column if not exists live_score_granted numeric not null default 0;

alter table race_entries add column if not exists fan_live_bonus numeric not null default 0;

create index if not exists idx_race_supports_race_ip on race_supports(race_id, ip_hash);
create index if not exists idx_race_supports_race_device on race_supports(race_id, device_hash);
