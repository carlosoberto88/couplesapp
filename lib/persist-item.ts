import type { SupabaseClient } from "@supabase/supabase-js";

import type { Item, ItemPriority } from "@/lib/types";
import type { RichAddInput } from "@/components/rich-add-item-form";
import { uploadItemImages } from "@/lib/upload-item-image";

type BulkInsertPayload = {
  id: string;
  name: string;
  note: string | null;
  url: string | null;
  price: number | null;
  currency: string | null;
  priority: Item["priority"];
};

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
    is_extra: false,
    removed_at: null,
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

export async function insertItemsBulk(
  supabase: SupabaseClient,
  listId: string,
  userId: string,
  inputs: RichAddInput[],
  optimisticItems: Item[],
): Promise<{ items?: Item[]; error?: string }> {
  const payload: BulkInsertPayload[] = optimisticItems.map((item, index) => ({
    id: item.id,
    name: inputs[index].name,
    note: inputs[index].note,
    url: inputs[index].url,
    price: inputs[index].price,
    currency: inputs[index].currency,
    priority: inputs[index].priority,
  }));

  const res = await fetch("/api/items/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listId, items: payload }),
  });

  const data = (await res.json().catch(() => null)) as { items?: Item[]; error?: string } | null;

  if (!res.ok || !data?.items) {
    return { error: data?.error ?? "bulk_insert_failed" };
  }

  const savedItems = data.items;

  for (let i = 0; i < inputs.length; i++) {
    const files = inputs[i].files;
    if (files.length === 0) continue;

    const itemId = savedItems[i]?.id ?? optimisticItems[i].id;
    const { error: uploadError } = await uploadItemImages(
      supabase,
      listId,
      itemId,
      userId,
      files,
    );

    if (uploadError) return { error: uploadError };
  }

  return { items: savedItems };
}

export type LinkPreviewData = {
  previewToken: string;
  name: string;
  url: string;
  price: number | null;
  currency: string | null;
  imageUrl: string | null;
  hostname: string;
};

export async function fetchLinkPreview(
  listId: string,
  url: string,
): Promise<{ preview?: LinkPreviewData; error?: string }> {
  const res = await fetch("/api/items/preview-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listId, url }),
  });

  const data = (await res.json().catch(() => null)) as LinkPreviewData & { error?: string };

  if (!res.ok || !data?.previewToken) {
    return { error: data?.error ?? "preview_failed" };
  }

  return {
    preview: {
      previewToken: data.previewToken,
      name: data.name,
      url: data.url,
      price: data.price,
      currency: data.currency,
      imageUrl: data.imageUrl,
      hostname: data.hostname,
    },
  };
}

export async function insertItemFromLink(
  listId: string,
  previewToken: string,
  priority: ItemPriority | null = null,
): Promise<{ item?: Item; error?: string }> {
  const res = await fetch("/api/items/from-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listId, previewToken, priority }),
  });

  const data = (await res.json().catch(() => null)) as { item?: Item; error?: string };

  if (!res.ok || !data?.item) {
    return { error: data?.error ?? "from_link_failed" };
  }

  return { item: data.item };
}
