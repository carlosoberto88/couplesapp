-- 0018_partnerships.sql — couples: partner-pairing foundation.
-- Adds email-keyed partner invites, a canonical-ordered partnerships table,
-- and a partnership_members bookkeeping table that is the SOLE guarantee of
-- "at most one active partner per user" (user_id is its primary key, so a
-- concurrent double-pair fails atomically with unique_violation on insert).
-- The partnerships.user_low/user_high unique partial indexes are a backstop,
-- not the primary guarantee. Acceptance runs through a SECURITY DEFINER RPC
-- so an invitee with no prior relationship to the inviter can still pair.

-- ============ TABLES ============
create table public.partner_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id text not null references public.profiles(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at timestamptz not null default now()
);

create index partner_invites_inviter_idx       on public.partner_invites (inviter_id);
create index partner_invites_pending_email_idx on public.partner_invites (lower(email)) where status = 'pending';
create unique index partner_invites_uniq_pending on public.partner_invites (inviter_id, lower(email)) where status = 'pending';

create table public.partnerships (
  id uuid primary key default gen_random_uuid(),
  user_low text not null references public.profiles(id) on delete cascade,
  user_high text not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','ended')),
  label text,
  created_by text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (user_low < user_high)
);

-- Backstop indexes only — partnership_members (below) is what actually
-- enforces "at most one active partner per user" atomically.
create unique index partnerships_active_low  on public.partnerships (user_low)  where status = 'active';
create unique index partnerships_active_high on public.partnerships (user_high) where status = 'active';

-- Bookkeeping table maintained solely by sync_partnership_members() below.
-- user_id is the PRIMARY KEY (not (user_id, partnership_id)) so a user can
-- appear in at most one row, ever — this is the real one-partner guarantee.
create table public.partnership_members (
  user_id text primary key references public.profiles(id) on delete cascade,
  partnership_id uuid not null references public.partnerships(id) on delete cascade
);

create index partnership_members_partnership_idx on public.partnership_members (partnership_id);

-- ============ TRIGGERS ============
-- Keeps partnership_members in sync with partnerships.status. SECURITY
-- DEFINER because clients never write partnership_members directly (no
-- policies on it — see RLS section). The insert here is the atomic guard:
-- a second concurrent activation for either user_low or user_high hits the
-- partnership_members primary key and raises unique_violation.
create or replace function public.sync_partnership_members()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'INSERT' and new.status = 'active' then
    insert into public.partnership_members (user_id, partnership_id)
    values (new.user_low, new.id), (new.user_high, new.id);
  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status = 'ended' then
    delete from public.partnership_members where partnership_id = new.id;
  end if;
  return new;
end;
$fn$;

create trigger on_partnership_sync_members
  after insert or update on public.partnerships
  for each row execute function public.sync_partnership_members();

-- user_low, user_high, and created_by are set once at creation and must
-- never change (unpairing is status='ended', not a row swap). RAISE rather
-- than silently pinning so a bug that attempts this surfaces immediately.
-- Also blocks ended->active reactivation via direct UPDATE (must go
-- through accept_pending_partner_invites(), which re-inserts a row and so
-- goes through the partnership_members one-partner guard; a direct status
-- flip here would bypass it, since sync_partnership_members() has no
-- reactivation branch) and keeps ended_at consistent with status.
create or replace function public.pin_partnership_immutable_columns()
returns trigger
language plpgsql as $fn$
begin
  if new.user_low <> old.user_low or new.user_high <> old.user_high or new.created_by <> old.created_by then
    raise exception 'partnerships: user_low, user_high, and created_by are immutable';
  end if;
  if old.status = 'ended' and new.status = 'active' then
    raise exception 'partnerships: cannot reactivate an ended partnership directly';
  end if;
  if new.status = 'ended' and new.ended_at is null then
    new.ended_at := now();
  elsif new.status = 'active' and new.ended_at is not null then
    new.ended_at := null;
  end if;
  return new;
end;
$fn$;

create trigger on_partnership_pin_immutable
  before update on public.partnerships
  for each row execute function public.pin_partnership_immutable_columns();

-- ============ HELPERS ============
-- Implemented against partnership_members (not partnerships) since it is
-- the single source of truth for "who is paired with whom right now".
create or replace function public.active_partnership_id()
returns uuid
language sql stable security definer set search_path = public as $fn$
  select partnership_id from public.partnership_members where user_id = public.clerk_user_id();
$fn$;

create or replace function public.is_partnership_member(p_partnership_id uuid)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1
    from public.partnership_members pm
    join public.partnerships p on p.id = pm.partnership_id
    where pm.partnership_id = p_partnership_id
      and pm.user_id = public.clerk_user_id()
      and p.status = 'active'
  );
