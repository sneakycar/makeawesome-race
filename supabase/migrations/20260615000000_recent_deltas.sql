-- Rolling window of last 3 tick deltas for inter-cron pip animation
alter table race_entries
  add column if not exists recent_deltas numeric[] not null default '{}';

update race_entries
set recent_deltas = array[last_delta]::numeric[]
where cardinality(recent_deltas) = 0 and last_delta <> 0;
