-- 0022_notifications.sql — durable in-app notification inbox.
-- Persists regardless of whether the recipient has web-push enabled.
-- Rows are written only by the service-role admin client in lib/notify.ts
-- (RLS bypassed); there is deliberately no INSERT policy for authenticated.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications for select
  to authenticated
  using (user_id = public.clerk_user_id());

create policy "notifications_update_own" on public.notifications for update
  to authenticated
  using (user_id = public.clerk_user_id())
  with check (user_id = public.clerk_user_id());

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications replica identity full;
alter publication supabase_realtime add table public.notifications;
