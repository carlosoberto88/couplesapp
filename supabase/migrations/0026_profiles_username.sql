-- 0026: add profiles.username — a denormalized read cache of the Clerk username.
-- Clerk remains the source of truth for usernames (set/changed via Clerk's own
-- UI); this column is written lazily by the authenticated-shell.tsx upsert
-- whenever a session carries a username claim, so reads never need a Clerk API
-- round-trip. RLS profiles_select (0021: self, shares_list_with(), are_partners())
-- already covers this row, so no policy change is needed here.

alter table public.profiles
  add column username text;

create unique index profiles_username_lower_idx
  on public.profiles (lower(username))
  where username is not null;
