import type { SupabaseClient } from "@supabase/supabase-js";

import type { RichAddInput } from "@/components/rich-add-item-form";
import type { Item } from "@/lib/types";

export type ItemUpdatePatch = Partial<
  Pick<
    Item,
    | "checked_at"
    | "checked_by"
    | "reserved_by"
    | "reserved_at"
    | "note"
    | "name"
    | "url"
    | "price"
    | "currency"
    | "priority"
    | "is_extra"
  >
>;

export async function updateItemFields(
  supabase: SupabaseClient,
  itemId: string,
  patch: ItemUpdatePatch,
) {
  return supabase.from("items").update(patch).eq("id", itemId);
}

export function buildToggleCheckedPatch(
  item: Pick<Item, "checked_at">,
  currentUserId: string,
): Pick<Item, "checked_at" | "checked_by"> {
  const wasChecked = item.checked_at !== null;
  return wasChecked
    ? { checked_at: null, checked_by: null }
    : { checked_at: new Date().toISOString(), checked_by: currentUserId };
}

export function buildReservePatch(
  currentUserId: string,
): Pick<Item, "reserved_by" | "reserved_at"> {
  return { reserved_by: currentUserId, reserved_at: new Date().toISOString() };
}

export function buildReleasePatch(): Pick<Item, "reserved_by" | "reserved_at"> {
  return { reserved_by: null, reserved_at: null };
}

export function buildMarkPurchasedPatch(
  currentUserId: string,
): Pick<Item, "checked_at" | "checked_by"> {
  return { checked_at: new Date().toISOString(), checked_by: currentUserId };
}

export function buildUnmarkPurchasedPatch(): Pick<Item, "checked_at" | "checked_by"> {
  return { checked_at: null, checked_by: null };
}

export function buildEditPatch(input: RichAddInput, wishlist: boolean): ItemUpdatePatch {
  return {
    name: input.name.trim(),
    note: input.note,
    url: input.url,
    price: wishlist && input.price !== null ? input.price : null,
    currency: wishlist && input.price !== null ? input.currency : null,
    priority: wishlist ? input.priority : null,
  };
}
