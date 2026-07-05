import type { SupabaseClient } from "@supabase/supabase-js";

import { downloadImage } from "@/lib/link-preview/download-image";
import { setCachedPreview } from "@/lib/link-preview/cache";
import type { LinkPreviewResult } from "@/lib/link-preview/types";
import {
  buildPreviewImagePath,
  getSignedImageUrls,
  uploadImageBuffer,
} from "@/lib/upload-item-image";

export async function ensurePreviewImageStored(
  admin: SupabaseClient,
  preview: LinkPreviewResult,
): Promise<{ imageStoragePath: string | null; imagePreviewUrl: string | null }> {
  if (preview.imageStoragePath) {
    const signed = await getSignedImageUrls(admin, [preview.imageStoragePath]);
    return {
      imageStoragePath: preview.imageStoragePath,
      imagePreviewUrl: signed.get(preview.imageStoragePath) ?? null,
    };
  }

  if (!preview.imageUrl) {
    return { imageStoragePath: null, imagePreviewUrl: null };
  }

  const downloaded = await downloadImage(preview.imageUrl);
  if (!downloaded) {
    return { imageStoragePath: null, imagePreviewUrl: null };
  }

  const storagePath = buildPreviewImagePath(downloaded.ext);
  const { error } = await uploadImageBuffer(
    admin,
    storagePath,
    downloaded.buffer,
    downloaded.contentType,
  );
  if (error) {
    return { imageStoragePath: null, imagePreviewUrl: null };
  }

  await setCachedPreview(admin, preview, storagePath);

  const signed = await getSignedImageUrls(admin, [storagePath]);
  return {
    imageStoragePath: storagePath,
    imagePreviewUrl: signed.get(storagePath) ?? null,
  };
}
