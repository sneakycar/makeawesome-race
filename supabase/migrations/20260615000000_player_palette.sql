-- Personal 2–4 color palette per racer (player card header)

alter table players
  add column if not exists palette_colors text[] not null default '{}';
