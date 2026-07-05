import type { LinkPreviewResult } from "@/lib/link-preview/types";

type MicrolinkResponse = {
  status: string;
  data?: {
    title?: string | null;
    image?: { url?: string | null } | null;
    price?: number | string | null;
    currency?: string | null;
  };
};

function parseMicrolinkPrice(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[^\d.,]/g, "").replace(",", ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

export async function fetchMicrolinkPreview(url: string): Promise<LinkPreviewResult | null> {
  const endpoint = new URL("https://api.microlink.io/");
  endpoint.searchParams.set("url", url);
  if (process.env.MICROLINK_API_KEY) {
    endpoint.searchParams.set("apiKey", process.env.MICROLINK_API_KEY);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(endpoint.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return null;

    const json = (await response.json()) as MicrolinkResponse;
    if (json.status !== "success" || !json.data) return null;

    const title = json.data.title?.trim().slice(0, 200);
    const imageUrl = json.data.image?.url ?? null;
    if (!title && !imageUrl) return null;

    return {
      normalizedUrl: url,
      name: title ?? "Product",
      price: parseMicrolinkPrice(json.data.price),
      currency: json.data.currency?.trim().toUpperCase().slice(0, 10) ?? null,
      imageUrl,
      source: "microlink",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
