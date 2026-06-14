-- Remove seed holding players who have never raced
delete from players
where status = 'holding'
  and races = 0;
