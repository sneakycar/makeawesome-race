-- Backfill race schedule: 9:00 AM Eastern → next day 9:00 AM Eastern (24h)
-- Run once in Supabase SQL Editor after deploying schedule changes.

update races
set
  ends_at = started_at + interval '24 hours',
  percent_complete = case
    when status = 'finalized' then 100
    else least(
      100,
      greatest(
        0,
        round(
          extract(epoch from (now() - started_at))
          / extract(epoch from interval '24 hours')
          * 100
        )
      )
    )
  end
where status in ('active', 'finalized');
