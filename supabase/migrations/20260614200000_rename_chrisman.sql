-- Rename seed racer CHRIS VOGEL → CHRISMAN
update players
set name = 'CHRISMAN',
    slug = 'chrisman',
    updated_at = now()
where slug = 'chris-vogel'
   or lower(trim(name)) = 'chris vogel';
