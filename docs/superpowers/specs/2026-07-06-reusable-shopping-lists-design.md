# Reusable Shopping Lists — Design Spec

Date: 2026-07-06
Status: Approved for implementation (rev 2: soft-delete everywhere)
Scope: Spec A only. Aisle/reorder is Spec B and is not designed here.

## Problem

"Clear checked" (`handleClearChecked` in `components/shopping-item-list.tsx`) hard-deletes
checked items. For a weekly groceries list this destroys the list every trip
("la lista se borra") and forces re-typing staples. Lists should be reusable:
finish a trip, keep the staples, reset the checkmarks.

## Design decisions (agreed)

1. Per-list `recurring` boolean; set at create time, toggleable in list settings.
2. Recurring lists get "Finish shopping": resets `checked_at`/`checked_by`, keeps items.
3. Items on recurring lists can be flagged `is_extra` ("just this trip"); extras leave
   the active list on checkout, staples are kept. **Default for new adds: staple**
   (`is_extra = false`).
4. One-off lists keep clear-on-finish behavior, plus a 5s undo toast.
5. Archived lists get de-emphasized in the list index; archive data/actions stay.
6. **Nothing is ever hard-deleted on checkout or item removal.** "Removed" means
   `items.removed_at IS NOT NULL` — a soft delete that preserves rows (and their
   checked state and images) for a future shopping-history view. No history table,
   no history UI in this spec; we only stop destroying the data.

## Architecture

### Schema — migration `supabase/migrations/0012_recurring_lists.sql`

```sql
-- Reusable (recurring) lists: keep staples across shopping trips.
-- Soft-delete items: removed rows are kept for future shopping history.

alter table public.lists
  add column recurring boolean not null default false;

alter table public.items
  add column is_extra boolean not null default false,
  add column removed_at timestamptz;  -- null = active; set = soft-removed

-- create_list gains an optional recurring flag. Drop the 2-arg version first so
-- PostgREST rpc resolution is unambiguous (same pattern as 0003).
drop function if exists public.create_list(text, text);

create or replace function public.create_list(
  p_name text, p_type text, p_recurring boolean default false
)
returns uuid
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if public.clerk_user_id() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.lists (name, type, owner_id, recurring)
  values (p_name, p_type, public.clerk_user_id(), coalesce(p_recurring, false))
  returning id into v_id;
  insert into public.list_members (list_id, user_id, role)
  values (v_id, public.clerk_user_id(), 'owner');
  return v_id;
end;
$fn$;

revoke execute on function public.create_list(text, text, boolean) from anon;

-- suggest_usual_items excludes names "already on the list" via a NOT EXISTS on
-- public.items. A soft-removed item must not block its own re-suggestion, so
-- re-create the RPC (same body as 0003) with the exclusion subquery narrowed:
--   where i.list_id = p_list_id
--     and i.removed_at is null            -- <-- only active rows block
--     and lower(trim(i.name)) = agg.name_normalized
```

Notes:
- `removed_at` is nullable with no default expression: existing rows backfill to
  `null` (active) automatically; new inserts omit it.
- No index on `removed_at` — couple-sized lists, RLS already narrows by list;
  add one later only if a history view needs it.
- The `create_list` body mirrors the current definition in
  `0003_clerk_identity_reset.sql` (Clerk `clerk_user_id()`, not `auth.uid()`).
  Existing callers passing only `p_name`/`p_type` keep working via the default.
- The `from-link` API's cleanup delete (`app/api/items/from-link/route.ts:163`)
  stays a hard delete: it rolls back a *failed insert* (admin client), not a
  user removal — the item never existed from the user's point of view.

### RLS — no policy changes

- `items_update_member` (0003) is `for update using (is_list_member) with check
  (is_list_member)` with no column restrictions — verified. It covers `is_extra`
  toggles **and all `removed_at` stamps/clears** (remove, checkout, undo) by
  either partner. No new policy.
- `lists_update_owner` already covers the `recurring` toggle — owner-only, same
  as rename/archive. Acceptable and consistent; no new policy.
- `items_delete_member` stays defined but the app no longer issues user-facing
  deletes.

