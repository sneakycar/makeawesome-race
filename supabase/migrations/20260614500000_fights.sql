-- In-race fight pauses (two racers, frozen scores, temporary)

alter table race_entries
  add column if not exists is_fighting boolean not null default false,
  add column if not exists fighting_at_tick integer,
  add column if not exists fight_end_tick integer,
  add column if not exists fight_partner_id uuid references players(id) on delete set null,
  add column if not exists fight_frozen_score numeric;

create index if not exists idx_race_entries_fighting on race_entries(race_id, is_fighting)
  where is_fighting = true;
