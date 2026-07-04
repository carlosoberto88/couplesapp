// scripts/clerk-test-helpers.ts
//
// Shared helpers for minting Clerk-acceptable Supabase access tokens in the
// test harness (seed-test-users.ts, rls-test.ts, auth-test.ts). Not imported
// by application code — test-only.
//
// Technique: create a Clerk Backend API session for a test user, then mint
// short-lived (~60s) session tokens from it on demand. Supabase's
// third-party-auth integration accepts these directly via the `accessToken`
// client option — no `signInWithPassword` / GoTrue involved.

import { createClerkClient } from "@clerk/backend";

export function getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing CLERK_SECRET_KEY in .env.local");
  }
  return createClerkClient({ secretKey });
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("Malformed JWT");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

// Creates (or reuses, if already exists) a Clerk user for the given email +
// password. Returns the Clerk user id (`user_...`), which is also the id
// stored in public.profiles under the Clerk migration's re-key.
export async function ensureClerkUser(
  clerk: ReturnType<typeof getClerkClient>,
  email: string,
  password: string,
): Promise<string> {
  const existing = await clerk.users.getUserList({ emailAddress: [email] });
  if (existing.data.length > 0) {
    return existing.data[0].id;
  }

  try {
    const user = await clerk.users.createUser({
      emailAddress: [email],
      // This Clerk instance requires a username on creation even though the
      // app's own sign-up flow doesn't collect one from end users.
      username: `couplestest${Date.now()}${Math.floor(Math.random() * 1000)}`,
      password,
      skipPasswordChecks: false,
    });
    return user.id;
  } catch (err) {
    // Race-safe fallback: another concurrent run may have created it first.
    const anyErr = err as { errors?: { code?: string }[] };
    const duplicate = anyErr.errors?.some(
      (e) => e.code === "form_identifier_exists" || e.code === "duplicate_record",
    );
    if (duplicate) {
      const retry = await clerk.users.getUserList({ emailAddress: [email] });
      if (retry.data.length > 0) return retry.data[0].id;
    }
    throw err;
  }
}

// A per-user token minter: creates one Clerk session up front, then mints a
// fresh (up to ~60s TTL) JWT on every call — cheap re-mint, no rate-limit
// pressure since we only call it when the cached token is close to expiry.
export function makeTokenMinter(clerk: ReturnType<typeof getClerkClient>, userId: string) {
  let sessionId: string | null = null;
  let cachedToken: string | null = null;
  let cachedExp = 0;

  return async function mintOrRefresh(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && cachedExp - now > 10) {
      return cachedToken;
    }
    if (!sessionId) {
      const session = await clerk.sessions.createSession({ userId });
      sessionId = session.id;
    }
    const { jwt } = await clerk.sessions.getToken(sessionId);
    cachedToken = jwt as string;
    cachedExp = (decodeJwtPayload(cachedToken).exp as number) ?? now + 60;
    return cachedToken;
  };
}
