# Shopping Efficiency: Aisle Grouping + Drag Reorder — Design Spec

Date: 2026-07-06
Status: Proposed
Scope: Spec B only. Builds alongside Spec A (recurring lists, `0012`,
`docs/superpowers/specs/2026-07-06-reusable-shopping-lists-design.md`) without
touching its concerns. Drag is phased last; aisle grouping ships on its own.

## Problem

Shopping lists render in add-order (`sortItems`: unchecked oldest-first by
`created_at`), which has nothing to do with how a store is laid out. Users
zig-zag through aisles. Two fixes, smallest-possible: a free-text aisle tag
that auto-groups the list, and drag-to-reorder that finally uses the
`items.position` column that has existed since `0001` but was never wired up.
On recurring lists (Spec A) both are columns on kept rows, so the arrangement
persists trip after trip — tag your staples once, the list walks the store
forever.

## Design decisions (agreed)

1. `items.aisle` — nullable free text ("3", "Dairy"). Shown as a small chip on
   the row, edited in the item detail dialog. No store-layout modeling.
2. Unchecked items auto-group by aisle: numeric aisles ascending, then text
   aisles alphabetically, untagged items last in a quiet "No aisle" group
   (headers only appear once at least one item is tagged).
3. Drag reorders **within** an aisle group and persists to `items.position`
   (midpoint values). Cross-aisle drag is **deferred** — moving an item to
   another aisle = edit its aisle in the dialog, which is one tap more and
   avoids drop-target ambiguity on a phone.
4. Scoped via `lib/list-types.ts` flags, not `type === "shopping"`:
   `supportsAisles` (shopping only) and `supportsReorder` (shopping, todo,
   other). Wishlist gets neither.

## Architecture

### Schema — migration `supabase/migrations/0013_item_aisle_position.sql`

```sql
-- 0013_item_aisle_position.sql — aisle tag for store-order shopping.
-- items.position (0001: double precision not null default 0) already exists
-- and is finally used for drag reorder; it needs no change and no backfill:
-- all rows sit at 0, and the sort tiebreaks equal positions by created_at,
-- which reproduces today's order exactly until someone drags.

alter table public.items
  add column aisle text; -- null = untagged; short free label like '3' or 'Dairy'
```

That is the whole migration. Verified: `position` must NOT be re-added; its
`not null default 0` is fine for midpoint assignment because the client
renumbers a group on the first drag (see Drag). No index (couple-sized lists).

### RLS — no changes (verified)

`items_update_member` (0003:290) is `for update using (is_list_member(list_id))
with check (is_list_member(list_id))` with no column list — it already covers
`aisle` and `position` writes by either partner.

### Realtime — no publication changes, no hook changes (verified)

`items` is published with replica identity full (0001/0003). Aisle edits and
position updates arrive as ordinary UPDATEs and flow through the existing
`onUpsert` path in `lib/use-realtime-items.ts`, which re-sorts the partner's
list. Verified that position/aisle-only UPDATEs fire **no toasts**: the hook
only toasts on checked, reserved, and `removed_at` transitions. So even the
worst case — a group renumber issuing one UPDATE per row — produces silent
`onUpsert` state merges. **No debouncing needed.** Drag itself writes only on
drop (never during the gesture), and a drop is 1 row update in the steady
state (midpoint), N-row renumber only when gaps run out.

### Sort/group model — `sortItems` in `lib/item-list-utils.ts`

`sortItems` stays a pure function with the same signature. New comparator,
top to bottom:

1. **Checked state (unchanged):** unchecked first; checked sink to the bottom
   sorted by `checked_at` desc. Aisle/position never reorder the checked
   section.
2. **Unchecked — aisle key** via a new exported `compareAisles(a, b)`:
   - Normalize: `trim()`; empty/null → the "no aisle" bucket, which sorts
     **last**.
   - Purely numeric labels (`/^\d+$/` after trim) sort first, ascending by
     numeric value ("2" < "10").
   - Text labels follow, `localeCompare` with `sensitivity: "base"`
     (case/accent-insensitive — matters for Spanish labels like "Lácteos").
   - Numeric < text < none. Grouping key for headers: the trimmed label
     (case-insensitive fold for text so "dairy" and "Dairy" share a group).
3. **Within an aisle group:** `position` asc, then `created_at` asc.

Degradation guarantee: on lists where nothing is tagged and nothing dragged
(all `aisle = null`, all `position = 0`), steps 2–3 collapse to `created_at`
asc — byte-identical to today's order. This is why the comparator can live in
`sortItems` unconditionally instead of forking per list type: non-aisle lists
simply never have non-null aisles.

