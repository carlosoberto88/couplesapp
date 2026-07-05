import type { SupabaseClient } from "@supabase/supabase-js";

import type { Item } from "@/lib/types";
import type { RichAddInput } from "@/components/rich-add-item-form";
import { uploadItemImages } from "@/lib/upload-item-image";

export function buildNewItem(listId: string, userId: string, input: RichAddInput): Item {
  return {
    id: crypto.randomUUID(),
    list_id: listId,
    name: input.name,
    note: input.note,
    url: input.url,
    price: input.price,
    currency: input.price !== null ? input.currency : null,
    priority: input.priority,
    position: 0,
    created_by: userId,
    created_at: new Date().toISOString(),
    checked_at: null,
    checked_by: null,
    reserved_by: null,
    reserved_at: null,
  };
}

export async function insertItemWithImages(
  supabase: SupabaseClient,
  listId: string,
  userId: string,
  item: Item,
  files: File[],
): Promise<{ error?: string }> {
  const { error } = await supabase.from("items").insert({
    id: item.id,
    list_id: item.list_id,
    name: item.name,
    note: item.note,
    url: item.url,
    price: item.price,
    currency: item.currency,
    priority: item.priority,
    position: item.position,
    created_by: item.created_by,
  });

  if (error) return { error: error.message };

  if (files.length === 0) return {};

  const { error: uploadError } = await uploadItemImages(
    supabase,
    listId,
    item.id,
    userId,
    files,
  );

  if (uploadError) return { error: uploadError };

  return {};
}
