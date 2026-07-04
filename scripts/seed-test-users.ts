// scripts/seed-test-users.ts
//
// Service-role script: creates the two fixed test accounts used by
// scripts/rls-test.ts. Safe to re-run — Supabase returns an "already
// registered" error for existing emails, which we treat as a no-op.
//
// Usage: npm run seed:test

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// dotenv/config only loads .env by default; this project's real env values
// live in .env.local (per Task 1 of the implementation plan).
config({ path: ".env.local" });

export const TEST_USER_A_EMAIL = "test-a@example.com";
export const TEST_USER_B_EMAIL = "test-b@example.com";
// Fixed password shared with scripts/rls-test.ts so both users can sign in
// with the anon key via password auth (no magic-link flow needed for tests).
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

async function ensureUser(
  admin: ReturnType<typeof getServiceRoleClient>,
  email: string,
  password: string,
) {
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    // Already exists — fine, this script is idempotent.
    if (
      error.status === 422 ||
      /already registered|already exists/i.test(error.message)
    ) {
      console.log(`  - ${email}: already exists, skipping`);
      return;
    }
    throw error;
  }

  console.log(`  - ${email}: created`);
}

async function main() {
  console.log("Seeding test users...");
  const admin = getServiceRoleClient();

  await ensureUser(admin, TEST_USER_A_EMAIL, TEST_USER_PASSWORD);
  await ensureUser(admin, TEST_USER_B_EMAIL, TEST_USER_PASSWORD);

  console.log("Done.");
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
}
