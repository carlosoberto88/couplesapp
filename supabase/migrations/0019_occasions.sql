-- 0019_occasions.sql — couples: shared occasions (birthdays, anniversaries, etc).
-- Adds an occasions table scoped to a partnership, with an optional celebrant
-- (must be a member of that partnership) and an optional linked wishlist
-- (must be visible to BOTH partners, so the PR3 reminder cron never leaks a
-- third party's item names to a partner who has no access to that list).
-- The two validation helpers back both INSERT and UPDATE with check clauses
-- so the checks can't drift apart.

-- ============ TABLES ============
create table public.occasions (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  occasion_date date not null,
  recurring boolean not null default true,
  category text check (category in ('birthday','anniversary','other')) default 'other',
  celebrant_user_id text references public.profiles(id) on delete set null,
  linked_list_id uuid references public.lists(id) on delete set null,
  created_by text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index occasions_partnership_idx on public.occasions (partnership_id);

-- ============ HELPERS ============
create or replace function public.occasion_celebrant_valid(p_partnership_id uuid, p_celebrant_user_id text)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select p_celebrant_user_id is null or (
    public.is_partnership_member(p_partnership_id)
    and exists (
      select 1 from public.partnership_members pm
      where pm.partnership_id = p_partnership_id and pm.user_id = p_celebrant_user_id
    )
  );
$fn$;

-- A linked wishlist must be visible to BOTH partners (caller AND their partner),
-- otherwise the PR3 reminder cron (service-role) could surface a third party's
-- item names to a partner who has no access to that list.
create or replace function public.occasion_linked_list_valid(p_linked_list_id uuid)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select p_linked_list_id is null or (
    public.is_list_member(p_linked_list_id)
    and exists (
      select 1 from public.list_members lm
      where lm.list_id = p_linked_list_id and lm.user_id = public.active_partner_id()
    )
  );
$fn$;

-- ============ RLS ============
alter table public.occasions enable row level security;

create policy "occasions_select_member" on public.occasions for select
  to authenticated using (public.is_partnership_member(partnership_id));

create policy "occasions_insert_member" on public.occasions for insert
  to authenticated with check (
    public.is_partnership_member(partnership_id)
    and created_by = public.clerk_user_id()
    and public.occasion_celebrant_valid(partnership_id, celebrant_user_id)
    and public.occasion_linked_list_valid(linked_list_id)
  );

create policy "occasions_update_member" on public.occasions for update
  to authenticated using (public.is_partnership_member(partnership_id))
  with check (
    public.is_partnership_member(partnership_id)
    and public.occasion_celebrant_valid(partnership_id, celebrant_user_id)
    and public.occasion_linked_list_valid(linked_list_id)
  );

create policy "occasions_delete_member" on public.occasions for delete
  to authenticated using (public.is_partnership_member(partnership_id));
