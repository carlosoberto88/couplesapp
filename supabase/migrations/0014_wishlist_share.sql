-- 0014_wishlist_share.sql — public shareable wishlist link + guest reservations.
-- Lets an owner mint a share_token (app-side, e.g. crypto.randomBytes(16).toString('hex'))
-- so anyone with the link can view and reserve wishlist items without a couples
-- account. Guests have no profiles row, so their reservations live in a side
-- table (guest_reservations) keyed by a bearer secret (sha256 hashed) instead of
-- a user id. All public access goes through the security definer RPCs below —
-- there are no anon RLS policies anywhere in this migration.
--
-- Grants are fully explicit per function (revoke from public/anon/authenticated,
-- then grant only to the intended role(s) — see note above the first revoke
-- below) rather than relying on the implicit-PUBLIC-then-revoke-from-anon
-- convention used in 0003 — this migration's RPCs are anon-reachable by
-- design, so the grant matrix needs to be auditable at a glance.

create extension if not exists pgcrypto; -- digest() / gen_random_bytes() for guest secrets

-- ============ lists: on-demand share token ============
alter table public.lists
  add column share_token text unique, -- null = not shared
  add constraint lists_share_token_wishlist_only
    check (share_token is null or type = 'wishlist'); -- token can't survive a type change

-- ============ guest_reservations ============
-- Guests reserving from a public link have no profiles row, so their
-- reservation can't live in items.reserved_by (which references profiles).
create table public.guest_reservations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references public.items(id) on delete cascade, -- unique = double-reserve backstop
  guest_label text check (guest_label is null or length(guest_label) <= 80),
  guest_secret_hash text not null, -- sha256 hex of the bearer secret; never store plaintext
  created_at timestamptz not null default now()
);

alter table public.guest_reservations enable row level security;
-- No anon/authenticated policies: this table is reachable ONLY through the
-- security definer RPCs below (mirrors public.link_preview_cache, 0011).

-- ============ RPC: get_public_wishlist ============
-- Uniform empty result for a bad, revoked, wrong-type, or archived token — no
-- oracle that would let a caller distinguish "wrong token" from "empty list".
create or replace function public.get_public_wishlist(p_token text, p_viewer_id text default null)
returns table (
  list_name text,
  owner_display_name text,
  item_id uuid,
  name text,
  note text,
  url text,
  price numeric,
  currency text,
  priority text,
  "position" double precision,
  created_at timestamptz,
  is_reserved boolean,
  images jsonb
)
language plpgsql security definer set search_path = public as $fn$
declare
  v_list_id uuid;
  v_owner_id text;
  v_list_name text;
  v_owner_display_name text;
begin
  select l.id, l.owner_id, l.name, p.display_name
    into v_list_id, v_owner_id, v_list_name, v_owner_display_name
  from public.lists l
  join public.profiles p on p.id = l.owner_id
  where l.share_token = p_token
    and l.type = 'wishlist'
    and l.archived_at is null;

  if v_list_id is null then
    return; -- bad/revoked/wrong-type/archived token: same empty result every time
  end if;

  return query
  select
    v_list_name,
    v_owner_display_name,
    i.id,
    i.name,
    i.note,
    i.url,
    i.price,
    i.currency,
    i.priority,
    i.position,
    i.created_at,
    case
      when p_viewer_id is not null and p_viewer_id = v_owner_id then null
      else i.reserved_by is not null
        or exists (select 1 from public.guest_reservations g where g.item_id = i.id)
    end,
    coalesce(
      (select jsonb_agg(img.storage_path order by img.sort_order)
       from public.item_images img where img.item_id = i.id),
      '[]'::jsonb
    )
  from public.items i
  where i.list_id = v_list_id
    and i.removed_at is null
  order by i.position;
end;
$fn$;

-- Supabase's default privileges auto-grant EXECUTE to anon/authenticated/
-- service_role on every function created by this role in schema public
-- (see pg_default_acl) — a plain `revoke ... from public` does NOT touch
-- those per-role grants, so every function below revokes from the named
-- roles explicitly, not just from public.
revoke execute on function public.get_public_wishlist(text, text) from public, anon, authenticated;
grant execute on function public.get_public_wishlist(text, text) to anon, authenticated;

