export type ParsedMeta = {
  title: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number.parseInt(num, 10)));
}

function readMetaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1].trim());
  }

  return null;
}

function readTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null;
}

function parsePrice(raw: string | null): number | null {
  if (!raw) return null;
  const normalized = raw.replace(/[^\d.,]/g, "").replace(",", "");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function resolveUrl(baseUrl: string, maybeRelative: string | null): string | null {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return null;
  }
}

function cleanTitle(title: string | null): string | null {
  if (!title) return null;
  const cleaned = title
    .replace(/\s*[|\-–—:]\s*Amazon\.com.*$/i, "")
    .replace(/\s*[|\-–—:]\s*Buy on.*$/i, "")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : null;
}

export function parseMetaFromHtml(html: string, pageUrl: string): ParsedMeta {
  const ogTitle = readMetaContent(html, "og:title");
  const twitterTitle = readMetaContent(html, "twitter:title");
  const titleTag = readTitleTag(html);

  const ogImage = readMetaContent(html, "og:image");
  const twitterImage = readMetaContent(html, "twitter:image");
  const twitterImageSrc = readMetaContent(html, "twitter:image:src");

  const priceRaw =
    readMetaContent(html, "product:price:amount") ??
    readMetaContent(html, "og:price:amount") ??
    readMetaContent(html, "twitter:data1");

  const currencyRaw =
    readMetaContent(html, "product:price:currency") ??
    readMetaContent(html, "og:price:currency");

  const title = cleanTitle(ogTitle ?? twitterTitle ?? titleTag);
  const imageUrl = resolveUrl(
    pageUrl,
    ogImage ?? twitterImage ?? twitterImageSrc,
  );

  return {
    title,
    imageUrl,
    price: parsePrice(priceRaw),
    currency: currencyRaw?.trim().toUpperCase().slice(0, 10) ?? null,
  };
}

export function htmlSnippetForAi(html: string, maxLength = 8000): string {
  const headMatch = html.match(/<head[\s\S]*?<\/head>/i);
  const snippet = headMatch?.[0] ?? html.slice(0, maxLength);
  return snippet.slice(0, maxLength);
}
