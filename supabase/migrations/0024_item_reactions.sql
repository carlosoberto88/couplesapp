-- Emoji reactions on items: each user may independently toggle each emoji
-- once per item (multiset model, insert/delete only, no update). Mirrors
-- item_images (0007) end-to-end, except delete is scoped to the owning user.

create table public.item_reactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '👍')),
  created_at timestamptz not null default now(),
  unique (item_id, user_id, emoji)
);

create index item_reactions_item_idx on public.item_reactions (item_id);

alter table public.item_reactions enable row level security;

create policy "item_reactions_select_member" on public.item_reactions
  for select to authenticated
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id and public.is_list_member(i.list_id)
    )
  );

create policy "item_reactions_insert_member" on public.item_reactions
  for insert to authenticated
  with check (
    user_id = public.clerk_user_id()
    and exists (
      select 1 from public.items i
      where i.id = item_id and public.is_list_member(i.list_id)
    )
  );

create policy "item_reactions_delete_member" on public.item_reactions
  for delete to authenticated
  using (
    user_id = public.clerk_user_id()
    and exists (
      select 1 from public.items i
      where i.id = item_id and public.is_list_member(i.list_id)
    )
  );

alter table public.item_reactions replica identity full;
alter publication supabase_realtime add table public.item_reactions;