-- ============ RPC: reserve_public_item ============
-- anon-only: a guest reserving via a share link never has a Clerk session.
create or replace function public.reserve_public_item(p_token text, p_item_id uuid, p_label text)
returns table (ok boolean, secret text)
language plpgsql security definer set search_path = public as $fn$
declare
  v_list_id uuid;
  v_secret text;
begin
  select id into v_list_id
  from public.lists
  where share_token = p_token and type = 'wishlist' and archived_at is null;

  if v_list_id is null then
    return query select false, null::text;
    return;
  end if;

  perform 1 from public.items
  where id = p_item_id and list_id = v_list_id and removed_at is null
  for update; -- lock the row before checking/claiming it

  if not found then
    return query select false, null::text;
    return;
  end if;

  if exists (select 1 from public.items where id = p_item_id and reserved_by is not null)
    or exists (select 1 from public.guest_reservations where item_id = p_item_id)
  then
    return query select false, null::text;
    return;
  end if;

  v_secret := encode(gen_random_bytes(16), 'hex');

  begin
    insert into public.guest_reservations (item_id, guest_label, guest_secret_hash)
    values (p_item_id, nullif(trim(p_label), ''), encode(digest(v_secret, 'sha256'), 'hex'));
  exception when unique_violation then
    -- lost a race to another guest between the lock check above and this insert
    return query select false, null::text;
    return;
  end;

  return query select true, v_secret; -- raw secret returned to the guest exactly once
end;
$fn$;

revoke execute on function public.reserve_public_item(text, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_public_item(text, uuid, text) to anon;

-- ============ RPC: release_public_item ============
-- anon-only. Generic boolean result — doesn't distinguish wrong-secret from
-- not-found, so a caller can't use it to probe for valid item ids.
create or replace function public.release_public_item(p_item_id uuid, p_secret text)
returns boolean
language plpgsql security definer set search_path = public as $fn$
declare
  v_count integer;
begin
  delete from public.guest_reservations
  where item_id = p_item_id
    and guest_secret_hash = encode(digest(p_secret, 'sha256'), 'hex');
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$fn$;

revoke execute on function public.release_public_item(uuid, text) from public, anon, authenticated;
grant execute on function public.release_public_item(uuid, text) to anon;

-- ============ RPC: reserve_item_as_member ============
-- Replaces the unguarded items.update() member-reserve path
-- (lib/item-mutations.ts buildReservePatch): locks the item row and checks for
-- a guest_reservations row first, so a member and a guest can't both win a
-- simultaneous reserve on the same item.
create or replace function public.reserve_item_as_member(p_item_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $fn$
declare
  v_list_id uuid;
begin
  select list_id into v_list_id
  from public.items
  where id = p_item_id and removed_at is null
  for update;

  if v_list_id is null then
    raise exception 'item not found';
  end if;

  if not public.is_list_member(v_list_id) then
    raise exception 'not a member of this list';
  end if;

  if exists (select 1 from public.guest_reservations where item_id = p_item_id) then
    return false; -- a guest already holds this item
  end if;

  update public.items
  set reserved_by = public.clerk_user_id(), reserved_at = now()
  where id = p_item_id and reserved_by is null;

  return found; -- false if another member won the race first
end;
$fn$;

revoke execute on function public.reserve_item_as_member(uuid) from public, anon, authenticated;
grant execute on function public.reserve_item_as_member(uuid) to authenticated;

-- ============ TRIGGER: soft-delete cleanup ============
-- guest_reservations has no RLS policies, so a member's client can't delete its
-- rows directly. Security definer so the delete goes through regardless of the
-- caller soft-deleting the item (mirrors log_item_event, 0003).
create or replace function public.cleanup_guest_reservations()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  delete from public.guest_reservations where item_id = new.id;
  return new;
end;
$fn$;

create trigger on_item_soft_deleted
  after update of removed_at on public.items
  for each row
  when (old.removed_at is null and new.removed_at is not null)
  execute function public.cleanup_guest_reservations();
