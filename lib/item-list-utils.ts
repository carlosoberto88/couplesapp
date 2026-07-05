import type { Item } from "@/lib/types";

/**
 * Unchecked items first (oldest first), checked items sink to the bottom
 * (most recently checked first, dimmed + struck-through in UI — never removed).
 */
export function sortItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    const aChecked = a.checked_at !== null;
    const bChecked = b.checked_at !== null;
    if (aChecked !== bChecked) return aChecked ? 1 : -1;
    if (!aChecked) {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    return new Date(b.checked_at as string).getTime() - new Date(a.checked_at as string).getTime();
  });
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
