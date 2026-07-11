import type { Item } from "@/lib/types";

const NUMERIC_AISLE = /^\d+$/;

/**
 * Group key for an aisle label, used both by `sortItems`'s comparator and
 * by the UI to detect when to render a new group header. Trims whitespace
 * and case-folds text labels so "dairy" and "Dairy" share a group; null/
 * empty labels collapse to `null` (the "no aisle" bucket).
 */
export function aisleGroupKey(aisle: string | null): string | null {
  const trimmed = aisle?.trim();
  if (!trimmed) return null;
  return NUMERIC_AISLE.test(trimmed) ? trimmed : trimmed.toLocaleLowerCase();
}

/**
 * Orders aisle labels: numeric labels first (ascending by numeric value,
 * so "2" < "10"), then text labels (case/accent-insensitive), then the
 * "no aisle" bucket (null/empty) last.
 */
export function compareAisles(a: string | null, b: string | null): number {
  const aTrimmed = a?.trim() ?? "";
  const bTrimmed = b?.trim() ?? "";
  const aEmpty = aTrimmed === "";
  const bEmpty = bTrimmed === "";
  if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
  if (aEmpty && bEmpty) return 0;

  const aNumeric = NUMERIC_AISLE.test(aTrimmed);
  const bNumeric = NUMERIC_AISLE.test(bTrimmed);
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
  if (aNumeric && bNumeric) return Number(aTrimmed) - Number(bTrimmed);

  return aTrimmed.localeCompare(bTrimmed, undefined, { sensitivity: "base" });
}

/**
 * Unchecked items first, grouped by aisle (numeric aisles ascending, then
 * text aisles alphabetically, then untagged items last), ordered by
 * `position` then `created_at` within each group. Checked items sink to the
 * bottom (most recently checked first, dimmed + struck-through in UI —
 * never removed), unaffected by aisle/position.
 *
 * Degradation guarantee: when every item has `aisle = null` and
 * `position = 0`, all items land in the same (empty) aisle group at the
 * same position, so the comparator falls through to `created_at` asc —
 * byte-identical to the pre-aisle sort order.
 */
export function sortItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    const aChecked = a.checked_at !== null;
    const bChecked = b.checked_at !== null;
    if (aChecked !== bChecked) return aChecked ? 1 : -1;
    if (aChecked) {
      return new Date(b.checked_at as string).getTime() - new Date(a.checked_at as string).getTime();
    }

    const aisleCompare = compareAisles(a.aisle, b.aisle);
    if (aisleCompare !== 0) return aisleCompare;

    if (a.position !== b.position) return a.position - b.position;

    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

/**
 * Counts `createdAts` strictly newer than `seenIso`. Returns 0 when
 * `seenIso` is null/empty so a first-ever visit never floods "new" badges.
 * Compares parsed timestamps (`Date.parse`), not raw strings, since
 * `created_at` arrives as ISO with a `+00:00` offset while the stored
 * "seen" value uses `Date.toISOString()` (`Z` suffix) — lexical comparison
 * of those two formats is not reliable.
 */
export function countNewItems(createdAts: string[], seenIso: string | null): number {
  if (!seenIso) return 0;
  const seenTime = Date.parse(seenIso);
  return createdAts.filter((createdAt) => Date.parse(createdAt) > seenTime).length;
}

export function upsertRow(items: Item[], row: Item): Item[] {
  const idx = items.findIndex((i) => i.id === row.id);
  if (idx === -1) return [...items, row];
  const next = [...items];
  next[idx] = row;
  return next;
}

export function removeRow(items: Item[], id: string): Item[] {
  return items.filter((i) => i.id !== id);
}
