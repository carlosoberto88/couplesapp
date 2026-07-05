alter table public.items
  add column skip_push boolean not null default false;
