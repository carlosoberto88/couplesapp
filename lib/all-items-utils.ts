import type { ItemWithList } from "@/lib/types";

export type AllItemsStatus = "pending" | "done";

export function filterByStatus(
  items: ItemWithList[],
  status: AllItemsStatus,
): ItemWithList[] {
  return items.filter((item) =>
    status === "pending" ? item.checked_at === null : item.checked_at !== null,
  );
}

export function sortAllItems(
  items: ItemWithList[],
  status: AllItemsStatus,
): ItemWithList[] {
  if (status === "pending") {
    return [...items].sort((a, b) => {
      const aMust = a.priority === "must_have" ? 0 : 1;
      const bMust = b.priority === "must_have" ? 0 : 1;
      if (aMust !== bMust) return aMust - bMust;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }

  return [...items].sort(
    (a, b) =>
      new Date(b.checked_at as string).getTime() -
      new Date(a.checked_at as string).getTime(),
  );
}

export function upsertItemWithList(
  items: ItemWithList[],
  row: ItemWithList,
): ItemWithList[] {
  const idx = items.findIndex((i) => i.id === row.id);
  if (idx === -1) return [...items, row];
  const next = [...items];
  next[idx] = row;
  return next;
}

export function removeItemWithList(items: ItemWithList[], id: string): ItemWithList[] {
  return items.filter((i) => i.id !== id);
}

export function attachListToItem(
  item: Omit<ItemWithList, "lists"> & { lists?: ItemWithList["lists"] },
  listsById: Map<string, ItemWithList["lists"]>,
): ItemWithList | null {
  const list = item.lists ?? listsById.get(item.list_id);
  if (!list) return null;
  return { ...item, lists: list };
}
