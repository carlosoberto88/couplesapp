-- 0021: let a paired user read their active partner's profile (e.g. display_name)
-- even when they share no list. Adds are_partners() and folds it into profiles_select.

-- Mirrors shares_list_with()'s SECURITY DEFINER pattern: partnership_members has NO
-- RLS policies (default-deny bookkeeping table per 0018), so without SECURITY DEFINER
-- this would always see zero rows for the invoking role and silently return false.
create or replace function public.are_partners(p_profile_id text)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1
    from public.partnership_members me
    join public.partnership_members them on them.partnership_id = me.partnership_id
    where me.user_id = public.clerk_user_id()
      and them.user_id = p_profile_id
      and me.user_id <> them.user_id
  );
$fn$;

revoke execute on function public.are_partners(text) from anon;

drop policy "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  to authenticated
  using (
    id = public.clerk_user_id()
    or public.shares_list_with(id)
    or public.are_partners(id)
  );
