-- 0002_ai_features.sql — couples: item categories, item event log, usual-items RPC

-- ============ TABLES ============
create table public.item_events (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  name text not null,
  name_normalized text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index item_events_list_name_idx on public.item_events (list_id, name_normalized);

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

revoke execute on function public.suggest_usual_items(uuid, int) from anon;

-- ============ RLS ============
alter table public.item_events enable row level security;

-- item_events: members read-only; the trigger (security definer) is the sole write path
create policy "item_events_select_member" on public.item_events for select
  using (public.is_list_member(list_id));
