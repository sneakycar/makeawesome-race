-- Player identity: archetype, traits, signature stat

alter table players
  add column if not exists archetype text not null default 'UNKNOWN',
  add column if not exists traits text[] not null default '{}',
  add column if not exists signature_stat text not null default 'grit';

alter table players
  drop constraint if exists players_signature_stat_check;

alter table players
  add constraint players_signature_stat_check
  check (signature_stat in ('grit', 'chaos', 'nerve', 'luck', 'burst', 'drag'));
