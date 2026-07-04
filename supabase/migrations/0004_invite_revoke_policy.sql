-- Owner can revoke pending invites (soft delete via status = 'revoked').

create policy "invites_update_by_owner" on public.list_invites
  for update to authenticated
  using (
    status = 'pending'
    and exists (
      select 1 from public.lists l
      where l.id = list_id and l.owner_id = public.clerk_user_id()
    )
  )
  with check (status = 'revoked');
