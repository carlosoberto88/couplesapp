-- Wishlist: enriched item fields, images, and private storage bucket.

alter table public.items
  add column url text,
  add column reserved_by text references public.profiles(id) on delete set null,
  add column reserved_at timestamptz,
  add column price numeric(10, 2),
  add column currency text default 'USD',
  add column priority text check (priority is null or priority in ('must_have', 'nice_to_have'));

create table public.item_images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0,
  created_by text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index item_images_item_idx on public.item_images (item_id, sort_order);

alter table public.item_images enable row level security;

create policy "item_images_select_member" on public.item_images
  for select to authenticated
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id and public.is_list_member(i.list_id)
    )
  );

create policy "item_images_insert_member" on public.item_images
  for insert to authenticated
  with check (
    created_by = public.clerk_user_id()
    and exists (
      select 1 from public.items i
      where i.id = item_id and public.is_list_member(i.list_id)
    )
  );

create policy "item_images_delete_member" on public.item_images
  for delete to authenticated
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id and public.is_list_member(i.list_id)
    )
  );

-- Private bucket for wishlist photos (path: {list_id}/{item_id}/{uuid}.ext)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-images',
  'item-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "item_images_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'item-images'
    and public.is_list_member((storage.foldername(name))[1]::uuid)
  );

create policy "item_images_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'item-images'
    and public.is_list_member((storage.foldername(name))[1]::uuid)
  );

create policy "item_images_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'item-images'
    and public.is_list_member((storage.foldername(name))[1]::uuid)
  );

alter table public.item_images replica identity full;
alter publication supabase_realtime add table public.item_images;
