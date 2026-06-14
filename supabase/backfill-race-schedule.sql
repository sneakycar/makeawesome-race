-- Backfill race schedule: 9:00 AM – 9:00 PM Eastern daily
-- Race 1 anchor: June 13, 2026
-- Run once in Supabase SQL Editor after deploying schedule changes.

-- Race 1 (June 13, 2026 — 9am/9pm Eastern / EDT)
update races
set
  started_at = '2026-06-13T13:00:00.000Z',
  ends_at = '2026-06-14T01:00:00.000Z',
  percent_complete = least(
    100,
    greatest(
      0,
      round(
        extract(epoch from (now() - timestamptz '2026-06-13T13:00:00.000Z'))
        / extract(epoch from (timestamptz '2026-06-14T01:00:00.000Z' - timestamptz '2026-06-13T13:00:00.000Z'))
        * 100
      )
    )
  )
where race_number = 1 and status = 'active';

-- Finalized races keep 100%
update races
set percent_complete = 100
where status = 'finalized';

-- Race 2+ (if any): each day after the previous race ends
-- Uncomment and adjust race_number as needed:
-- update races
-- set
--   started_at = '2026-06-14T13:00:00.000Z',
--   ends_at = '2026-06-15T01:00:00.000Z'
-- where race_number = 2;
