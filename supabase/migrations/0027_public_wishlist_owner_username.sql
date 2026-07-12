-- 0027_public_wishlist_owner_username.sql — show the owner's username, not
-- their email, on the public (unauthenticated) wishlist share page.
--
-- get_public_wishlist (0014) is a SECURITY DEFINER RPC reachable by anon, so
-- whatever it returns as the owner's name is exposed to anyone with the share
-- link. It previously selected p.display_name (always null today), which
-- hid the owner line entirely. profiles.username (0026) is a chosen public
-- handle, so it's safe to show here — profiles.email is NOT, and must never
-- be selected by this function.
--
-- This redefines get_public_wishlist with the SAME signature, return columns,
-- and body as 0014, changing only the owner-name expression from
-- p.display_name to coalesce(p.username, p.display_name).

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
  select l.id, l.owner_id, l.name, coalesce(p.username, p.display_name)
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

-- Re-run 0014's exact grant matrix: create-or-replace does not change
-- existing grants, but this keeps the migration self-contained/auditable and
-- guarantees anon retains access for the guest reservation flow.
revoke execute on function public.get_public_wishlist(text, text) from public, anon, authenticated;
grant execute on function public.get_public_wishlist(text, text) to anon, authenticated;
