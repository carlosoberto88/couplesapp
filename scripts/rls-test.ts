// scripts/rls-test.ts
//
// RLS + invite-reconciliation smoke test against a live Supabase project.
// Two anon-key clients signed in with password as user A and user B
// exercise the policies from supabase/migrations/0001_init.sql; a
// service-role client is used only for setup/teardown (never for
// assertions — assertions must go through RLS).
//
// Usage: npm run test:rls
// Exits non-zero if any assertion fails.

import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  TEST_USER_A_EMAIL,
  TEST_USER_B_EMAIL,
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

async function signIn(url: string, anonKey: string, email: string, password: string) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`Sign-in failed for ${email}: ${error?.message ?? "no user returned"}`);
  }
  return { client, userId: data.user.id };
}

// Idempotent teardown: remove any lists owned by the test users (cascades
// to list_members / list_invites / items via FK). Safe to call before and
// after the test run.
async function cleanup(serviceClient: SupabaseClient, ownerIds: string[]) {
  if (ownerIds.length === 0) return;
  const { error } = await serviceClient.from("lists").delete().in("owner_id", ownerIds);
  if (error) {
    console.log(`  (cleanup warning: ${error.message})`);
  }
}

async function main() {
  const { url, anonKey, serviceRoleKey } = getEnv();
  const serviceClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Signing in test users...");
  const a = await signIn(url, anonKey, TEST_USER_A_EMAIL, TEST_USER_PASSWORD);
  const b = await signIn(url, anonKey, TEST_USER_B_EMAIL, TEST_USER_PASSWORD);
  const clientA = a.client;
  const clientB = b.client;
  const userAId = a.userId;
  const userBId = b.userId;

  console.log("Pre-run cleanup (idempotent)...");
  await cleanup(serviceClient, [userAId, userBId]);

  let listId: string | null = null;
  let itemId: string | null = null;

  try {
    // ---------- 1. Member can CRUD ----------
    console.log("\n--- Assertion 1: member can CRUD ---");
    {
      const { data: createdId, error } = await clientA.rpc("create_list", {
        p_name: "Groceries",
        p_type: "shopping",
      });
      assert("A creates list via RPC", !error && !!createdId, error?.message);
      listId = (createdId as string) ?? null;

      if (listId) {
        const { data: listRow, error: listErr } = await clientA
          .from("lists")
          .select("*")
          .eq("id", listId)
          .maybeSingle();
        assert("A can read the list they just created", !listErr && !!listRow, listErr?.message);
        assert(
          "List owner_id is A",
          listRow?.owner_id === userAId,
          listRow?.owner_id,
        );

        const { data: memberRow, error: memberErr } = await clientA
          .from("list_members")
          .select("*")
          .eq("list_id", listId)
          .eq("user_id", userAId)
          .maybeSingle();
        assert(
          "A has an owner list_members row",
          !memberErr && memberRow?.role === "owner",
          memberErr?.message ?? memberRow,
        );

        const { data: insertedItem, error: insertErr } = await clientA
          .from("items")
          .insert({ list_id: listId, name: "Milk", created_by: userAId })
          .select()
          .maybeSingle();
        assert("A can insert an item", !insertErr && !!insertedItem, insertErr?.message);
        itemId = (insertedItem?.id as string) ?? null;
      }
    }

    // ---------- 2. Non-member denied ----------
    console.log("\n--- Assertion 2: non-member denied ---");
    if (listId && itemId) {
      const { data: listSeenByB } = await clientB.from("lists").select("*").eq("id", listId);
      assert("B cannot select A's list", (listSeenByB ?? []).length === 0, listSeenByB);

      const { data: itemsSeenByB } = await clientB
        .from("items")
        .select("*")
        .eq("list_id", listId);
      assert("B cannot select A's items", (itemsSeenByB ?? []).length === 0, itemsSeenByB);

      const { data: membersSeenByB } = await clientB
        .from("list_members")
        .select("*")
        .eq("list_id", listId);
      assert("B cannot select A's list_members", (membersSeenByB ?? []).length === 0, membersSeenByB);

      const { error: insertItemErr } = await clientB
        .from("items")
        .insert({ list_id: listId, name: "Intruder item", created_by: userBId });
      assert("B cannot insert an item into A's list", !!insertItemErr, "expected an RLS error");

      const { data: updatedItem } = await clientB
        .from("items")
        .update({ name: "Hacked" })
        .eq("id", itemId)
        .select();
      assert("B updating A's item affects 0 rows", (updatedItem ?? []).length === 0, updatedItem);

      const { data: deletedItem } = await clientB
        .from("items")
        .delete()
        .eq("id", itemId)
        .select();
      assert("B deleting A's item affects 0 rows", (deletedItem ?? []).length === 0, deletedItem);

      const { data: renamedList } = await clientB
        .from("lists")
        .update({ name: "Renamed by B" })
        .eq("id", listId)
        .select();
      assert("B renaming A's list affects 0 rows", (renamedList ?? []).length === 0, renamedList);

      const { data: archivedList } = await clientB
        .from("lists")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", listId)
        .select();
      assert("B archiving A's list affects 0 rows", (archivedList ?? []).length === 0, archivedList);

      const { data: deletedList } = await clientB
        .from("lists")
        .delete()
        .eq("id", listId)
        .select();
      assert("B deleting A's list affects 0 rows", (deletedList ?? []).length === 0, deletedList);

      const { error: inviteInsertErr } = await clientB
        .from("list_invites")
        .insert({ list_id: listId, email: TEST_USER_B_EMAIL, invited_by: userBId });
      assert(
        "B cannot create a list_invites row for A's list",
        !!inviteInsertErr,
        "expected an RLS error",
      );
    } else {
      fail("Assertion 2 skipped — no listId/itemId from Assertion 1");
    }

    // ---------- 3. Invite reconciliation ----------
    console.log("\n--- Assertion 3: invite reconciliation ---");
    if (listId) {
      // Uppercase on purpose — verifies lower() matching in accept_pending_invites.
      const { error: inviteErr } = await clientA.from("list_invites").insert({
        list_id: listId,
        email: TEST_USER_B_EMAIL.toUpperCase(),
        invited_by: userAId,
      });
      assert("A can invite B (uppercase email)", !inviteErr, inviteErr?.message);

      const { data: acceptCount, error: acceptErr } = await clientB.rpc(
        "accept_pending_invites",
      );
      assert(
        "B's accept_pending_invites returns 1",
        !acceptErr && acceptCount === 1,
        acceptErr?.message ?? acceptCount,
      );

      const { data: memberRow } = await serviceClient
        .from("list_members")
        .select("*")
        .eq("list_id", listId)
        .eq("user_id", userBId)
        .maybeSingle();
      assert(
        "B now has a member list_members row",
        memberRow?.role === "member",
        memberRow,
      );

      const { data: inviteRow } = await serviceClient
        .from("list_invites")
        .select("*")
        .eq("list_id", listId)
        .ilike("email", TEST_USER_B_EMAIL)
        .maybeSingle();
      assert("Invite status is accepted", inviteRow?.status === "accepted", inviteRow);

      const { data: listSeenByB } = await clientB
        .from("lists")
        .select("*")
        .eq("id", listId)
        .maybeSingle();
      assert("B can now read the list", !!listSeenByB, listSeenByB);

      const { data: bItem, error: bInsertErr } = await clientB
        .from("items")
        .insert({ list_id: listId, name: "Eggs", created_by: userBId })
        .select()
        .maybeSingle();
      assert("B can insert an item", !bInsertErr && !!bItem, bInsertErr?.message);

      if (bItem) {
        const { data: checkedItem, error: checkErr } = await clientB
          .from("items")
          .update({ checked_at: new Date().toISOString(), checked_by: userBId })
          .eq("id", bItem.id)
          .select()
          .maybeSingle();
        assert("B can check the item", !checkErr && !!checkedItem?.checked_at, checkErr?.message);

        const { data: deletedBItem, error: bDeleteErr } = await clientB
          .from("items")
          .delete()
          .eq("id", bItem.id)
          .select();
        assert(
          "B can delete the item",
          !bDeleteErr && (deletedBItem ?? []).length === 1,
          bDeleteErr?.message,
        );
      }
    } else {
      fail("Assertion 3 skipped — no listId from Assertion 1");
    }

    // ---------- 4. Idempotency + wrong-email invite ----------
    console.log("\n--- Assertion 4: idempotency + wrong-email invite ---");
    if (listId) {
      const { data: secondAcceptCount, error: secondAcceptErr } = await clientB.rpc(
        "accept_pending_invites",
      );
      assert(
        "Repeated accept_pending_invites returns 0",
        !secondAcceptErr && secondAcceptCount === 0,
        secondAcceptErr?.message ?? secondAcceptCount,
      );

      const { data: memberRows } = await serviceClient
        .from("list_members")
        .select("*")
        .eq("list_id", listId)
        .eq("user_id", userBId);
      assert(
        "No duplicate membership row for B",
        (memberRows ?? []).length === 1,
        memberRows,
      );

      const { error: wrongInviteErr } = await clientA.from("list_invites").insert({
        list_id: listId,
        email: "someone-else@example.com",
        invited_by: userAId,
      });
      assert("A can create a wrong-email invite", !wrongInviteErr, wrongInviteErr?.message);

      const { data: thirdAcceptCount } = await clientB.rpc("accept_pending_invites");
      assert(
        "Wrong-email invite is not accepted by B",
        thirdAcceptCount === 0,
        thirdAcceptCount,
      );

      const { data: wrongInviteRow } = await serviceClient
        .from("list_invites")
        .select("*")
        .eq("list_id", listId)
        .eq("email", "someone-else@example.com")
        .maybeSingle();
      assert(
        "Wrong-email invite remains pending",
        wrongInviteRow?.status === "pending",
        wrongInviteRow,
      );
    } else {
      fail("Assertion 4 skipped — no listId from Assertion 1");
    }

    // ---------- 5. Owner-only actions ----------
    console.log("\n--- Assertion 5: owner-only actions ---");
    if (listId) {
      const { data: renamedByB } = await clientB
        .from("lists")
        .update({ name: "Renamed by B (member)" })
        .eq("id", listId)
        .select();
      assert(
        "Member B cannot rename the list",
        (renamedByB ?? []).length === 0,
        renamedByB,
      );

      const { data: archivedByB } = await clientB
        .from("lists")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", listId)
        .select();
      assert(
        "Member B cannot archive the list",
        (archivedByB ?? []).length === 0,
        archivedByB,
      );

      const { data: deletedByB } = await clientB.from("lists").delete().eq("id", listId).select();
      assert(
        "Member B cannot delete the list",
        (deletedByB ?? []).length === 0,
        deletedByB,
      );

      const { data: removedMemberByB } = await clientB
        .from("list_members")
        .delete()
        .eq("list_id", listId)
        .eq("user_id", userBId)
        .select();
      assert(
        "Member B cannot remove members",
        (removedMemberByB ?? []).length === 0,
        removedMemberByB,
      );

      const { data: archivedByA, error: archiveErr } = await clientA
        .from("lists")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", listId)
        .select()
        .maybeSingle();
      assert(
        "Owner A can archive the list",
        !archiveErr && !!archivedByA?.archived_at,
        archiveErr?.message,
      );

      const { data: deletedByA, error: deleteErr } = await clientA
        .from("lists")
        .delete()
        .eq("id", listId)
        .select()
        .maybeSingle();
      assert("Owner A can delete the list", !deleteErr && !!deletedByA, deleteErr?.message);
      if (!deleteErr && deletedByA) {
        listId = null; // already deleted, avoid double-cleanup
      }
    } else {
      fail("Assertion 5 skipped — no listId from Assertion 1");
    }
  } finally {
    console.log("\nPost-run cleanup (idempotent)...");
    await cleanup(serviceClient, [userAId, userBId]);
    await clientA.auth.signOut();
    await clientB.auth.signOut();
  }

  console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
