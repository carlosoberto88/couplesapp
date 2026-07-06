-- 0012_recurring_lists.sql — reusable (recurring) shopping lists + soft-delete items
-- Recurring lists keep staples across shopping trips ("Finish shopping" resets
-- checked state instead of clearing the list). Items gain is_extra (a staple vs.
-- a one-trip extra) and removed_at (soft delete) so nothing is ever hard-deleted
-- on checkout or item removal — removed rows are kept for future shopping history.

alter table public.lists
  add column recurring boolean not null default false;

alter table public.items
  add column is_extra boolean not null default false,
  add column removed_at timestamptz; -- null = active; set = soft-removed. No default: existing rows backfill to null.

-- create_list gains an optional recurring flag. Drop the 2-arg version first so
-- PostgREST RPC resolution stays unambiguous (same pattern as 0003). Body is
-- otherwise unchanged from 0003_clerk_identity_reset.sql.
drop function if exists public.create_list(text, text);

create or replace function public.create_list(p_name text, p_type text, p_recurring boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if public.clerk_user_id() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.lists (name, type, owner_id, recurring)
  values (p_name, p_type, public.clerk_user_id(), coalesce(p_recurring, false))
  returning id into v_id;
  insert into public.list_members (list_id, user_id, role)
  values (v_id, public.clerk_user_id(), 'owner');
  return v_id;
end;
$fn$;

revoke execute on function public.create_list(text, text, boolean) from anon;

-- suggest_usual_items excludes names already on the list via a NOT EXISTS
-- subquery on public.items. Re-created here (same body as 0003) with one
-- change: a soft-removed item (removed_at set) must not block its own
-- re-suggestion, so the exclusion subquery only matches active rows.
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
      and i.removed_at is null
      and lower(trim(i.name)) = agg.name_normalized
  )
  order by agg.times desc
  limit p_limit;
end;
$fn$;
