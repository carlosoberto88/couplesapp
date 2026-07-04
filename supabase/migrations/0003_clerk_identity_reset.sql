-- 0003_clerk_identity_reset.sql — couples: Supabase Auth -> Clerk identity re-key
-- Drops the current schema (fresh start, data wipe approved) and recreates it
-- re-keyed to Clerk identities (user ids = Clerk `sub`, stored as text). RLS reads
-- public.clerk_user_id() instead of the Supabase-native uid helper. Folds 0001 + 0002 into one file so
-- the final schema is fully Clerk-shaped and readable end to end.

-- ============ DROP ============
-- NOTE: the old Supabase-auth trigger `on_auth_user_created` on auth.users and its
-- function public.handle_new_user() are intentionally LEFT in place. Dropping a trigger
-- on auth.users requires ownership of that table, which the `postgres` role lacks (it has
-- only TRIGGER privilege — enough to CREATE in 0001, not to DROP). They are inert now:
-- Clerk owns signup, nothing inserts into auth.users, so the trigger never fires.

-- Drop tables first (cascade removes their RLS policies + the item_events trigger),
-- so the helper functions they reference have no remaining dependents.
drop table if exists public.item_events cascade;
drop table if exists public.items cascade;
drop table if exists public.list_invites cascade;
drop table if exists public.list_members cascade;
drop table if exists public.lists cascade;
drop table if exists public.profiles cascade;

-- Now the functions have no dependents.
drop function if exists public.log_item_event();
drop function if exists public.create_list(text, text);
drop function if exists public.accept_pending_invites();
drop function if exists public.suggest_usual_items(uuid, int);
drop function if exists public.is_list_member(uuid);
drop function if exists public.shares_list_with(uuid);

