-- 0009_feedback_submissions.sql — user suggestions and bug reports

create table public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('suggestion', 'bug')),
  message text not null check (length(trim(message)) between 10 and 4000),
  page_url text,
  user_agent text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index feedback_submissions_status_created_idx
  on public.feedback_submissions (status, created_at desc);

alter table public.feedback_submissions enable row level security;

create policy "feedback_insert_self" on public.feedback_submissions
  for insert
  with check (user_id = public.clerk_user_id());
