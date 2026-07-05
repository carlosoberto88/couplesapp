-- Cached link preview metadata to avoid re-fetching the same product URL.
create table if not exists public.link_preview_cache (
  url_hash text primary key,
  normalized_url text not null,
  title text,
  price numeric(10, 2),
  currency text,
  image_storage_path text,
  source text not null,
  fetched_at timestamptz not null default now()
);

create index if not exists link_preview_cache_fetched_at_idx
  on public.link_preview_cache (fetched_at);

alter table public.link_preview_cache enable row level security;

-- No user-facing policies: only service role reads/writes this cache.
