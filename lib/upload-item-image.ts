import type { SupabaseClient } from "@supabase/supabase-js";

export const ITEM_IMAGE_BUCKET = "item-images";
export const MAX_IMAGES_PER_ITEM = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function buildItemImagePath(listId: string, itemId: string, file: File): string {
  const ext =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  return `${listId}/${itemId}/${crypto.randomUUID()}.${ext}`;
}

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "invalidType";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "tooLarge";
  }
  return null;
}

export async function uploadItemImages(
  supabase: SupabaseClient,
  listId: string,
  itemId: string,
  userId: string,
  files: File[],
): Promise<{ error?: string }> {
  const slice = files.slice(0, MAX_IMAGES_PER_ITEM);

  for (let i = 0; i < slice.length; i++) {
    const file = slice[i]!;
    const validationError = validateImageFile(file);
    if (validationError) return { error: validationError };

    const storagePath = buildItemImagePath(listId, itemId, file);
    const { error: uploadError } = await supabase.storage
      .from(ITEM_IMAGE_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) return { error: uploadError.message };

    const { error: insertError } = await supabase.from("item_images").insert({
      item_id: itemId,
      storage_path: storagePath,
      sort_order: i,
      created_by: userId,
    });

    if (insertError) {
      await supabase.storage.from(ITEM_IMAGE_BUCKET).remove([storagePath]);
      return { error: insertError.message };
    }
  }

  return {};
}

export async function deleteItemImages(
  supabase: SupabaseClient,
  images: { storage_path: string }[],
): Promise<void> {
  if (images.length === 0) return;
  const paths = images.map((img) => img.storage_path);
  await supabase.storage.from(ITEM_IMAGE_BUCKET).remove(paths);
}

export async function getSignedImageUrls(
  supabase: SupabaseClient,
  storagePaths: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await Promise.all(
    storagePaths.map(async (path) => {
      const { data } = await supabase.storage
        .from(ITEM_IMAGE_BUCKET)
        .createSignedUrl(path, 3600);
      if (data?.signedUrl) map.set(path, data.signedUrl);
    }),
  );
  return map;
}
