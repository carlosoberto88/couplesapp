-- 0016_onboarding_version.sql — versioned onboarding tour.
-- Replaces the single completion timestamp gate with a version counter so
-- bumping ONBOARDING_VERSION re-shows the tour to everyone without editing rows.
-- Existing users default to 0; the current tour is version 1, so 0 < 1 re-shows
-- it for everyone once — no bulk UPDATE needed.

alter table public.profiles
  add column onboarding_version integer not null default 0;