$fn$;

create or replace function public.active_partner_id()
returns text
language sql stable security definer set search_path = public as $fn$
  select pm.user_id
  from public.partnership_members pm
  where pm.partnership_id = public.active_partnership_id()
    and pm.user_id <> public.clerk_user_id();
$fn$;

-- ============ RPCs ============
-- Invite reconciliation: pending invites for MY email -> partnerships.
-- Idempotent (safe to run on every sign-in). Mirrors accept_pending_invites()
-- for the JWT-email read (Clerk Dashboard -> Sessions -> Customize session
-- token must expose an `email` claim).
--
-- Each candidate acceptance is wrapped in its own sub-block with an
-- exception handler: a lost race can violate either the partial unique
-- indexes on partnerships OR the partnership_members primary key, and both
-- surface here as unique_violation on the partnerships insert (the
-- sync_partnership_members trigger runs inside the same statement). This is
-- deliberately NOT a single-arbiter `on conflict` — either party could be
-- the one who loses the race, and the loser's invite is simply revoked.
create or replace function public.accept_pending_partner_invites()
returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_me text := public.clerk_user_id();
  v_count integer := 0;
  inv record;
  v_low text;
  v_high text;
begin
  if v_me is null or v_email = '' then
    return 0;
  end if;

  for inv in
    select id, inviter_id from public.partner_invites
    where lower(email) = v_email and status = 'pending'
  loop
    if inv.inviter_id = v_me then
      update public.partner_invites set status = 'revoked' where id = inv.id;
      continue;
    end if;

    if exists (
      select 1 from public.partnership_members
      where user_id = inv.inviter_id or user_id = v_me
    ) then
      update public.partner_invites set status = 'revoked' where id = inv.id;
      continue;
    end if;

    if inv.inviter_id < v_me then
      v_low := inv.inviter_id;
      v_high := v_me;
    else
      v_low := v_me;
      v_high := inv.inviter_id;
    end if;

    begin
      insert into public.partnerships (user_low, user_high, status, label, created_by)
      values (v_low, v_high, 'active', null, inv.inviter_id);
      update public.partner_invites set status = 'accepted' where id = inv.id;
      v_count := v_count + 1;
    exception when unique_violation then
      update public.partner_invites set status = 'revoked' where id = inv.id;
      continue;
    end;
  end loop;

  return v_count;
end;
$fn$;

revoke execute on function public.accept_pending_partner_invites() from anon;

-- ============ RLS ============
alter table public.partner_invites enable row level security;
alter table public.partnerships enable row level security;
alter table public.partnership_members enable row level security;
-- partnership_members has NO policies: it is internal bookkeeping written
-- only by the SECURITY DEFINER trigger above, so RLS default-deny is correct.

-- partner_invites: inviter reads/creates their own invites; the invitee
-- never selects directly — acceptance happens via accept_pending_partner_invites().
create policy "partner_invites_select_inviter" on public.partner_invites for select
  to authenticated
  using (inviter_id = public.clerk_user_id());
create policy "partner_invites_insert_inviter" on public.partner_invites for insert
  to authenticated
  with check (inviter_id = public.clerk_user_id());
-- Owner can revoke pending invites (soft delete via status = 'revoked').
create policy "partner_invites_update_revoke" on public.partner_invites for update
  to authenticated
  using (inviter_id = public.clerk_user_id() and status = 'pending')
  with check (status = 'revoked');

-- inviter_id/email are set once at creation and must never change; the
-- update-revoke policy above cannot pin them via its with check, so an
-- inviter could otherwise rewrite these columns in the same UPDATE that
-- revokes the row.
create or replace function public.pin_partner_invite_identity()
returns trigger
language plpgsql as $fn$
begin
  if new.inviter_id <> old.inviter_id or new.email <> old.email then
    raise exception 'partner_invites: inviter_id and email are immutable';
  end if;
  return new;
end;
$fn$;

create trigger on_partner_invite_pin_identity
  before update on public.partner_invites
  for each row execute function public.pin_partner_invite_identity();

-- partnerships: either partner reads and updates (label/unpair); the
-- immutable-column guard is the BEFORE UPDATE trigger, not this policy.
-- No insert/delete policy: creation is only via the accept RPC above,
-- and unpairing is an update to status = 'ended' — RLS default-deny
-- handles both directly-attempted paths.
create policy "partnerships_select_member" on public.partnerships for select
  to authenticated
  using (public.clerk_user_id() in (user_low, user_high));
create policy "partnerships_update_member" on public.partnerships for update
  to authenticated
  using (public.clerk_user_id() in (user_low, user_high))
  with check (public.clerk_user_id() in (user_low, user_high));