-- ============ TABLES ============
create table public.profiles (
  id text primary key,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  type text not null default 'shopping',
  owner_id text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.list_members (
  list_id uuid not null references public.lists(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table public.list_invites (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  email text not null,
  invited_by text not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  note text,
  position double precision not null default 0,
  created_by text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  checked_by text references public.profiles(id) on delete set null,
  checked_at timestamptz
);

create index items_list_created_idx        on public.items (list_id, created_at);
create index list_members_user_idx         on public.list_members (user_id);
create index list_invites_pending_email_idx on public.list_invites (lower(email)) where status = 'pending';
create index lists_owner_idx               on public.lists (owner_id);

create table public.item_events (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  name text not null,
  name_normalized text not null,
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index item_events_list_name_idx on public.item_events (list_id, name_normalized);

-- ============ HELPERS ============
-- Clerk user id from the third-party-auth JWT (`sub` claim). text, not uuid.
create or replace function public.clerk_user_id()
returns text
language sql stable as $$
  select nullif(auth.jwt()->>'sub', '');
$$;

-- SECURITY DEFINER so policies on list_members itself don't recurse.
create or replace function public.is_list_member(p_list_id uuid)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.list_members
    where list_id = p_list_id and user_id = public.clerk_user_id()
  );
$fn$;

create or replace function public.shares_list_with(p_profile_id text)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1
    from public.list_members me
    join public.list_members them on them.list_id = me.list_id
    where me.user_id = public.clerk_user_id() and them.user_id = p_profile_id
  );
$fn$;

-- ============ TRIGGER: items -> item_events ============
create or replace function public.log_item_event()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.item_events (list_id, name, name_normalized, created_by)
  values (new.list_id, new.name, lower(trim(new.name)), new.created_by);
  return new;
end;
$fn$;

create trigger on_item_created
  after insert on public.items
  for each row execute function public.log_item_event();

-- ============ RPCs ============
-- Atomic list creation: lists row + owner membership in one call.
create or replace function public.create_list(p_name text, p_type text)
returns uuid
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if public.clerk_user_id() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.lists (name, type, owner_id)
  values (p_name, p_type, public.clerk_user_id())
  returning id into v_id;
  insert into public.list_members (list_id, user_id, role)
  values (v_id, public.clerk_user_id(), 'owner');
  return v_id;
end;
$fn$;

-- Invite reconciliation: pending invites for MY email -> memberships.
-- Idempotent (safe to run on every sign-in).
-- Note: v_email is read from the Clerk session token's custom `email` claim
-- (Clerk Dashboard -> Sessions -> Customize session token). If the email claim
-- is unavailable, read email from profiles where id = clerk_user_id() instead
-- (the lazy profile upsert in app/lists/layout.tsx runs before this RPC, so the
-- row is guaranteed to exist by the time this executes).
create or replace function public.accept_pending_invites()
returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_count integer := 0;
  inv record;
begin
  if public.clerk_user_id() is null or v_email = '' then
    return 0;
  end if;
  for inv in
    select id, list_id from public.list_invites
    where lower(email) = v_email and status = 'pending'
  loop
    insert into public.list_members (list_id, user_id, role)
    values (inv.list_id, public.clerk_user_id(), 'member')
    on conflict (list_id, user_id) do nothing;
    update public.list_invites set status = 'accepted' where id = inv.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$fn$;

-- Frequency suggestions: most recent display name + count per normalized name,
-- excluding names already on the list. Membership enforced internally.
create or replace function public.suggest_usual_items(p_list_id uuid, p_limit int default 8)
returns table (name text, times int)
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_list_member(p_list_id) then
    return; -- empty result set; no rows touched before this check
  end if;

  return query
  select agg.name, agg.times
  from (
    select
      (array_agg(e.name order by e.created_at desc))[1] as name,
      count(*)::int as times,
      e.name_normalized
    from public.item_events e
    where e.list_id = p_list_id
    group by e.name_normalized
  ) agg
  where not exists (
    select 1 from public.items i
    where i.list_id = p_list_id
      and lower(trim(i.name)) = agg.name_normalized
  )
  order by agg.times desc
  limit p_limit;
end;
$fn$;

revoke execute on function public.create_list(text, text) from anon;
revoke execute on function public.accept_pending_invites() from anon;
revoke execute on function public.suggest_usual_items(uuid, int) from anon;

-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.lists enable row level security;
alter table public.list_members enable row level security;
alter table public.list_invites enable row level security;
alter table public.items enable row level security;
alter table public.item_events enable row level security;

-- profiles: read own + list-mates; write only own row
create policy "profiles_select" on public.profiles for select
  to authenticated
  using (id = public.clerk_user_id() or public.shares_list_with(id));
create policy "profiles_insert_self" on public.profiles for insert
  to authenticated
  with check (id = public.clerk_user_id());
create policy "profiles_update_self" on public.profiles for update
  to authenticated
  using (id = public.clerk_user_id()) with check (id = public.clerk_user_id());

-- lists: members read; owner-only insert/rename/archive/delete
create policy "lists_select_member" on public.lists for select
  to authenticated
  using (owner_id = public.clerk_user_id() or public.is_list_member(id));
create policy "lists_insert_owner" on public.lists for insert
  to authenticated
  with check (owner_id = public.clerk_user_id());
create policy "lists_update_owner" on public.lists for update
  to authenticated
  using (owner_id = public.clerk_user_id()) with check (owner_id = public.clerk_user_id());
create policy "lists_delete_owner" on public.lists for delete
  to authenticated
  using (owner_id = public.clerk_user_id());

-- list_members: members read; owner bootstraps own row (create_list RPC);
-- invited members are inserted by accept_pending_invites (security definer);
-- owner can remove members (but not owner row).
create policy "members_select_member" on public.list_members for select
  to authenticated
  using (public.is_list_member(list_id));
create policy "members_insert_owner_self" on public.list_members for insert
  to authenticated
  with check (
    user_id = public.clerk_user_id()
    and exists (select 1 from public.lists l where l.id = list_id and l.owner_id = public.clerk_user_id())
  );
create policy "members_delete_by_owner" on public.list_members for delete
  to authenticated
  using (
    role = 'member'
    and exists (select 1 from public.lists l where l.id = list_id and l.owner_id = public.clerk_user_id())
  );

-- list_invites: members read + create for their lists (server route also passes user-scoped client)
create policy "invites_select_member" on public.list_invites for select
  to authenticated
  using (public.is_list_member(list_id));
create policy "invites_insert_member" on public.list_invites for insert
  to authenticated
  with check (public.is_list_member(list_id) and invited_by = public.clerk_user_id());

-- items: full CRUD for members
create policy "items_select_member" on public.items for select
  to authenticated
  using (public.is_list_member(list_id));
create policy "items_insert_member" on public.items for insert
  to authenticated
  with check (public.is_list_member(list_id) and created_by = public.clerk_user_id());
create policy "items_update_member" on public.items for update
  to authenticated
  using (public.is_list_member(list_id)) with check (public.is_list_member(list_id));
create policy "items_delete_member" on public.items for delete
  to authenticated
  using (public.is_list_member(list_id));

-- item_events: members read-only; the trigger (security definer) is the sole write path
create policy "item_events_select_member" on public.item_events for select
  to authenticated
  using (public.is_list_member(list_id));

-- ============ REALTIME (items) ============
-- replica identity full so DELETE/UPDATE events carry the row (needed for list_id filtering)
alter table public.items replica identity full;
alter publication supabase_realtime add table public.items;
