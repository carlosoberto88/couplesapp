/**
 * Guards the `next` query param used by invite links against open-redirect
 * abuse: must be a single leading `/` (a relative, in-app path) — rejects
 * protocol-relative (`//host`) and absolute (`https://...`) URLs. Mirrors the
 * check the old Supabase `/auth/callback` route performed.
 */
export function sanitizeRedirect(
  next: string | null | undefined,
  fallback = "/lists",
): string {
  if (!next) return fallback;
  // Strip backslashes and ASCII whitespace/control chars first — some
  // browsers normalize a leading `/\` (or a value containing tabs/newlines)
  // into `//`, which would otherwise slip past the check below as an
  // open-redirect to an external host.
  const normalized = next.replace(/[\\\t\n\r\f\v\0]/g, "");
  // Require a single leading `/` followed by a non-`/`, non-`\` character —
  // rejects protocol-relative (`//host`), absolute (`https://...`), and
  // anything that still starts with `/\` after stripping.
  if (!/^\/[^/\\]/.test(normalized)) return fallback;
  return normalized;
}

// Sanity check (spot-checked, not a runnable test): sanitizeRedirect("/lists/123") === "/lists/123";
// sanitizeRedirect("//evil.com"), sanitizeRedirect("/\\evil.com"), sanitizeRedirect("https://evil.com"),
// and sanitizeRedirect("") / sanitizeRedirect(null) all fall back to "/lists".
