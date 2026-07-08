/**
 * Guards item URLs against stored-XSS via non-http(s) schemes (`javascript:`,
 * `data:`, etc.) — allowlists `http:`/`https:` only. Use at every render site
 * that puts an item URL into an `href`, and on write before persisting.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

// Sanity check (spot-checked, not a runnable test): safeExternalUrl("https://a.com") === "https://a.com";
// safeExternalUrl("javascript:alert(1)"), safeExternalUrl("data:text/html,x"), and
// safeExternalUrl(null) all return null.
