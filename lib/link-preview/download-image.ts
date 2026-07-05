import { MAX_IMAGE_BYTES } from "@/lib/upload-item-image";
import { fetchBinaryUrl } from "@/lib/link-preview/fetch-url";
import type { DownloadedImage } from "@/lib/link-preview/types";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extFromContentType(contentType: string | null): DownloadedImage["ext"] | null {
  if (!contentType) return null;
  const normalized = contentType.split(";")[0]?.trim().toLowerCase();
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  return null;
}

function extFromUrl(url: string): DownloadedImage["ext"] | null {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith(".png")) return "png";
    if (pathname.endsWith(".webp")) return "webp";
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "jpg";
  } catch {
    return null;
  }
  return null;
}

function mimeFromExt(ext: DownloadedImage["ext"]): DownloadedImage["contentType"] {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

export async function downloadImage(imageUrl: string): Promise<DownloadedImage | null> {
  try {
    const { buffer, contentType } = await fetchBinaryUrl(imageUrl, MAX_IMAGE_BYTES);
    const ext = extFromContentType(contentType) ?? extFromUrl(imageUrl);
    if (!ext) return null;

    const mime = mimeFromExt(ext);
    if (contentType && !ALLOWED_IMAGE_TYPES.has(contentType.split(";")[0]?.trim().toLowerCase() ?? "")) {
      return null;
    }

    return { buffer, contentType: mime, ext };
  } catch {
    return null;
  }
}
