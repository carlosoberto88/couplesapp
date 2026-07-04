// scripts/auth-test.ts
//
// Headless auth smoke test against a live Supabase project.
// Covers the email+password auth flow (magic link removed, email
// confirmation OFF) plus invite reconciliation on the sign-in path.
//
// - Anon-key client is used for all user actions (signUp,
//   signInWithPassword, rpc calls) — assertions go through real auth, not
//   the service role.
// - Service-role client is used only for setup (seeding the inviting
//   user's list) and teardown/verification (deleting the throwaway user,
//   checking profiles/list_members/list_invites rows directly).
//
// Usage: npm run test:auth
// Exits non-zero if any assertion fails.

import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  TEST_USER_A_EMAIL,
  TEST_USER_PASSWORD,
} from "./seed-test-users";

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

function newAnonClient(url: string, anonKey: string) {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: true },
  });
}

async function signInFixedUser(url: string, anonKey: string, email: string, password: string) {
  const client = newAnonClient(url, anonKey);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`Sign-in failed for ${email}: ${error?.message ?? "no user returned"}`);
  }
  return { client, userId: data.user.id };
}

async function main() {
  const { url, anonKey, serviceRoleKey } = getEnv();
  const serviceClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const throwawayEmail = `auth-test-${crypto.randomUUID()}@example.com`;
  const throwawayPassword = "Auth-Test-Password-1!";

  let throwawayUserId: string | null = null;
  let listId: string | null = null;

  try {
    // ---------- 1. Signup creates a usable session + profile ----------
    console.log("\n--- Assertion 1: signup creates a usable session + profile ---");
    const signUpClient = newAnonClient(url, anonKey);
    const { data: signUpData, error: signUpErr } = await signUpClient.auth.signUp({
      email: throwawayEmail,
      password: throwawayPassword,
    });
    assert("signUp succeeds", !signUpErr && !!signUpData.user, signUpErr?.message);
    throwawayUserId = signUpData.user?.id ?? null;
    assert(
      "signUp returns a session immediately (email confirmation is OFF)",
      !!signUpData.session,
      signUpData.session,
    );

    if (throwawayUserId) {
      const { data: profileRow, error: profileErr } = await serviceClient
        .from("profiles")
        .select("*")
        .eq("id", throwawayUserId)
        .maybeSingle();
      assert(
        "profiles row exists for new user (handle_new_user trigger)",
        !profileErr && !!profileRow,
        profileErr?.message ?? profileRow,
      );
    } else {
      fail("profiles row check skipped — no user id from signUp");
    }

    // ---------- 2. Sign in works ----------
    console.log("\n--- Assertion 2: sign in works ---");
    await signUpClient.auth.signOut();

    const signInClient = newAnonClient(url, anonKey);
    const { data: signInData, error: signInErr } = await signInClient.auth.signInWithPassword({
      email: throwawayEmail,
      password: throwawayPassword,
    });
    assert(
      "signInWithPassword with correct credentials returns a session",
      !signInErr && !!signInData.session,
      signInErr?.message,
    );

    // ---------- 3. Wrong password fails ----------
    console.log("\n--- Assertion 3: wrong password fails ---");
    const wrongPasswordClient = newAnonClient(url, anonKey);
    const { data: wrongPasswordData, error: wrongPasswordErr } =
      await wrongPasswordClient.auth.signInWithPassword({
        email: throwawayEmail,
        password: "definitely-the-wrong-password",
      });
    assert(
      "signInWithPassword with wrong password returns an error",
      !!wrongPasswordErr,
      "expected an auth error",
    );
    assert(
      "signInWithPassword with wrong password returns no session",
      !wrongPasswordData.session,
      wrongPasswordData.session,
    );

    // ---------- 4. Invite reconciliation on sign-in path ----------
    console.log("\n--- Assertion 4: invite reconciliation on sign-in path ---");
    const a = await signInFixedUser(url, anonKey, TEST_USER_A_EMAIL, TEST_USER_PASSWORD);

    const { data: createdId, error: createListErr } = await a.client.rpc("create_list", {
      p_name: "Auth Test List",
      p_type: "shopping",
    });
    assert("Seed user A creates a list via RPC", !createListErr && !!createdId, createListErr?.message);
    listId = (createdId as string) ?? null;

    if (listId) {
      // Uppercase on purpose — verifies lower() matching in accept_pending_invites.
      const { error: inviteErr } = await a.client.from("list_invites").insert({
        list_id: listId,
        email: throwawayEmail.toUpperCase(),
        invited_by: a.userId,
      });
      assert("A can invite the throwaway user (uppercase email)", !inviteErr, inviteErr?.message);

      const { data: acceptCount, error: acceptErr } = await signInClient.rpc(
        "accept_pending_invites",
      );
      assert(
        "Signed-in throwaway user's accept_pending_invites returns >= 1",
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

      const { data: secondAcceptCount, error: secondAcceptErr } = await signInClient.rpc(
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

    await a.client.auth.signOut();
    await signInClient.auth.signOut();
    await wrongPasswordClient.auth.signOut();
  } finally {
    console.log("\nCleanup...");
    if (listId) {
      const { error } = await serviceClient.from("lists").delete().eq("id", listId);
      if (error) console.log(`  (cleanup warning: list delete: ${error.message})`);
    }
    if (throwawayUserId) {
      const { error } = await serviceClient.auth.admin.deleteUser(throwawayUserId);
      if (error) console.log(`  (cleanup warning: user delete: ${error.message})`);
    }
  }

  console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