### Realtime — no publication changes, client routing changes

`lists` and `items` are already in `supabase_realtime` with `replica identity
full` (0001, 0005). A soft-remove is an UPDATE on an already-published table, so
the publication needs nothing.

**But the client handlers change**: a removal now arrives as an **UPDATE with
`removed_at` set, not a DELETE**. Both realtime hooks currently `onUpsert` every
UPDATE, which would resurrect soft-removed rows in the partner's UI:

- `lib/use-realtime-items.ts` — in the INSERT/UPDATE branch, before calling
  `onUpsert`: if `row.removed_at !== null`, call `onRemove(row.id)` instead,
  fire `onOtherUserRemove(row)` when it is an UPDATE transitioning
  `payload.old.removed_at === null → set` (replica identity full guarantees
  `payload.old` has the column), then return — skipping the add/check/reserve
  toast logic. The DELETE branch stays as-is for legacy/rollback deletes.
  Conversely, an undo arrives as an UPDATE with `removed_at` back to `null` and
  flows through the normal `onUpsert` path — the row reappears for the partner
  with no extra code.
- `lib/use-realtime-all-items.ts` — same routing in its handler: if
  `row.removed_at !== null`, `onRemove(row.id)` and return; otherwise
  `attachListToItem` + `onUpsert` as today.

### Read paths — every active-item query gains `.is("removed_at", null)`

This is the crux of soft delete: any SELECT that feeds an active view must
filter. Complete enumeration (all `from("items")` reads in the repo were
audited):

| Read path | Where the filter goes |
| --- | --- |
| List detail server fetch | `app/(app)/lists/[listId]/page.tsx` items query (`select("*").eq("list_id", …)`) |
| Shopping list client refetch | `refetchAll` in `components/shopping-item-list.tsx` |
| Wishlist client refetch | `refetchAll` in `components/wishlist-item-list.tsx` |
| All Items server fetch | `app/(app)/items/page.tsx` items query (alongside the existing `.is("lists.archived_at", null)`) |
| All Items client refetch | `refetchAll` in `components/all-items-view.tsx` |
| AI parse dedupe | `app/api/ai/parse/route.ts` `select("name").eq("list_id", …)` — otherwise a removed item's name blocks the AI from re-suggesting it |
| Image-refetch id list | `lib/use-item-images.ts` (`select("id").eq("list_id", …)` inside the `item_images` channel handler) — keeps us from fetching images of hidden items |
| Usual-items RPC | server-side, in migration 0012 (`suggest_usual_items` NOT EXISTS subquery) — see schema section |

Not affected: `lib/all-items-utils.ts` filters/sorts already-fetched rows
(inputs are pre-filtered; no change), local `items` state everywhere (seeded
from filtered fetches, pruned by the realtime routing above), `item_events`
(insert-trigger only, no delete trigger — verified in 0002/0003),
`app/api/items/bulk` and `from-link` (inserts).

### Files that change

