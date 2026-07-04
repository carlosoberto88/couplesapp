// scripts/auth-test.ts
//
// Headless auth/first-login smoke test against a live Supabase project,
// authenticated as a throwaway Clerk identity (Clerk owns signup/sign-in
// now — there is no Supabase-native signUp/signInWithPassword path left in
// this app, so this script exercises the equivalent Clerk-era flows: a
// brand-new Clerk user's FIRST session token, used (via its own RLS-scoped
// client, not service role) to replicate app/lists/layout.tsx's lazy
// profiles upsert + accept_pending_invites reconciliation — plus Clerk
// password verification as the closest headless equivalent to the old
// "wrong password fails" check.
//
// - Anon-key client with a Clerk accessToken callback is used for all
//   user-facing actions (profiles upsert, rpc calls) — assertions go
//   through real RLS, not the service role.
// - Service-role client + @clerk/backend are used only for setup (seeding
//   user A's list to invite the throwaway user into) and
//   teardown/verification (deleting the throwaway Clerk user + DB rows,
//   checking list_members/list_invites rows directly).
//
// Usage: pnpm test:auth
// Exits non-zero if any assertion fails.

import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  TEST_USER_A_EMAIL,
  TEST_USER_PASSWORD,
  setupTestUser,
} from "./seed-test-users";
import { ensureClerkUser, getClerkClient, makeTokenMinter, decodeJwtPayload } from "./clerk-test-helpers";

// dotenv/config only loads .env by default; this project's real env values
// live in .env.local (per Task 1 of the implementation plan).
config({ path: ".env.local" });

let failures = 0;

function pass(name: string) {
  console.log(`PASS: ${name}`);
}

function fail(name: string, details?: unknown) {
  failures++;
  console.log(`FAIL: ${name}${details !== undefined ? ` — ${JSON.stringify(details)}` : ""}`);
}

function assert(name: string, condition: boolean, details?: unknown) {
  if (condition) pass(name);
  else fail(name, details);
}

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }

  return { url, anonKey, serviceRoleKey };
}

function buildClerkClient(
  url: string,
  anonKey: string,
  mintOrRefresh: () => Promise<string>,
): SupabaseClient {
  return createClient(url, anonKey, {
    accessToken: async () => (await mintOrRefresh()) ?? null,
  });
}

