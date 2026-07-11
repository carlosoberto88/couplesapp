-- 0023_item_assignment.sql — assign a shopping-list item to a member (self or
-- partner) so the row can be tinted in that member's color. Mirrors the
-- created_by/checked_by/reserved_by "who" column pattern (0003, 0007).
-- No RPC needed: unlike reserved_by (0014), there is no reservation race to
-- guard — a plain client update through items_update_member RLS is enough,
-- same as checked_by.

alter table public.items
  add column assigned_to text references public.profiles(id) on delete set null;

-- Tighten items_update_member's WITH CHECK so assigned_to can only be set to
-- a real member of the item's list (the FK alone only guarantees *a* real
-- profile exists somewhere, not that it belongs to this list).
drop policy "items_update_member" on public.items;
create policy "items_update_member" on public.items for update
  to authenticated
  using (public.is_list_member(list_id))
  with check (
    public.is_list_member(list_id)
    and (
      assigned_to is null
      or exists (
        select 1 from public.list_members lm
        where lm.list_id = items.list_id and lm.user_id = assigned_to
      )
    )
  );

-- Same invariant applies on INSERT — without this, a member could bypass the
-- update-time check by assigning a non-member straight away at creation time.
drop policy "items_insert_member" on public.items;
create policy "items_insert_member" on public.items for insert
  to authenticated
  with check (
    public.is_list_member(list_id)
    and created_by = public.clerk_user_id()
    and (
      assigned_to is null
      or exists (
        select 1 from public.list_members lm
        where lm.list_id = items.list_id and lm.user_id = assigned_to
      )
    )
  );

-- When a member is removed from a list (list_members row deleted), null out
-- any items on that list still assigned to them. The FK's `on delete set null`
-- only fires on profiles deletion (full account removal), NOT on leaving a
-- list — without this, the tightened items_update_member WITH CHECK above would
-- reject every subsequent update to those items (check-off, rename, reorder,
-- remove), permanently freezing them with no in-app recovery.
create or replace function public.clear_assignment_on_member_removed()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  update public.items
    set assigned_to = null
    where list_id = old.list_id and assigned_to = old.user_id;
  return old;
end;
$fn$;

create trigger on_member_removed_clear_assignment
  after delete on public.list_members
  for each row execute function public.clear_assignment_on_member_removed();
