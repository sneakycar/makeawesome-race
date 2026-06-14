-- All races run 24 hours: 9:00 AM Eastern → next day 9:00 AM Eastern.
-- Repairs active races that were stored with the old 12h (9am–9pm) window.

update races
set
  ends_at = started_at + interval '24 hours',
  percent_complete = least(
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
where status = 'active'
  and ends_at <= started_at + interval '20 hours';