| File | Change |
| --- | --- |
| `supabase/migrations/0012_recurring_lists.sql` | New (above): `recurring`, `is_extra`, `removed_at`, `create_list` 3-arg, `suggest_usual_items` re-create |
| `lib/types.ts` | `List.recurring: boolean`; `Item.is_extra: boolean`; `Item.removed_at: string \| null` |
| `lib/list-types.ts` | Add `supportsRecurring` to `ListTypeConfig` (`shopping: true`, others `false`) |
| `lib/item-mutations.ts` | Add `"is_extra"` to `ItemUpdatePatch` pick |
| `lib/persist-item.ts` | `buildNewItem`: `is_extra: false`, `removed_at: null` in the optimistic `Item` (insert payloads omit both — DB defaults) |
| `lib/use-realtime-items.ts` | Route UPDATEs with `removed_at` set to `onRemove`/`onOtherUserRemove` (see Realtime) |
| `lib/use-realtime-all-items.ts` | Route UPDATEs with `removed_at` set to `onRemove` |
| `lib/use-item-images.ts` | `removed_at` filter on the item-id select |
| `app/(app)/lists/[listId]/page.tsx` | `removed_at` filter on items fetch; pass `typedList.recurring` down (`select("*")` already fetches it) |
| `app/(app)/items/page.tsx` | `removed_at` filter on items fetch |
| `app/api/ai/parse/route.ts` | `removed_at` filter on the existing-names select |
| `components/shopping-item-list.tsx` | `handleClearChecked` → `handleFinish` (branch on `listRecurring`, stamps not deletes); `handleRemove` stamps `removed_at` and stops calling `deleteItemImages`; `handleUndoRemove` becomes a one-line `update {removed_at: null}` (the old full-column re-insert payload is deleted); `refetchAll` filter; labels |
| `components/all-items-view.tsx` | `handleRemove` stamps `removed_at` (no image delete) + gains the same 5s undo (now trivial); `refetchAll` filter |
| `components/wishlist-item-list.tsx` | `handleRemove` stamps `removed_at` (no image delete); `handleUndoRemove` → clear `removed_at` (drops the re-insert + image re-insert loop); `refetchAll` filter. Wishlists remain untouched by recurring/extras (`supportsRecurring: false`) |
| `components/item-list.tsx` | Thread `listRecurring` prop |
| `components/item-row.tsx` | "One-time" chip when `listRecurring && item.is_extra`; tap chip clears flag |
| `components/item-detail-dialog.tsx` | "Just this trip" switch (recurring lists only), saved via existing edit patch |
| `components/create-list-dialog.tsx` / `create-list-form.tsx` | Recurring toggle shown when `supportsRecurring(type)`; pass `p_recurring` to RPC |
| `components/list-settings-menu.tsx` | Owner toggle "Recurring list" (updates `lists.recurring`); widen `list` prop to include `type` + `recurring` |
| `app/(app)/lists/page.tsx` | Remove `<ListFilter />`; quiet "Archived (n)" link |
| `components/list-filter.tsx` | Delete |
| `messages/en.json`, `messages/es.json` | New keys (finish/reset/undo/chip/toggle/archived link) |
| `scripts/rls-test.ts` | Extend (see Testing) |

## Checkout state machine

One list-level flag, two behaviors for the same button slot (the count-row
button and the "All done" banner button in `shopping-item-list.tsx` — reuse
both, plus the existing `AllDoneCelebration`; no parallel flow). **No path
deletes rows.**

```
                         [some items checked]
                                  |
              +-------------------+-------------------+
              | recurring = false                     | recurring = true
              v                                       v
        "Clear checked"                        "Finish shopping"
   UPDATE all checked items          UPDATE checked staples -> unchecked
   -> removed_at = now()             UPDATE checked extras -> removed_at = now()
   (checked_at/checked_by kept       (checked state kept on removed rows
    on the removed rows)              for future history)
              |                                       |
              +---------- 5s undo toast --------------+
                undo = clear removed_at (+ restore
                staples' checked state on recurring)
```

`handleFinish` (replaces `handleClearChecked`):

1. Snapshot `checkedItems` (full rows) for undo.
2. Optimistic local state: recurring → staples get `checked_at/checked_by`
   nulled, checked extras dropped from state; one-off → all checked dropped.
3. Add ids of rows that will be **soft-removed** to `locallyRemovedIdsRef`
   (existing partner-toast suppression), same 3s window as today.
4. Server, using server-side filters (idempotent; every statement also filters
   `.is("removed_at", null)` so retries and concurrent checkouts match zero
   rows and never touch previously-removed rows):
   - recurring:
     `update {removed_at: now} … eq list_id, eq is_extra=true, not checked_at is null, is removed_at null`
     then
     `update {checked_at: null, checked_by: null} … eq list_id, eq is_extra=false, not checked_at is null, is removed_at null`
   - one-off:
     `update {removed_at: now} … eq list_id, not checked_at is null, is removed_at null`
     (`checked_at`/`checked_by` deliberately kept — that is the history.)
5. On error: restore snapshot locally + retry toast (existing pattern). The two
   recurring statements are not atomic; both are idempotent, so retry reissues
   both safely. A `checkout_list(list_id)` RPC was considered for atomicity and
   rejected — two filtered statements match the existing browser-direct pattern
   and partial failure is benign (retry converges).
