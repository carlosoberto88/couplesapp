import type { SupabaseClient } from "@supabase/supabase-js";

import type { LinkPreviewResult, LinkPreviewSource } from "@/lib/link-preview/types";
import { hashNormalizedUrl } from "@/lib/link-preview/preview-token";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type CacheRow = {
  url_hash: string;
  normalized_url: string;
  title: string | null;
  price: number | null;
  currency: string | null;
  image_storage_path: string | null;
  source: string;
  fetched_at: string;
};

export async function getCachedPreview(
  admin: SupabaseClient,
  normalizedUrl: string,
): Promise<LinkPreviewResult | null> {
  const urlHash = hashNormalizedUrl(normalizedUrl);
  const { data } = await admin
    .from("link_preview_cache")
    .select("*")
    .eq("url_hash", urlHash)
    .maybeSingle();

  if (!data) return null;

  const row = data as CacheRow;
  const fetchedAt = new Date(row.fetched_at).getTime();
  if (Date.now() - fetchedAt > CACHE_TTL_MS) return null;
  if (!row.title) return null;

  return {
    normalizedUrl: row.normalized_url,
    name: row.title,
    price: row.price,
    currency: row.currency,
    imageUrl: null,
    imageStoragePath: row.image_storage_path,
    source: "cache",
  };
}

export async function setCachedPreview(
  admin: SupabaseClient,
  preview: LinkPreviewResult,
  imageStoragePath: string | null,
): Promise<void> {
  const urlHash = hashNormalizedUrl(preview.normalizedUrl);
  await admin.from("link_preview_cache").upsert(
    {
      url_hash: urlHash,
      normalized_url: preview.normalizedUrl,
      title: preview.name,
      price: preview.price,
      currency: preview.currency,
      image_storage_path: imageStoragePath,
      source: preview.source as LinkPreviewSource,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "url_hash" },
  );
}
