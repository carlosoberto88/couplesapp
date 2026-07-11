-- 0020_drop_list_occasion_columns.sql — couples: drop vestigial list occasion columns.
-- occasion_date/occasion_label/celebrant_user_id (0017) were the abandoned
-- occasion-per-wishlist approach, superseded by the partnership-scoped
-- occasions table (0019) with its own celebrant_user_id and linked_list_id.

alter table public.lists
  drop column occasion_date,
  drop column occasion_label,
  drop column celebrant_user_id;
