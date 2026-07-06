# Reusable Shopping Lists — Design Spec

Date: 2026-07-06
Status: Approved for implementation
Scope: Spec A only. Aisle/reorder is Spec B and is not designed here.

## Problem

"Clear checked" (`handleClearChecked` in `components/shopping-item-list.tsx`) hard-deletes
checked items. For a weekly groceries list this destroys the list every trip
("la lista se borra") and forces re-typing staples. Lists should be reusable:
finish a trip, keep the staples, reset the checkmarks.

## Design decisions (agreed)

1. Per-list `recurring` boolean; set at create time, toggleable in list settings.
2. Recurring lists get "Finish shopping": resets `checked_at`/`checked_by`, keeps items.
3. Items on recurring lists can be flagged `is_extra` ("just this trip"); extras are
   deleted on checkout, staples are kept. **Default for new adds: staple**
   (`is_extra = false`).
4. One-off lists keep delete-on-clear, but gain a 5s undo toast (checkout-level
   restore, extending the existing single-delete undo pattern).
5. Archived lists get de-emphasized in the list index; archive data/actions stay.

## Architecture

### Schema — migration `supabase/migrations/0012_recurring_lists.sql`

```sql
-- Reusable (recurring) lists: keep staples across shopping trips.

alter table public.lists
  add column recurring boolean not null default false;

alter table public.items
  add column is_extra boolean not null default false;

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
```

Notes:
- The RPC body mirrors the current definition in `0003_clerk_identity_reset.sql`
  (Clerk `clerk_user_id()`, not `auth.uid()` from 0001).
- Existing callers passing only `p_name`/`p_type` keep working via the default.

### RLS — no policy changes

- `items_update_member` (0003) already lets any member update any item column;
  it covers `is_extra` toggles by either partner.
- `lists_update_owner` already covers the `recurring` toggle — owner-only, same
  as rename/archive. Acceptable and consistent; no new policy.
- New columns inherit the tables' existing policies; nothing to add.

### Realtime — no changes

`lists` and `items` are already in `supabase_realtime` with
`replica identity full` (0001, 0005). Column additions need nothing. No new
tables are introduced.

### Files that change

| File | Change |
| --- | --- |
| `supabase/migrations/0012_recurring_lists.sql` | New (above) |
| `lib/types.ts` | `List.recurring: boolean`; `Item.is_extra: boolean` |
| `lib/list-types.ts` | Add `supportsRecurring` to `ListTypeConfig` (`shopping: true`, others `false`) |
| `lib/item-mutations.ts` | Add `"is_extra"` to `ItemUpdatePatch` pick |
| `lib/persist-item.ts` | `buildNewItem`: `is_extra: false` (insert payloads can omit it — DB default) |
| `components/shopping-item-list.tsx` | Replace `handleClearChecked` with `handleFinish` (branch on `listRecurring`), snapshot + undo, add `is_extra` to `handleUndoRemove` insert payload, labels |
| `components/item-list.tsx` | Thread `listRecurring` prop |
| `components/item-row.tsx` | "One-time" chip when `listRecurring && item.is_extra`; tap chip clears flag |
| `components/item-detail-dialog.tsx` | "Just this trip" switch (recurring lists only), saved via existing edit patch |
| `components/create-list-dialog.tsx` / `create-list-form.tsx` | Recurring toggle shown when `supportsRecurring(type)`; pass `p_recurring` to RPC |
| `components/list-settings-menu.tsx` | Owner toggle "Recurring list" (updates `lists.recurring`); widen `list` prop to include `type` + `recurring` |
| `app/(app)/lists/[listId]/page.tsx` | Pass `typedList.recurring` down (`select("*")` already fetches it) |
| `app/(app)/lists/page.tsx` | Remove `<ListFilter />`; quiet "Archived (n)" link |
| `components/list-filter.tsx` | Delete |
| `messages/en.json`, `messages/es.json` | New keys (finish/reset/undo/chip/toggle/archived link) |
| `scripts/rls-test.ts` | Extend (see Testing) |

`WishlistItemList` is untouched (`supportsRecurring: false`; wishlists have no
clear-checked flow).

## Checkout state machine

One list-level flag, two behaviors for the same button slot (the count-row
button and the "All done" banner button in `shopping-item-list.tsx` — reuse
both, plus the existing `AllDoneCelebration`; no parallel flow):

```
                         [some items checked]
                                  |
              +-------------------+-------------------+
              | recurring = false                     | recurring = true
              v                                       v
        "Clear checked"                        "Finish shopping"
   DELETE all checked items          UPDATE checked staples -> unchecked
   (today's behavior)                DELETE checked extras
              |                                       |
              +---------- 5s undo toast --------------+
                    restores pre-action snapshot
```

