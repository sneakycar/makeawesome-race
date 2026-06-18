-- Remove procedural seed holding players who have never raced.
-- Keeps user-approved reserves (seed like holding-reserve-%).
delete from players
where status = 'holding'
  and races = 0
  and seed not like 'holding-reserve-%';
