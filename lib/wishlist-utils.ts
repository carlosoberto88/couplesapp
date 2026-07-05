import type { Item } from "@/lib/types";

/** Whether the viewer can see that an item is reserved (owner never sees this). */
export function canSeeReservation(
  item: Pick<Item, "reserved_by">,
  userId: string,
  listOwnerId: string,
): boolean {
  if (!item.reserved_by) return false;
  if (userId === item.reserved_by) return true;
  return userId !== listOwnerId;
}

export function isPurchased(item: Pick<Item, "checked_at">): boolean {
  return item.checked_at !== null;
}

export function isReserved(item: Pick<Item, "reserved_by">): boolean {
  return item.reserved_by !== null;
}

export function sortWishlistItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    const aPurchased = a.checked_at !== null;
    const bPurchased = b.checked_at !== null;
    if (aPurchased !== bPurchased) return aPurchased ? 1 : -1;

    if (!aPurchased) {
      const aMust = a.priority === "must_have" ? 0 : 1;
      const bMust = b.priority === "must_have" ? 0 : 1;
      if (aMust !== bMust) return aMust - bMust;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }

    return new Date(b.checked_at as string).getTime() - new Date(a.checked_at as string).getTime();
  });
}
