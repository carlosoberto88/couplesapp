-- 0025_recurring_schedule.sql — optional auto-regeneration schedule for
-- recurring lists. null interval = manual only (today's behavior). The daily
-- cron (app/api/cron/recurring-lists) regenerates staples when due.

alter table public.lists
  add column regenerate_interval_days int check (regenerate_interval_days is null or regenerate_interval_days > 0),
  add column next_regenerate_at timestamptz;

-- No new RLS policy: these columns live on the existing public.lists row,
-- already governed by "lists_select_member" / "lists_update_owner" from
-- 0001_init.sql. The cron job writes via the service-role client, which
-- bypasses RLS entirely.
