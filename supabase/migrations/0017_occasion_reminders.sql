-- 0017_occasion_reminders.sql — occasion reminders for wishlists.
-- Lets a wishlist carry an annual occasion (birthday, anniversary, ...) so a
-- cron job can nudge members to reserve gifts as the date approaches.
-- occasion_date null = no reminder configured (default, existing rows
-- unaffected). celebrant_user_id null = no single celebrant to exclude from
-- the nudge (e.g. a shared/family wishlist) — everyone on the list gets it.

alter table public.lists
  add column occasion_date date,
  add column occasion_label text,
  add column celebrant_user_id text references public.profiles(id) on delete set null;