async function main() {
  const { url, anonKey, serviceRoleKey } = getEnv();
  const serviceClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const clerk = getClerkClient();

  const throwawayEmail = `auth-test-${crypto.randomUUID()}@example.com`;
  const throwawayPassword = "Auth-Test-Password-1!";

  let throwawayUserId: string | null = null;
  let listId: string | null = null;

  try {
    // ---------- 1. Brand-new Clerk identity mints a valid session token ----------
    console.log("\n--- Assertion 1: brand-new Clerk identity mints a valid session token ---");
    throwawayUserId = await ensureClerkUser(clerk, throwawayEmail, throwawayPassword);
    assert("Clerk user created for throwaway email", !!throwawayUserId, throwawayUserId);

    const mintOrRefresh = makeTokenMinter(clerk, throwawayUserId);
    const firstToken = await mintOrRefresh();
    const claims = decodeJwtPayload(firstToken);
    assert("Minted token carries role:authenticated", claims.role === "authenticated", claims.role);
    assert(
      "Minted token carries email claim matching the new user",
      typeof claims.email === "string" && claims.email.toLowerCase() === throwawayEmail.toLowerCase(),
      claims.email,
    );
    assert("Minted token sub matches the new Clerk user id", claims.sub === throwawayUserId, claims.sub);

    const throwawayClient = buildClerkClient(url, anonKey, mintOrRefresh);

    // No profiles row exists yet — nothing has upserted it. Confirms this is
    // genuinely a first-login scenario, not reusing a pre-seeded fixture.
    const { data: profileBefore } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("id", throwawayUserId)
      .maybeSingle();
    assert(
      "No profiles row exists yet for the brand-new user (true first login)",
      !profileBefore,
      profileBefore,
    );

    // ---------- 2. First-login lazy profile upsert (app/lists/layout.tsx path) ----------
    console.log("\n--- Assertion 2: first-login lazy profile upsert succeeds under RLS ---");
    const { error: upsertErr } = await throwawayClient
      .from("profiles")
      .upsert({ id: throwawayUserId, email: throwawayEmail.toLowerCase() }, { onConflict: "id" });
    assert(
      "Throwaway user can upsert their own profiles row (own token, not service role)",
      !upsertErr,
      upsertErr?.message,
    );

    const { data: profileAfter, error: profileErr } = await serviceClient
      .from("profiles")
      .select("*")
      .eq("id", throwawayUserId)
      .maybeSingle();
    assert(
      "profiles row now exists for the new user (lazy upsert, no DB trigger)",
      !profileErr && !!profileAfter,
      profileErr?.message ?? profileAfter,
    );

    // ---------- 3. Password verification (Clerk-era equivalent of sign-in checks) ----------
    console.log("\n--- Assertion 3: Clerk password verification ---");
    const correctVerify = await clerk.users.verifyPassword({
      userId: throwawayUserId,
      password: throwawayPassword,
    });
    assert("Correct password verifies successfully", correctVerify.verified === true, correctVerify);

    // verifyPassword's success type is always `{ verified: true }` — a wrong
    // password rejects by throwing rather than returning `verified: false`.
    let wrongPasswordRejected = false;
    let wrongPasswordDetails: unknown;
    try {
      await clerk.users.verifyPassword({
        userId: throwawayUserId,
        password: "definitely-the-wrong-password",
      });
    } catch (err) {
      wrongPasswordRejected = true;
      wrongPasswordDetails = (err as Error).message;
    }
    assert("Wrong password fails verification", wrongPasswordRejected, wrongPasswordDetails);

    // ---------- 4. Invite reconciliation on first-login path ----------
    console.log("\n--- Assertion 4: invite reconciliation on first-login path ---");
    const a = await setupTestUser(TEST_USER_A_EMAIL, TEST_USER_PASSWORD);
    const clientA = buildClerkClient(url, anonKey, a.mintOrRefresh);

    const { data: createdId, error: createListErr } = await clientA.rpc("create_list", {
      p_name: "Auth Test List",
      p_type: "shopping",
    });
    assert("Seed user A creates a list via RPC", !createListErr && !!createdId, createListErr?.message);
    listId = (createdId as string) ?? null;

    if (listId) {
      // Uppercase on purpose — verifies lower() matching in accept_pending_invites.
      const { error: inviteErr } = await clientA.from("list_invites").insert({
        list_id: listId,
        email: throwawayEmail.toUpperCase(),
        invited_by: a.userId,
      });
      assert("A can invite the throwaway user (uppercase email)", !inviteErr, inviteErr?.message);

      const { data: acceptCount, error: acceptErr } = await throwawayClient.rpc(
        "accept_pending_invites",
      );
      assert(
        "First-login throwaway user's accept_pending_invites returns >= 1",
        !acceptErr && typeof acceptCount === "number" && acceptCount >= 1,
        acceptErr?.message ?? acceptCount,
      );

      const { data: memberRow } = await serviceClient
        .from("list_members")
        .select("*")
        .eq("list_id", listId)
        .eq("user_id", throwawayUserId)
        .maybeSingle();
      assert(
        "Throwaway user now has a list_members row",
        memberRow?.role === "member",
        memberRow,
      );

      const { data: inviteRow } = await serviceClient
        .from("list_invites")
        .select("*")
        .eq("list_id", listId)
        .ilike("email", throwawayEmail)
        .maybeSingle();
      assert("Invite status is accepted", inviteRow?.status === "accepted", inviteRow);

      const { data: secondAcceptCount, error: secondAcceptErr } = await throwawayClient.rpc(
        "accept_pending_invites",
      );
      assert(
        "Repeated accept_pending_invites returns 0 (idempotent)",
        !secondAcceptErr && secondAcceptCount === 0,
        secondAcceptErr?.message ?? secondAcceptCount,
      );
    } else {
      fail("Assertion 4 invite steps skipped — no listId from create_list");
    }
  } finally {
    console.log("\nCleanup...");
    if (listId) {
      const { error } = await serviceClient.from("lists").delete().eq("id", listId);
      if (error) console.log(`  (cleanup warning: list delete: ${error.message})`);
    }
    if (throwawayUserId) {
      // profiles row cascades away with the Clerk user delete's DB-side
      // counterpart below (no DB FK to Clerk itself — delete the profiles
      // row directly via service role since there is no auth.users trigger
      // to rely on under the Clerk re-key).
      const { error } = await serviceClient.from("profiles").delete().eq("id", throwawayUserId);
      if (error) console.log(`  (cleanup warning: profiles delete: ${error.message})`);
      await clerk.users.deleteUser(throwawayUserId).catch((err) => {
        console.log(`  (cleanup warning: Clerk deleteUser: ${(err as Error).message})`);
      });
    }
  }

  console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
