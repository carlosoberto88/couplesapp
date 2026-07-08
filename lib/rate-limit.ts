// Best-effort, in-memory rate limiter for public (unauthenticated) endpoints.
// No shared cache in this repo, and a single Lambda instance's memory is
// enough to blunt casual abuse. Resets whenever the instance recycles.
//
// The client key is derived from request headers, which are spoofable by the
// caller (x-forwarded-for in particular). This limiter is a courtesy speed
// bump, not a security boundary — the real controls are the RPCs themselves
// (reserve_public_item / release_public_item), which are safe to call
// repeatedly with no oracle for probing validity.

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
// Caps worst-case memory growth from an attacker rotating spoofed keys faster
// than they age out of the window below.
const RATE_LIMIT_MAX_KEYS = 5_000;

const requestLog = new Map<string, number[]>();

function pruneExpired(now: number): void {
  for (const [key, timestamps] of requestLog) {
    const fresh = timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
    if (fresh.length === 0) requestLog.delete(key);
    else if (fresh.length !== timestamps.length) requestLog.set(key, fresh);
  }
}

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  pruneExpired(now);

  const timestamps = (requestLog.get(key) ?? []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS,
  );
  timestamps.push(now);
  requestLog.set(key, timestamps);

  // Belt-and-suspenders cap in case many distinct keys arrive within a single
  // window, faster than pruneExpired() can age them out.
  if (requestLog.size > RATE_LIMIT_MAX_KEYS) {
    const oldestKey = requestLog.keys().next().value;
    if (oldestKey !== undefined) requestLog.delete(oldestKey);
  }

  return timestamps.length > RATE_LIMIT_MAX_REQUESTS;
}

export function getClientKey(request: Request): string {
  // Prefer x-real-ip when a reverse proxy sets it — it's typically written by
  // our own infra (not the caller) so it's harder to spoof than XFF.
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  // x-forwarded-for is a client-supplied, comma-separated hop list; the first
  // entry is whatever the caller put there. The last entry is the one nearest
  // our own infra, so it's the harder one to spoof — still not authoritative,
  // just the best available signal without adding an edge/proxy dependency.
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor) return "unknown";
  const hops = forwardedFor
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops[hops.length - 1] ?? "unknown";
}