`handleFinish` (replaces `handleClearChecked`):

1. Snapshot `checkedItems` (full rows) for undo.
2. Optimistic local state: recurring → staples get `checked_at/checked_by`
   nulled, checked extras removed; one-off → all checked removed.
3. Add ids of rows that will be **deleted** to `locallyRemovedIdsRef` (existing
   partner-toast suppression), same 3s window as today.
4. Server, using server-side filters (idempotent, same style as today's
   clear-checked delete):
   - recurring:
     `delete ... eq list_id, eq is_extra=true, not checked_at is null`
     then
     `update {checked_at: null, checked_by: null} ... eq list_id, eq is_extra=false, not checked_at is null`
   - one-off: existing single filtered delete.
5. On error: restore snapshot locally + retry toast (existing pattern). The two
   recurring statements are not atomic; both are idempotent, so retry reissues
   both safely. A `checkout_list(list_id)` RPC was considered for atomicity and
   rejected — two filtered statements match the existing browser-direct pattern
   and partial failure is benign (retry converges).
6. Success toast with **Undo** (5s, `UNDO_GRACE_MS`):
   - one-off: bulk `insert` of the snapshot rows (the `handleUndoRemove` column
     list, now including `is_extra`), as a single `.insert(rows)`.
   - recurring: bulk re-insert deleted extras + re-apply each staple's original
     `checked_at`/`checked_by` via per-row updates (`Promise.all`; two-person
     lists, tens of rows max). Undo may clobber partner edits made inside the
     5s window — accepted for this app size.

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
- **All items are extras:** finish deletes everything → existing `EmptyState`;
  undo restores. Correct, if surprising — the toast copy says what happened
  ("Trip finished — N one-time items removed").
- **All staples:** finish is a pure uncheck; nothing deleted; generic toast
  ("List reset for next trip").
- **Concurrent partner checkout:** both clients run idempotent server-filtered
  statements; the second matches zero rows. Realtime per-row UPDATE/DELETE
  events reconcile both UIs via existing `onUpsert`/`onRemove`.
- **Partner checks an item mid-checkout:** rows checked after the server
  evaluates the filter stay checked; realtime reconciles. Acceptable.
- **Partner toast noise:** unchecks emit no toasts (`onOtherUserCheck` returns
  when `checked_by` is null — verified); deleted extras emit the same
  `removedByOther` toasts today's clear-checked does, suppressed locally via
  `locallyRemovedIdsRef`.
- **Undo restoring an extra:** requires `is_extra` in the `handleUndoRemove`
  insert payload (explicit column list — without this the flag is silently
  lost).
- **Recurring toggle mid-session:** `lists` realtime + `ListsLiveSync` /
  `ListDetailLiveSync` refresh already propagate; the button relabels on
  refresh. No extra work.

## Testing

No unit-test framework exists; scale accordingly.

1. **RLS (`scripts/rls-test.ts`, `npm run test:rls`):** add cases — member (non-owner)
   can update `items.is_extra`; non-owner cannot update `lists.recurring`; owner can;
   `create_list` with and without `p_recurring`.
2. **Migration:** apply 0012 to local/staging; confirm existing lists read
   `recurring = false`, items `is_extra = false`, old 2-arg RPC callers still work.
3. **Manual QA checklist (two browsers for realtime):**
   - Recurring list: add staples + one extra → check all → celebration →
     "Finish shopping" → staples unchecked and kept, extra gone → Undo → exact
     pre-checkout state.
   - One-off list: unchanged clear-checked + new Undo restores.
   - Chip tap clears `is_extra`; detail switch sets it; partner sees both live.
   - Concurrent finish from both browsers → consistent end state, no errors.
   - Settings menu toggles recurring; button relabels.
   - List index: no tabs; "Archived (n)" link only when archived lists exist.
4. `npm run lint` and a production build (`next build`) for type safety.

## Implementation tasks

### Task 1: Migration + RPC (`0012_recurring_lists.sql`)
Schema above; verify with `npm run test:rls` additions and a local apply.

### Task 2: Types and data layer
`lib/types.ts`, `lib/list-types.ts` (`supportsRecurring`), `lib/item-mutations.ts`,
`lib/persist-item.ts`, and the `is_extra` fix in `handleUndoRemove`'s payload.

### Task 3: UI — checkout flow, extras, create/settings toggles, archive de-emphasis
`shopping-item-list.tsx` (`handleFinish` + undo), `item-list.tsx` prop threading,
`item-row.tsx` chip, `item-detail-dialog.tsx` switch, `create-list-dialog.tsx` /
`create-list-form.tsx`, `list-settings-menu.tsx`, `lists/[listId]/page.tsx`,
`lists/page.tsx` + delete `list-filter.tsx`, `messages/en.json` / `es.json`.
