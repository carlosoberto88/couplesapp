import type { SupabaseClient } from "@supabase/supabase-js";

import { extractPreviewWithAi } from "@/lib/link-preview/ai-extract";
import { getCachedPreview, setCachedPreview } from "@/lib/link-preview/cache";
import { fetchPageHtml } from "@/lib/link-preview/fetch-url";
import { fetchMicrolinkPreview } from "@/lib/link-preview/microlink";
import { normalizeUrl } from "@/lib/link-preview/normalize-url";
import { htmlSnippetForAi, parseMetaFromHtml } from "@/lib/link-preview/parse-meta";
import type { LinkPreviewResult } from "@/lib/link-preview/types";

function buildFromOg(
  normalizedUrl: string,
  meta: ReturnType<typeof parseMetaFromHtml>,
): LinkPreviewResult | null {
  if (!meta.title && !meta.imageUrl) return null;

  return {
    normalizedUrl,
    name: meta.title ?? "Product",
    price: meta.price,
    currency: meta.currency,
    imageUrl: meta.imageUrl,
    source: "og",
  };
}

function hasPreviewTitle(preview: LinkPreviewResult | null): preview is LinkPreviewResult {
  return Boolean(preview?.name);
}

function hasPreviewImage(preview: LinkPreviewResult | null): boolean {
  return Boolean(preview?.imageUrl || preview?.imageStoragePath);
}

export async function resolveLinkPreview(
  rawUrl: string,
  admin?: SupabaseClient,
): Promise<{ preview: LinkPreviewResult | null; htmlSnippet?: string }> {
  const normalizedUrl = normalizeUrl(rawUrl);
  if (!normalizedUrl) return { preview: null };

  if (admin) {
    const cached = await getCachedPreview(admin, normalizedUrl);
    if (cached) {
      return { preview: cached };
    }
  }

  let html = "";
  let pageUrl = normalizedUrl;

  try {
    const fetched = await fetchPageHtml(normalizedUrl);
    html = fetched.html;
    pageUrl = fetched.finalUrl;
  } catch {
    html = "";
  }

  const ogPreview = html ? buildFromOg(normalizedUrl, parseMetaFromHtml(html, pageUrl)) : null;
  if (hasPreviewTitle(ogPreview) && hasPreviewImage(ogPreview)) {
    if (admin) {
      await setCachedPreview(admin, ogPreview, null);
    }
    return { preview: ogPreview };
  }

  const microlinkPreview = await fetchMicrolinkPreview(normalizedUrl);
  if (hasPreviewTitle(microlinkPreview) && hasPreviewImage(microlinkPreview)) {
    if (admin) {
      await setCachedPreview(admin, microlinkPreview, null);
    }
    return { preview: microlinkPreview };
  }

  if (html) {
    const snippet = htmlSnippetForAi(html);
    try {
      const aiResult = await extractPreviewWithAi(snippet, pageUrl);
      if (aiResult.title) {
        const aiPreview: LinkPreviewResult = {
          normalizedUrl,
          name: aiResult.title,
          price: aiResult.price,
          currency: aiResult.currency,
          imageUrl: aiResult.imageUrl,
          source: "ai",
        };
        if (admin) {
          await setCachedPreview(admin, aiPreview, null);
        }
        return { preview: aiPreview, htmlSnippet: snippet };
      }
    } catch {
      // fall through
    }
  }

  if (hasPreviewTitle(ogPreview)) {
    return { preview: ogPreview };
  }

  if (hasPreviewTitle(microlinkPreview)) {
    return { preview: microlinkPreview };
  }

  return { preview: null };
}
