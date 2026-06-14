-- Score stats: peak race score, career high, biggest comeback

alter table players
  add column if not exists highest_race_score numeric not null default 0,
  add column if not exists highest_career_score numeric not null default 0,
  add column if not exists biggest_comeback integer not null default 0;

alter table race_entries
  add column if not exists peak_race_score numeric not null default 0;
