-- 0015_fix_public_reserve_search_path.sql — fix reserve/release RPCs erroring
-- on every call.
--
-- 0014 created reserve_public_item/release_public_item as
-- `security definer set search_path = public`, but this project's pgcrypto
-- extension (gen_random_bytes, digest) lives in the `extensions` schema, not
-- `public` (see supabase/config.toml `extra_search_path`). A security
-- definer function's search_path is NOT the session's extra_search_path —
-- it's exactly what `set search_path` says — so every call to
-- gen_random_bytes()/digest() raised "function does not exist", which the
-- route layer silently mislabeled as "item invalid". Widening search_path to
-- include `extensions` fixes both functions; bodies and grants are otherwise
-- byte-for-byte identical to 0014.

create or replace function public.reserve_public_item(p_token text, p_item_id uuid, p_label text)
returns table (ok boolean, secret text)
language plpgsql security definer set search_path = public, extensions as $fn$
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

create or replace function public.release_public_item(p_item_id uuid, p_secret text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $fn$
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
