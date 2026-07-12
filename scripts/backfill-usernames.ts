// scripts/backfill-usernames.ts
//
// One-time backfill of public.profiles.username from Clerk, for rows that
// predate the username column (0026_profiles_username.sql) or the lazy
// upsert in authenticated-shell.tsx. Pages through profiles where
// username is null, looks each one up in Clerk, and writes the username
// if Clerk has one.
//
// Idempotent / safe to re-run: it only ever targets rows still missing a
// username, and a Clerk user with no username is simply skipped (left
// null) rather than erroring.
//
// Usage: pnpm backfill:usernames

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { getClerkClient } from "./clerk-test-helpers";

// dotenv/config only loads .env by default; this project's real env values
// live in .env.local (per Task 1 of the implementation plan).
config({ path: ".env.local" });

const PAGE_SIZE = 200;

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

async function main() {
  console.log("Backfilling profiles.username from Clerk...");

  const admin = getServiceRoleClient();
  const clerk = getClerkClient();

  let updated = 0;
  let skippedNoUsername = 0;
  let errored = 0;
  // Keyset (cursor) pagination on id, not offset: rows updated mid-run drop
  // out of the `username is null` filter, which would desync an offset
  // against a shrinking result set. A `gt("id", cursor)` cursor advances
  // past every row we've already looked at (updated, skipped, or errored)
  // regardless of how the filtered set shrinks.
  let cursor = "";

  for (;;) {
    let query = admin
      .from("profiles")
      .select("id")
      .is("username", null)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    if (cursor) query = query.gt("id", cursor);

    const { data: rows, error } = await query;

    if (error) {
      throw new Error(`Failed to page profiles after cursor "${cursor}": ${error.message}`);
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      try {
        const clerkUser = await clerk.users.getUser(row.id);
        if (!clerkUser.username) {
          skippedNoUsername++;
          continue;
        }

        const { error: updateError } = await admin
          .from("profiles")
          .update({ username: clerkUser.username })
          .eq("id", row.id);
        if (updateError) throw updateError;

        updated++;
      } catch (err) {
        errored++;
        console.error(`  (error) profile ${row.id}: ${(err as Error).message}`);
      }
    }

    cursor = rows[rows.length - 1].id;
    if (rows.length < PAGE_SIZE) break;
  }

  console.log(
    `Done. updated=${updated} skipped-no-clerk-username=${skippedNoUsername} errors=${errored}`,
  );
  if (errored > 0) process.exitCode = 1;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
}
