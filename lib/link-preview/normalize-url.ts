const AMAZON_HOSTS = new Set([
  "amazon.com",
  "www.amazon.com",
  "amazon.co.uk",
  "www.amazon.co.uk",
  "amazon.de",
  "www.amazon.de",
  "amazon.ca",
  "www.amazon.ca",
  "amazon.es",
  "www.amazon.es",
  "amazon.fr",
  "www.amazon.fr",
  "amazon.it",
  "www.amazon.it",
  "amazon.com.mx",
  "www.amazon.com.mx",
  "amzn.to",
  "www.amzn.to",
]);

const AMAZON_ASIN =
  /\/(?:dp|gp\/product|exec\/obidos\/ASIN|product)\/([A-Z0-9]{10})(?:[/?]|$)/i;

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "ref_",
  "tag",
  "psc",
  "th",
  "smid",
]);

export function normalizeUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;

  const host = parsed.hostname.toLowerCase();
  if (!host.includes(".")) return null;

  for (const param of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(param.toLowerCase())) {
      parsed.searchParams.delete(param);
    }
  }

  const asin = extractAmazonAsin(parsed);
  if (asin) {
    const canonicalHost = host.endsWith("amazon.com") ? "www.amazon.com" : host;
    return `https://${canonicalHost}/dp/${asin.toUpperCase()}`;
  }

  parsed.hash = "";
  return parsed.toString();
}

function extractAmazonAsin(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const isAmazon = [...AMAZON_HOSTS].some(
    (amazonHost) => host === amazonHost || host.endsWith(`.${amazonHost}`),
  );
  if (!isAmazon) return null;

  const match = url.pathname.match(AMAZON_ASIN);
  return match?.[1]?.toUpperCase() ?? null;
}

export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
