-- Realtime for lists, members, and invites.

alter table public.lists replica identity full;
alter table public.list_members replica identity full;
alter table public.list_invites replica identity full;

alter publication supabase_realtime add table public.lists;
alter publication supabase_realtime add table public.list_members;
alter publication supabase_realtime add table public.list_invites;
