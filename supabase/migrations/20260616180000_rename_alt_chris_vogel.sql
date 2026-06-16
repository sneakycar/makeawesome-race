-- Rename generated racer alt → chris vogel
update players
set name = 'chris vogel',
    slug = 'chris-vogel',
    gender = 'M',
    updated_at = now()
where slug = 'alt'
   or lower(trim(name)) = 'alt';

update race_ticker_events t
set message = replace(replace(replace(t.message, 'ALT', 'chris vogel'), 'Alt', 'chris vogel'), 'alt', 'chris vogel')
from players p
where p.slug = 'chris-vogel'
  and t.player_id = p.id
  and t.message ilike '%alt%';

update player_history h
set event_text = replace(replace(replace(h.event_text, 'ALT', 'chris vogel'), 'Alt', 'chris vogel'), 'alt', 'chris vogel')
from players p
where p.slug = 'chris-vogel'
  and h.player_id = p.id
  and h.event_text ilike '%alt%';