6. Success toast with **Undo** (5s, `UNDO_GRACE_MS`) — much simpler than the old
   snapshot/re-insert design because rows still exist:
   - one-off: one `update {removed_at: null}` with `.in("id", snapshotIds)`;
     checked state was never touched, so this is a full restore.
   - recurring: one `update {removed_at: null}` `.in("id", extraIds)` + re-apply
     each staple's original `checked_at`/`checked_by` via per-row updates
     (`Promise.all`; two-person lists, tens of rows max). Undo may clobber
     partner edits made inside the 5s window — accepted for this app size.

Manual single-item remove (`handleRemove` in all three item views): stamp
`removed_at = now()` instead of DELETE; **do not** delete images (they stay
attached to the removed row — history data, and the old undo silently lost them
anyway). Undo = `update {removed_at: null}` — no re-insert, no column list, no
image re-insert.

Ordering after reset: untouched. Staples reappear in the existing
`sortItems` order (unchecked → `created_at` asc). `position` stays unused;
anything smarter is Spec B.

## Staples vs extras

- **Default: staple (`is_extra = false`).** On a recurring list the common case
  is a staple, so the default costs zero taps; one-offs are the exception and
  get an explicit opt-in. A mis-flagged staple self-heals (re-add next trip);
  a mis-flagged extra is one tap to clear.
- **Marking as extra:** "Just this trip" switch in `ItemDetailDialog`, rendered
  only on recurring lists, saved through the existing `handleEdit` /
  `ItemUpdatePatch` path (`{ is_extra: true }`).
- **Unmarking (one tap):** extras show a small "One-time / Solo esta vez" chip
  on the row (`ItemRow`, recurring lists only); tapping the chip toggles the
  flag off via the same edit path. No always-visible per-row control — keeps
  rows clean.
- `is_extra` is meaningless on one-off lists: never rendered, never written.
  Add flows (`buildNewItem`, bulk API, from-link) rely on the DB default; no
  API route changes.

## Archive de-emphasis

- Remove the Active/Archived `<ListFilter />` tabs from `app/(app)/lists/page.tsx`;
  delete `components/list-filter.tsx`.
- Keep the `?filter=archived` handling in the page. When
  `archivedLists.length > 0` and not viewing archived, render one quiet
  text link under the list: "Archived (n)" → `/lists?filter=archived`. The
  archived view keeps a link back to `/lists`.
- `ListSettingsMenu` archive/unarchive/delete actions and `archived_at` column
  are unchanged.

## Edge cases

- **No checked items / empty list:** button hidden (existing `hasChecked`
  gate); nothing new.
- **All items are extras:** finish soft-removes everything → existing
  `EmptyState`; undo restores. Correct, if surprising — the toast copy says
  what happened ("Trip finished — N one-time items removed").
- **All staples:** finish is a pure uncheck; nothing removed; generic toast
  ("List reset for next trip").
- **Concurrent partner checkout / concurrent single remove:** both clients run
  idempotent server-filtered updates; the `is removed_at null` filter makes the
  second match zero rows. Each soft-remove reaches the partner as a realtime
  **UPDATE with `removed_at` set**, which the reworked hook routing turns into
  a local removal (`onRemove`) — not an upsert, so no resurrection.
- **Partner checks an item mid-checkout:** rows checked after the server
  evaluates the filter stay checked; realtime reconciles. Acceptable.
- **Partner toast noise:** unchecks emit no toasts (`onOtherUserCheck` returns
  when `checked_by` is null — verified); soft-removed extras emit
  `removedByOther` toasts via the new UPDATE routing, suppressed locally via
  `locallyRemovedIdsRef` exactly as today's delete toasts were. The
  `old.removed_at === null → set` transition guard prevents toasting on
  unrelated later updates to an already-removed row.
