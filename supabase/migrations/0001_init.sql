-- 0001_init.sql — couples: tables, helpers, trigger, RPCs, RLS, realtime

-- ============ TABLES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  type text not null default 'shopping',
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.list_members (
  list_id uuid not null references public.lists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table public.list_invites (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  email text not null,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  note text,
  position double precision not null default 0,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  checked_by uuid references public.profiles(id) on delete set null,
  checked_at timestamptz
);

create index items_list_created_idx        on public.items (list_id, created_at);
create index list_members_user_idx         on public.list_members (user_id);
create index list_invites_pending_email_idx on public.list_invites (lower(email)) where status = 'pending';
create index lists_owner_idx               on public.lists (owner_id);

-- ============ HELPERS ============
-- SECURITY DEFINER so policies on list_members itself don't recurse.
create or replace function public.is_list_member(p_list_id uuid)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.list_members
    where list_id = p_list_id and user_id = auth.uid()
  );
$fn$;

create or replace function public.shares_list_with(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1
    from public.list_members me
    join public.list_members them on them.list_id = me.list_id
    where me.user_id = auth.uid() and them.user_id = p_profile_id
  );
$fn$;

-- ============ TRIGGER: auth.users -> profiles ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.profiles (id, email)
  values (new.id, lower(new.email))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ RPCs ============
-- Atomic list creation: lists row + owner membership in one call.
create or replace function public.create_list(p_name text, p_type text)
returns uuid
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.lists (name, type, owner_id)
  values (p_name, p_type, auth.uid())
  returning id into v_id;
  insert into public.list_members (list_id, user_id, role)
  values (v_id, auth.uid(), 'owner');
  return v_id;
end;
$fn$;

-- Invite reconciliation: pending invites for MY email -> memberships.
-- Idempotent (safe to run on every sign-in).
create or replace function public.accept_pending_invites()
returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_count integer := 0;
  inv record;
begin
  if auth.uid() is null or v_email = '' then
    return 0;
  end if;
  for inv in
    select id, list_id from public.list_invites
    where lower(email) = v_email and status = 'pending'
  loop
    insert into public.list_members (list_id, user_id, role)
    values (inv.list_id, auth.uid(), 'member')
    on conflict (list_id, user_id) do nothing;
    update public.list_invites set status = 'accepted' where id = inv.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$fn$;

revoke execute on function public.create_list(text, text) from anon;
revoke execute on function public.accept_pending_invites() from anon;

-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.lists enable row level security;
alter table public.list_members enable row level security;
alter table public.list_invites enable row level security;
alter table public.items enable row level security;

-- profiles: read own + list-mates; write only own row
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.shares_list_with(id));
create policy "profiles_insert_self" on public.profiles for insert
  with check (id = auth.uid());
create policy "profiles_update_self" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- lists: members read; owner-only insert/rename/archive/delete
create policy "lists_select_member" on public.lists for select
  using (owner_id = auth.uid() or public.is_list_member(id));
create policy "lists_insert_owner" on public.lists for insert
  with check (owner_id = auth.uid());
create policy "lists_update_owner" on public.lists for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "lists_delete_owner" on public.lists for delete
  using (owner_id = auth.uid());

-- list_members: members read; owner bootstraps own row (create_list RPC);
-- invited members are inserted by accept_pending_invites (security definer);
-- owner can remove members (but not owner row).
create policy "members_select_member" on public.list_members for select
  using (public.is_list_member(list_id));
create policy "members_insert_owner_self" on public.list_members for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.lists l where l.id = list_id and l.owner_id = auth.uid())
  );
create policy "members_delete_by_owner" on public.list_members for delete
  using (
    role = 'member'
    and exists (select 1 from public.lists l where l.id = list_id and l.owner_id = auth.uid())
  );

-- list_invites: members read + create for their lists (server route also passes user-scoped client)
create policy "invites_select_member" on public.list_invites for select
  using (public.is_list_member(list_id));
create policy "invites_insert_member" on public.list_invites for insert
  with check (public.is_list_member(list_id) and invited_by = auth.uid());

-- items: full CRUD for members
create policy "items_select_member" on public.items for select
  using (public.is_list_member(list_id));
create policy "items_insert_member" on public.items for insert
  with check (public.is_list_member(list_id) and created_by = auth.uid());
create policy "items_update_member" on public.items for update
  using (public.is_list_member(list_id)) with check (public.is_list_member(list_id));
create policy "items_delete_member" on public.items for delete
  using (public.is_list_member(list_id));

-- ============ REALTIME (items) ============
-- replica identity full so DELETE/UPDATE events carry the row (needed for list_id filtering)
alter table public.items replica identity full;
alter publication supabase_realtime add table public.items;