**Grouped rendering** stays in `components/shopping-item-list.tsx`: walk
`uncheckedItems` (already sorted) and emit a small header row whenever the
group key changes — no data restructuring. Headers render only when
`supportsAisles(listType)` **and** at least one unchecked item has an aisle;
the untagged bucket's header is `t("items.noAisle")`. Otherwise the list looks
exactly like today.

**Pure-function check:** add `scripts/sort-items-check.ts` (assert-based, run
with `npx tsx scripts/sort-items-check.ts`; add npm script `check:sort`).
Cases: legacy degradation (all null/0 → created_at order), numeric-before-text
("2" < "10" < "Dairy" < null), position within group, checked items unaffected
by aisle, case-insensitive text grouping.

### Aisle edit UX

- **Row (`components/item-row.tsx`):** when the parent passes `showAisle`
  (i.e. `supportsAisles(listType)`), render the aisle as a tiny muted chip
  after the item name (same visual family as Spec A's "One-time" chip).
  Nothing when null.
- **Detail dialog (`components/item-detail-dialog.tsx`):** in edit mode, one
  small text `Input` (label `itemDetail.aisle`, placeholder
  `items.aislePlaceholder`, `maxLength={24}`), shown when
  `supportsAisles(listType)`. Local `aisle` state seeded in `initEditForm`;
  `handleSave` merges `{ aisle: aisle.trim() || null }` into the patch.
  `buildEditPatch`/`RichAddInput` are NOT touched — aisle is merged beside the
  built patch, keeping wishlist and add-form code paths untouched.
- **Add form:** deferred. New items land untagged in the "No aisle" group at
  the bottom (created_at tiebreak) — same position as today's append. Tagging
  is a post-add detail action; on recurring lists you do it once per staple.
- `lib/item-mutations.ts`: add `"aisle"` (and `"position"`, for drag) to the
  `ItemUpdatePatch` pick. `lib/persist-item.ts` `buildNewItem`: `aisle: null`
  in the optimistic row (insert payload omits it; DB default null).

### Drag UX + position assignment (Task 3, independently deferrable)

**Library decision — add `@dnd-kit/core` + `@dnd-kit/sortable`.** No dnd
dependency exists today (verified `package.json`), and native HTML5 dnd does
not work for touch. A hand-rolled long-press reorder looks lazier but is not
viable-lazy: it must re-solve scroll-vs-drag disambiguation on iOS Safari,
auto-scroll near viewport edges, ghost rendering, and pointer capture — each a
known multi-day bug farm — whereas dnd-kit ships those plus keyboard
accessibility, has no runtime deps of its own, is tree-shakeable and MIT, and
is the de-facto React choice. Two small packages beat a bespoke gesture engine
we would own forever. Phasing drag last keeps even this dependency out of the
aisle release.

- Each aisle group becomes a `SortableContext` (items can only land within
  their group — this is how cross-aisle drag is structurally deferred).
  On lists without aisles the whole unchecked list is one context, so
  todo/other get plain reorder for free via `supportsReorder`.
- Handle: a `GripVertical` icon zone on the row (touch-friendly, avoids
  fighting the row's tap/check/detail targets); dnd-kit's `PointerSensor`
  with a small activation distance + `KeyboardSensor`. Checked section: no
  drag.
- **On drop:** optimistic local `position` update + one Supabase update:
  - New `position` = midpoint of the new neighbors' positions
    (`(prev + next) / 2`; first slot = `next - 1`, last = `prev + 1`).
  - **Gap exhaustion / all-zero start:** since every legacy row sits at
    `position = 0`, the very first drag in a group finds no gap. When
    neighbors are equal or `next - prev < 1e-6`, renumber the whole group
    client-side as `(index + 1) * 1024` and persist via `Promise.all` of
    per-row `update({ position }).eq("id", …)` (groups are a handful of rows;
    no RPC, no transaction — matches the browser-direct pattern, and partial
    failure self-heals on the next renumber). Double precision + 1024 spacing
    makes repeat exhaustion practically unreachable at this scale.
  - Failure: revert optimistic state + existing retry-toast pattern.
- Persistence synergy: `position` lives on the row, so on recurring lists the
  dragged order survives "Finish shopping" (Spec A resets `checked_at`, never
  `position`) — arrange once, keep forever.

### Files that change

| File | Change |
| --- | --- |
| `supabase/migrations/0013_item_aisle_position.sql` | New: `items.aisle text` (nothing else) |
| `lib/types.ts` | `Item.aisle: string \| null` |
| `lib/list-types.ts` | `supportsAisles` (shopping), `supportsReorder` (shopping/todo/other) in `ListTypeConfig` + tiny accessors |
| `lib/item-list-utils.ts` | `compareAisles`, aisle group key helper, new `sortItems` comparator |
| `lib/item-mutations.ts` | `"aisle"`, `"position"` added to `ItemUpdatePatch` |
| `lib/persist-item.ts` | `buildNewItem`: `aisle: null` |
| `components/shopping-item-list.tsx` | Group headers over `uncheckedItems`; (Task 3) dnd context + `handleReorder` with midpoint/renumber persistence |
| `components/item-row.tsx` | Aisle chip; (Task 3) drag handle |
| `components/item-detail-dialog.tsx` | Aisle input in edit form, merged into save patch |
| `messages/en.json`, `messages/es.json` | Keys below (Spanish first) |
| `scripts/sort-items-check.ts` | New assert-based check for `sortItems`/`compareAisles` |
| `package.json` | (Task 3 only) `@dnd-kit/core`, `@dnd-kit/sortable`; `check:sort` script |

### i18n keys (both `messages/en.json` and `messages/es.json`)

- `items.noAisle` — "No aisle" / "Sin pasillo"
- `items.aislePlaceholder` — "e.g. 3 or Dairy" / "p. ej. 3 o Lácteos"
- `items.aisleChipLabel` — "Aisle {aisle}" (sr-only/aria) / "Pasillo {aisle}"
- `items.reorderItem` — "Reorder {name}" (drag-handle aria, Task 3) / "Reordenar {name}"
- `itemDetail.aisle` — "Aisle" / "Pasillo"

## Edge cases

- **No-aisle items:** always one quiet trailing "No aisle" group; if *nothing*
  is tagged, no headers render at all — zero visual change for non-adopters.
- **Whitespace/case labels:** trimmed before save (`"" → null`); text grouping
  is case-insensitive so "dairy"/"Dairy" merge (first-seen casing shown).
- **Drag across aisle groups:** structurally impossible (per-group
  `SortableContext`); deferred by design. Changing aisle via the dialog moves
  the item to that group, keeping its `position` (lands by position/created_at
  among its new peers — acceptable).
- **Concurrent partner reorder:** per-row last-write-wins; both clients
  re-sort from realtime upserts to the same deterministic order. A concurrent
  renumber + midpoint drop can interleave, worst case producing an unexpected
  but valid order — self-corrects on the next drag. No locking.
- **Checked items:** never grouped, never draggable; check/uncheck moves items
  between sections exactly as today. An item checked mid-drag: the drop's
  position write still lands harmlessly (position is independent of checked
  state).
- **Spec A interactions:** soft-removed rows are already filtered from every
  read path, so they never appear in groups; "Finish shopping" resets checks
  but touches neither `aisle` nor `position`, so the store-order layout is the
  thing that makes recurring lists shine. Undo restores rows with their tags
  intact (columns were never cleared).
- **Wishlist:** `supportsAisles`/`supportsReorder` false; separate component
  anyway — untouched.

## Testing

1. **`scripts/sort-items-check.ts`** (assert-based, `npx tsx`): the comparator
   cases listed above, plus the legacy-degradation case as a regression gate.
2. **Migration:** apply 0013 locally; existing rows read `aisle = null`;
   confirm `position` still `double precision not null default 0` (unchanged).
3. **RLS (`npm run test:rls`):** add one case — non-owner member updates
   `aisle` and `position` on a partner-created item (expected: allowed by
   existing policy).
4. **Manual QA (two browsers):** tag items "3", "12", "Dairy", leave some
   untagged → groups render 3, 12, Dairy, No aisle; partner sees grouping
   live with no toasts. Untagged-only list shows no headers. Recurring list:
   finish shopping → staples reset, still grouped. Task 3: drag within a
   group persists across reload and across a finish-shopping reset; first
   drag on a legacy list (all-zero positions) renumbers cleanly; simultaneous
   drags from both browsers converge without errors; drag does not hijack
   page scroll on iOS.
5. `npm run lint` + `next build`.

## Implementation tasks

### Task 1: Migration + sort model (`0013`, types, `sortItems`, check script)
`0013_item_aisle_position.sql`; `Item.aisle` in `lib/types.ts`;
`supportsAisles`/`supportsReorder` flags in `lib/list-types.ts`;
`compareAisles` + new comparator in `lib/item-list-utils.ts`;
`scripts/sort-items-check.ts` green; RLS test case.

### Task 2: Aisle UI — chip, group headers, dialog edit (shippable release)
`item-row.tsx` chip; group headers in `shopping-item-list.tsx`; aisle input +
patch merge in `item-detail-dialog.tsx`; `ItemUpdatePatch`/`buildNewItem`;
en/es message keys. Ships alone — full aisle value with zero new deps.

### Task 3: Drag reorder (phased last)
Add `@dnd-kit/core` + `@dnd-kit/sortable`; per-group `SortableContext` +
handle in `shopping-item-list.tsx`/`item-row.tsx`; midpoint-with-renumber
`position` persistence + optimistic/rollback; `reorderItem` aria keys.
