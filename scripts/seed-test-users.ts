// scripts/seed-test-users.ts
//
// Creates the two fixed Clerk test identities used by scripts/rls-test.ts
// and scripts/auth-test.ts, and seeds their public.profiles rows via the
// service-role Supabase client (Clerk owns identity; there is no
// handle_new_user trigger under the Clerk re-key — profiles are created by
// a lazy upsert in the app, which this script replicates for test setup).
//
// Safe to re-run: Clerk user creation is idempotent (looked up by email
// first), and the profiles upsert is an upsert.
//
// Usage: pnpm seed:test

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { ensureClerkUser, getClerkClient, makeTokenMinter, decodeJwtPayload } from "./clerk-test-helpers";

// dotenv/config only loads .env by default; this project's real env values
// live in .env.local (per Task 1 of the implementation plan).
config({ path: ".env.local" });

export const TEST_USER_A_EMAIL = "test-a@example.com";
export const TEST_USER_B_EMAIL = "test-b@example.com";
// Fixed password shared with scripts/rls-test.ts / auth-test.ts.
export const TEST_USER_PASSWORD = "Couples-Test-Password-1!";

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Resolves the Clerk user id + a token-minting function for a fixed test
// email, seeding public.profiles for it via the service-role client
// (standing in for the app's lazy profile upsert). Exported so rls-test.ts
// and auth-test.ts can build their per-user Supabase clients without
// re-deriving ids.
export async function setupTestUser(email: string, password: string) {
  const clerk = getClerkClient();
  const userId = await ensureClerkUser(clerk, email, password);

  const admin = getServiceRoleClient();
  const { error } = await admin
    .from("profiles")
    .upsert({ id: userId, email }, { onConflict: "id" });
  if (error) {
    throw new Error(`Failed to seed profiles row for ${email} (${userId}): ${error.message}`);
  }

  const mintOrRefresh = makeTokenMinter(clerk, userId);

  // Preflight: assert a minted token actually carries role:authenticated +
  // email, per Task 9's safety-net requirement — fail loudly here rather
  // than let rls-test.ts/auth-test.ts silently exercise the anon role.
  const token = await mintOrRefresh();
  const claims = decodeJwtPayload(token);
  if (claims.role !== "authenticated") {
    throw new Error(
      `Preflight failed for ${email}: minted token role is "${String(claims.role)}", expected "authenticated"`,
    );
  }
  if (typeof claims.email !== "string" || claims.email.toLowerCase() !== email.toLowerCase()) {
    throw new Error(
      `Preflight failed for ${email}: minted token email claim is "${String(claims.email)}", expected "${email}"`,
    );
  }
  if (claims.sub !== userId) {
    throw new Error(
      `Preflight failed for ${email}: minted token sub "${String(claims.sub)}" does not match Clerk user id "${userId}"`,
    );
  }

  return { userId, mintOrRefresh, clerk };
}

export async function deleteTestUser(clerk: ReturnType<typeof getClerkClient>, userId: string) {
  await clerk.users.deleteUser(userId).catch((err) => {
    console.log(`  (cleanup warning: deleteUser ${userId}: ${(err as Error).message})`);
  });
}

async function main() {
  console.log("Seeding Clerk test users + profiles rows...");

  const a = await setupTestUser(TEST_USER_A_EMAIL, TEST_USER_PASSWORD);
  console.log(`  - ${TEST_USER_A_EMAIL}: id=${a.userId}, preflight OK (role:authenticated + email)`);

  const b = await setupTestUser(TEST_USER_B_EMAIL, TEST_USER_PASSWORD);
  console.log(`  - ${TEST_USER_B_EMAIL}: id=${b.userId}, preflight OK (role:authenticated + email)`);

  console.log("Done.");
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
}
