-- 0013_item_aisle_position.sql — aisle tagging for shopping-list items.
-- items.position already exists (0001, double precision not null default 0);
-- no change needed there. This migration only adds the new aisle label.

alter table public.items
  add column aisle text; -- null = untagged; short free label like '3' or 'Dairy'
