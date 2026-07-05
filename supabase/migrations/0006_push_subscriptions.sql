-- Web push subscription storage (Tier 3).

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated
  using (user_id = public.clerk_user_id());

create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated
  with check (user_id = public.clerk_user_id());

create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update to authenticated
  using (user_id = public.clerk_user_id())
  with check (user_id = public.clerk_user_id());

create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated
  using (user_id = public.clerk_user_id());