- **Undo clobbering:** undo within 5s clears `removed_at` (and re-applies
  staples' checked state); if the partner edited or re-removed in that window,
  last write wins — same acceptance as the previous design, but with no risk of
  duplicate rows since nothing is re-inserted.
- **Soft-removed item re-added by name later:** a brand-new row (new id) is
  inserted; the old removed row stays as history. `item_events` (insert trigger,
  0002 — verified insert-only) logs the new add, and the 0012 fix to
  `suggest_usual_items` ensures the removed row does not block the suggestion.
  Duplicate names across active + removed rows are fine — every active view
  filters `removed_at`.
- **Legacy DELETE events:** the DELETE branches in both realtime hooks stay, so
  the from-link rollback delete (and any manual DB cleanup) still reconciles.
- **Recurring toggle mid-session:** `lists` realtime + `ListsLiveSync` /
  `ListDetailLiveSync` refresh already propagate; the button relabels on
  refresh. No extra work.

## Testing

No unit-test framework exists; scale accordingly.

1. **RLS (`scripts/rls-test.ts`, `npm run test:rls`):** add cases — member (non-owner)
   can update `items.is_extra` **and `items.removed_at` (stamp and clear) on a
   partner-created item**; non-owner cannot update `lists.recurring`; owner can;
   `create_list` with and without `p_recurring`.
2. **Migration:** apply 0012 to local/staging; confirm existing lists read
   `recurring = false`, items `is_extra = false` **and `removed_at = null`**;
   old 2-arg RPC callers still work; `suggest_usual_items` suggests a name whose
   only rows on the list are soft-removed.
3. **Manual QA checklist (two browsers for realtime):**
   - Recurring list: add staples + one extra → check all → celebration →
     "Finish shopping" → staples unchecked and kept, extra gone from view →
     Undo → exact pre-checkout state. Verify in DB that the extra's row still
     exists with `removed_at` set (before undo) and `checked_at` intact.
   - One-off list: clear-checked hides items (rows kept in DB, checked state
     kept); Undo restores.
   - **Soft-removed items are absent from every active view:** list detail
     (server render + refetch), All Items *pending and done tabs*, wishlist
     view, usual-items chips, AI-parse dedupe.
   - **Realtime UPDATE-as-removal:** browser A removes an item → browser B sees
     it disappear (arrives as UPDATE, not DELETE) with a `removedByOther`
     toast; A hits Undo → item reappears in B.
   - Single-item remove + Undo on shopping, wishlist, and All Items views —
     images still present after undo (previously lost).
   - Chip tap clears `is_extra`; detail switch sets it; partner sees both live.
   - Concurrent finish from both browsers → consistent end state, no errors,
     no double-stamping.
   - Settings menu toggles recurring; button relabels.
   - List index: no tabs; "Archived (n)" link only when archived lists exist.
4. `npm run lint` and a production build (`next build`) for type safety.

## Implementation tasks

### Task 1: Migration + RPCs (`0012_recurring_lists.sql`)
`lists.recurring`, `items.is_extra`, `items.removed_at`, 3-arg `create_list`,
`suggest_usual_items` re-created with the `removed_at is null` exclusion fix.
Verify with `npm run test:rls` additions and a local apply.

### Task 2: Types, data layer, read-path filters, realtime routing
`lib/types.ts` (`recurring`, `is_extra`, `removed_at`), `lib/list-types.ts`
(`supportsRecurring`), `lib/item-mutations.ts`, `lib/persist-item.ts`; the
`.is("removed_at", null)` filter on every enumerated read path
(`lists/[listId]/page.tsx`, `items/page.tsx`, both client `refetchAll`s,
`ai/parse` route, `use-item-images.ts`); and the removed-as-UPDATE routing in
`lib/use-realtime-items.ts` + `lib/use-realtime-all-items.ts`.

### Task 3: UI — checkout via stamps, soft remove/undo, extras, create/settings toggles, archive de-emphasis
`shopping-item-list.tsx` (`handleFinish` with `removed_at` stamps, soft
`handleRemove`, one-line `handleUndoRemove`), `all-items-view.tsx` +
`wishlist-item-list.tsx` soft remove/undo, `item-list.tsx` prop threading,
`item-row.tsx` chip, `item-detail-dialog.tsx` switch, `create-list-dialog.tsx` /
`create-list-form.tsx`, `list-settings-menu.tsx`, `lists/page.tsx` + delete
`list-filter.tsx`, `messages/en.json` / `es.json`.
