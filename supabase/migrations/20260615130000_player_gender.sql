-- Per-racer gender (M/F) for roster identity and narrative copy.

alter table players
  add column if not exists gender text check (gender in ('M', 'F'));

update players
set gender = 'M'
where slug in (
  'walhof',
  'jon-penn',
  'chrisman',
  'bhole',
  'pal',
  'noah',
  'kimber',
  'lacie',
  'uncle'
);
