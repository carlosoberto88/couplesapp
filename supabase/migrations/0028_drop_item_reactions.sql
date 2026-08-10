-- 0028_drop_item_reactions.sql — couples: remove the ❤️/👍 item reactions feature.
-- Reverses 0024 in full. The feature is gone from the UI (no reaction pills, no
-- realtime channel); this drops its only storage. No data is preserved.

drop table if exists public.item_reactions;
