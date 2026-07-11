// scripts/rls-test.ts
//
// RLS + invite-reconciliation smoke test against a live Supabase project,
// authenticated as real Clerk identities (Supabase third-party auth via
// Clerk session tokens — no Supabase-native signInWithPassword/GoTrue
// involved). Two per-user Supabase clients (A, B) built with an
// `accessToken` callback that mints/re-mints short-lived (~60s) Clerk
// session tokens exercise the policies from
// supabase/migrations/0003_clerk_identity_reset.sql; a service-role client
// is used only for setup/teardown/verification (never for assertions —
// assertions must go through RLS).
//
// Usage: pnpm test:rls
// Exits non-zero if any assertion fails.

import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  TEST_USER_A_EMAIL,
  TEST_USER_B_EMAIL,
  TEST_USER_PASSWORD,
  setupTestUser,
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

function buildClerkClient(
  url: string,
  anonKey: string,
  mintOrRefresh: () => Promise<string>,
): SupabaseClient {
  return createClient(url, anonKey, {
    accessToken: async () => (await mintOrRefresh()) ?? null,
  });
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

  console.log("Setting up Clerk test users (A, B)...");
  const a = await setupTestUser(TEST_USER_A_EMAIL, TEST_USER_PASSWORD);
  const b = await setupTestUser(TEST_USER_B_EMAIL, TEST_USER_PASSWORD);
  const clientA = buildClerkClient(url, anonKey, a.mintOrRefresh);
  const clientB = buildClerkClient(url, anonKey, b.mintOrRefresh);
  const userAId = a.userId;
  const userBId = b.userId;

  console.log("Pre-run cleanup (idempotent)...");
  await cleanup(serviceClient, [userAId, userBId]);

  let listId: string | null = null;
  let itemId: string | null = null;

  try {
    // ---------- 0. profiles row: own sub yes, mismatched id no ----------
    console.log("\n--- Assertion 0: profiles upsert scoped to own Clerk sub ---");
    {
      const { error: ownUpsertErr } = await clientA
        .from("profiles")
        .upsert({ id: userAId, email: TEST_USER_A_EMAIL }, { onConflict: "id" });
      assert("A can upsert their own profiles row (own sub)", !ownUpsertErr, ownUpsertErr?.message);

      const { data: mismatchedRow, error: mismatchedErr } = await clientA
        .from("profiles")
        .upsert({ id: userBId, email: "spoofed@example.com" }, { onConflict: "id" })
        .select();
      assert(
        "A cannot upsert a profiles row under B's id (mismatched sub)",
        !!mismatchedErr || (mismatchedRow ?? []).length === 0,
        mismatchedErr?.message ?? mismatchedRow,
      );

      const { data: bProfileAfter } = await serviceClient
        .from("profiles")
        .select("email")
        .eq("id", userBId)
        .maybeSingle();
      assert(
        "B's profiles row was not overwritten by A's spoof attempt",
        bProfileAfter?.email === TEST_USER_B_EMAIL,
        bProfileAfter,
      );
    }

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

    // ---------- 4.5. Recurring lists + is_extra/removed_at soft delete (0012) ----------
    console.log("\n--- Assertion 4.5: recurring lists + is_extra/removed_at ---");
    if (listId && itemId) {
      // Non-owner member B can flag/unflag is_extra and stamp/clear removed_at
      // on an item created by owner A — items_update_member has no column
      // restrictions.
      const { data: extraFlagged, error: extraErr } = await clientB
        .from("items")
        .update({ is_extra: true })
        .eq("id", itemId)
        .select()
        .maybeSingle();
      assert(
        "Non-owner B can flag partner-created item as is_extra",
        !extraErr && extraFlagged?.is_extra === true,
        extraErr?.message ?? extraFlagged,
      );

      const { data: removedStamp, error: removeErr } = await clientB
        .from("items")
        .update({ removed_at: new Date().toISOString() })
        .eq("id", itemId)
        .select()
        .maybeSingle();
      assert(
        "Non-owner B can soft-remove (stamp removed_at) partner-created item",
        !removeErr && !!removedStamp?.removed_at,
        removeErr?.message ?? removedStamp,
      );

      const { data: removedCleared, error: undoErr } = await clientB
        .from("items")
        .update({ removed_at: null })
        .eq("id", itemId)
        .select()
        .maybeSingle();
      assert(
        "Non-owner B can undo soft-remove (clear removed_at) on partner-created item",
        !undoErr && removedCleared?.removed_at === null,
        undoErr?.message ?? removedCleared,
      );

      // aisle + position (0013): items_update_member has no column
      // restrictions, so non-owner B can update both on A's item.
      const { data: aisleAndPositionUpdated, error: aisleErr } = await clientB
        .from("items")
        .update({ aisle: "Dairy", position: 2 })
        .eq("id", itemId)
        .select()
        .maybeSingle();
      assert(
        "Non-owner B can update aisle and position on partner-created item",
        !aisleErr &&
          aisleAndPositionUpdated?.aisle === "Dairy" &&
          aisleAndPositionUpdated?.position === 2,
        aisleErr?.message ?? aisleAndPositionUpdated,
      );

      // lists.recurring: owner-only, same as rename/archive.
      const { data: recurringByB } = await clientB
        .from("lists")
        .update({ recurring: true })
        .eq("id", listId)
        .select();
      assert(
        "Non-owner B cannot update lists.recurring",
        (recurringByB ?? []).length === 0,
        recurringByB,
      );

      const { data: recurringByA, error: recurringErr } = await clientA
        .from("lists")
        .update({ recurring: true })
        .eq("id", listId)
        .select()
        .maybeSingle();
      assert(
        "Owner A can update lists.recurring",
        !recurringErr && recurringByA?.recurring === true,
        recurringErr?.message ?? recurringByA,
      );

      // create_list: 3-arg RPC works with and without p_recurring.
      const { data: recurringListId, error: recurringCreateErr } = await clientA.rpc(
        "create_list",
        { p_name: "Weekly groceries", p_type: "shopping", p_recurring: true },
      );
      assert(
        "A creates list via RPC with p_recurring: true",
        !recurringCreateErr && !!recurringListId,
        recurringCreateErr?.message,
      );
      if (recurringListId) {
        const { data: recurringListRow } = await serviceClient
          .from("lists")
          .select("recurring")
          .eq("id", recurringListId)
          .maybeSingle();
        assert(
          "List created with p_recurring: true has recurring = true",
          recurringListRow?.recurring === true,
          recurringListRow,
        );
      }

      const { data: defaultListId, error: defaultCreateErr } = await clientA.rpc("create_list", {
        p_name: "One-off list",
        p_type: "shopping",
      });
      assert(
        "A creates list via RPC without p_recurring",
        !defaultCreateErr && !!defaultListId,
        defaultCreateErr?.message,
      );
      if (defaultListId) {
        const { data: defaultListRow } = await serviceClient
          .from("lists")
          .select("recurring")
          .eq("id", defaultListId)
          .maybeSingle();
        assert(
          "List created without p_recurring defaults recurring = false",
          defaultListRow?.recurring === false,
          defaultListRow,
        );
      }
    } else {
      fail("Assertion 4.5 skipped — no listId/itemId from Assertion 1");
    }

    // ---------- 4.6. assigned_to (0023) ----------
    console.log("\n--- Assertion 4.6: assigned_to (0023) ---");
    if (listId && itemId) {
      // Non-owner B can assign a partner-created item to self.
      const { data: selfAssigned, error: selfAssignErr } = await clientB
        .from("items")
        .update({ assigned_to: userBId })
        .eq("id", itemId)
        .select()
        .maybeSingle();
      assert(
        "Non-owner B can assign partner-created item to self",
        !selfAssignErr && selfAssigned?.assigned_to === userBId,
        selfAssignErr?.message ?? selfAssigned,
      );

      // Non-owner B can also assign it to the other list member (A).
      const { data: partnerAssigned, error: partnerAssignErr } = await clientB
        .from("items")
        .update({ assigned_to: userAId })
        .eq("id", itemId)
        .select()
        .maybeSingle();
      assert(
        "Non-owner B can assign partner-created item to the other list member",
        !partnerAssignErr && partnerAssigned?.assigned_to === userAId,
        partnerAssignErr?.message ?? partnerAssigned,
      );

      // A real profiles row that is NOT a member of this list — the
      // tightened WITH CHECK must reject it even though the FK alone would
      // allow it (a real profile exists, just not scoped to this list).
      const outsiderId = `test-outsider-${crypto.randomUUID()}`;
      const { error: outsiderProfileErr } = await serviceClient
        .from("profiles")
        .insert({ id: outsiderId, email: "outsider@example.com" });
      assert(
        "Seeded an outsider profile that is not a member of this list",
        !outsiderProfileErr,
        outsiderProfileErr?.message,
      );

      const { data: outsiderAssigned, error: outsiderAssignErr } = await clientB
        .from("items")
        .update({ assigned_to: outsiderId })
        .eq("id", itemId)
        .select();
      assert(
        "B cannot assign an item to a profile that is not a member of this list",
        !!outsiderAssignErr || (outsiderAssigned ?? []).length === 0,
        outsiderAssignErr?.message ?? outsiderAssigned,
      );

      await serviceClient.from("profiles").delete().eq("id", outsiderId);

      // Regression: the tightened WITH CHECK re-validates on every update,
      // so a check, a rename and a reorder on the same (still-assigned) row
      // must still succeed — assigned_to is unchanged, so the new clause is
      // a no-op.
      const { data: checkedAfterAssign, error: checkAfterAssignErr } = await clientB
        .from("items")
        .update({ checked_at: new Date().toISOString(), checked_by: userBId })
        .eq("id", itemId)
        .select()
        .maybeSingle();
      assert(
        "Check still succeeds on an item with assigned_to set",
        !checkAfterAssignErr && !!checkedAfterAssign?.checked_at,
        checkAfterAssignErr?.message ?? checkedAfterAssign,
      );

      const { data: renamedAfterAssign, error: renameAfterAssignErr } = await clientB
        .from("items")
        .update({ name: "Milk (2%)" })
        .eq("id", itemId)
        .select()
        .maybeSingle();
      assert(
        "Rename still succeeds on an item with assigned_to set",
        !renameAfterAssignErr && renamedAfterAssign?.name === "Milk (2%)",
        renameAfterAssignErr?.message ?? renamedAfterAssign,
      );

      const { data: reorderedAfterAssign, error: reorderAfterAssignErr } = await clientB
        .from("items")
        .update({ position: 5 })
        .eq("id", itemId)
        .select()
        .maybeSingle();
      assert(
        "Reorder still succeeds on an item with assigned_to set",
        !reorderAfterAssignErr && reorderedAfterAssign?.position === 5,
        reorderAfterAssignErr?.message ?? reorderedAfterAssign,
      );

      // Clear assignment back to unassigned before the item is deleted below.
      await clientB.from("items").update({ assigned_to: null }).eq("id", itemId);
    } else {
      fail("Assertion 4.6 skipped — no listId/itemId from Assertion 1");
    }

    // ---------- 4.6b. assigned_to on INSERT (0023 items_insert_member) ----------
    console.log("\n--- Assertion 4.6b: assigned_to on insert (0023) ---");
    if (listId) {
      // Same non-member outsider as 4.6 — the tightened items_insert_member
      // WITH CHECK must reject an insert that assigns straight to them.
      const insertOutsiderId = `test-outsider-${crypto.randomUUID()}`;
      const { error: insertOutsiderProfileErr } = await serviceClient
        .from("profiles")
        .insert({ id: insertOutsiderId, email: "outsider-insert@example.com" });
      assert(
        "Seeded an outsider profile for the insert-path check",
        !insertOutsiderProfileErr,
        insertOutsiderProfileErr?.message,
      );

      const { data: outsiderInsertedItem, error: outsiderInsertErr } = await clientB
        .from("items")
        .insert({
          list_id: listId,
          name: "Bad Assign",
          created_by: userBId,
          assigned_to: insertOutsiderId,
        })
        .select();
      assert(
        "B cannot insert an item pre-assigned to a profile that is not a member of this list",
        !!outsiderInsertErr || (outsiderInsertedItem ?? []).length === 0,
        outsiderInsertErr?.message ?? outsiderInsertedItem,
      );

      // Control: the same insert with assigned_to left null still succeeds —
      // proves the WITH CHECK blocks non-members, not inserts in general.
      const { data: nullAssignedInsertedItem, error: nullAssignedInsertErr } = await clientB
        .from("items")
        .insert({
          list_id: listId,
          name: "Good Assign",
          created_by: userBId,
          assigned_to: null,
        })
        .select()
        .maybeSingle();
      assert(
        "B can still insert an item with assigned_to left null",
        !nullAssignedInsertErr && !!nullAssignedInsertedItem,
        nullAssignedInsertErr?.message ?? nullAssignedInsertedItem,
      );

      if (nullAssignedInsertedItem?.id) {
        await serviceClient.from("items").delete().eq("id", nullAssignedInsertedItem.id as string);
      }
      await serviceClient.from("profiles").delete().eq("id", insertOutsiderId);
    } else {
      fail("Assertion 4.6b skipped — no listId from Assertion 1");
    }

    // ---------- 4.7. assigned_to cleared on member removal (0023 trigger) ----------
    console.log("\n--- Assertion 4.7: assigned_to cleared on member removal (0023) ---");
    if (listId && itemId) {
      // Re-assign to B so the removal below has something to clear.
      const { error: reassignErr } = await clientB
        .from("items")
        .update({ assigned_to: userBId })
        .eq("id", itemId);
      assert("B can re-assign item to self ahead of removal test", !reassignErr, reassignErr?.message);

      // Owner A removes B from the list (temporary — B is re-added below so
      // Assertion 5's own removal test still has B as a member).
      const { data: removedByA, error: removeErr } = await clientA
        .from("list_members")
        .delete()
        .eq("list_id", listId)
        .eq("user_id", userBId)
        .select()
        .maybeSingle();
      assert(
        "Owner A can remove member B ahead of assigned_to cleanup check",
        !removeErr && removedByA?.user_id === userBId,
        removeErr?.message ?? removedByA,
      );

      // B lost list access, so read the item via the service-role client.
      const { data: itemAfterRemoval, error: itemAfterRemovalErr } = await serviceClient
        .from("items")
        .select("assigned_to")
        .eq("id", itemId)
        .maybeSingle();
      assert(
        "Trigger clears assigned_to after the assignee is removed from the list",
        !itemAfterRemovalErr && itemAfterRemoval?.assigned_to === null,
        itemAfterRemovalErr?.message ?? itemAfterRemoval,
      );

      // The tightened items_update_member WITH CHECK must not brick the
      // item — a remaining member can still update it (e.g. check it off).
      const { data: checkedAfterRemoval, error: checkAfterRemovalErr } = await clientA
        .from("items")
        .update({ checked_at: new Date().toISOString(), checked_by: userAId })
        .eq("id", itemId)
        .select()
        .maybeSingle();
      assert(
        "Remaining member A can still update the item after the assignee is removed",
        !checkAfterRemovalErr && !!checkedAfterRemoval?.checked_at,
        checkAfterRemovalErr?.message ?? checkedAfterRemoval,
      );

      // Undo the check-off and re-add B so Assertion 5 (real member removal)
      // still finds B as a member.
      await clientA.from("items").update({ checked_at: null, checked_by: null }).eq("id", itemId);
      const { error: reAddErr } = await serviceClient.from("list_members").insert({
        list_id: listId,
        user_id: userBId,
        role: "member",
      });
      assert("B re-added to list ahead of Assertion 5", !reAddErr, reAddErr?.message);
    } else {
      fail("Assertion 4.7 skipped — no listId/itemId from Assertion 1");
    }

    // ---------- 7. Wishlist fields + reservation + item_images ----------
    console.log("\n--- Assertion 7: wishlist fields + reservation ---");
    if (listId) {
      const { data: wishlistId, error: wishlistErr } = await clientA.rpc("create_list", {
        p_name: "Birthday wishes",
        p_type: "wishlist",
      });
      assert("A creates wishlist via RPC", !wishlistErr && !!wishlistId, wishlistErr?.message);

      if (wishlistId) {
        await serviceClient.from("list_members").insert({
          list_id: wishlistId,
          user_id: userBId,
          role: "member",
        });

        const { data: giftItem, error: giftErr } = await clientA
          .from("items")
          .insert({
            list_id: wishlistId,
            name: "Headphones",
            note: "Noise cancelling",
            url: "https://example.com/headphones",
            priority: "must_have",
            price: 199.99,
            created_by: userAId,
          })
          .select()
          .maybeSingle();
        assert("A can insert wishlist item with extra fields", !giftErr && !!giftItem, giftErr?.message);

        if (giftItem) {
          const { data: reserved, error: reserveErr } = await clientB
            .from("items")
            .update({
              reserved_by: userBId,
              reserved_at: new Date().toISOString(),
            })
            .eq("id", giftItem.id)
            .select()
            .maybeSingle();
          assert("B can reserve a wishlist item", !reserveErr && reserved?.reserved_by === userBId, reserveErr?.message);

          const { data: imageRow, error: imageErr } = await clientA
            .from("item_images")
            .insert({
              item_id: giftItem.id,
              storage_path: `${wishlistId}/${giftItem.id}/test.jpg`,
              sort_order: 0,
              created_by: userAId,
            })
            .select()
            .maybeSingle();
          assert("A can insert item_images row", !imageErr && !!imageRow, imageErr?.message);

          const { data: imagesSeenByB } = await clientB
            .from("item_images")
            .select("*")
            .eq("item_id", giftItem.id);
          assert("B can read item_images for shared list", (imagesSeenByB ?? []).length === 1, imagesSeenByB);
        }

        await serviceClient.from("lists").delete().eq("id", wishlistId);
      }
    } else {
      fail("Assertion 7 skipped — no listId from Assertion 1");
    }

    // ---------- 5. Member removal + invite revoke -----------------
    console.log("\n--- Assertion 5: member removal + invite revoke ---");
    if (listId) {
      const { data: revokedByB } = await clientB
        .from("list_invites")
        .update({ status: "revoked" })
        .eq("list_id", listId)
        .eq("email", "someone-else@example.com")
        .eq("status", "pending")
        .select();
      assert(
        "Member B cannot revoke a pending invite",
        (revokedByB ?? []).length === 0,
        revokedByB,
      );

      const { data: revokedByA, error: revokeErr } = await clientA
        .from("list_invites")
        .update({ status: "revoked" })
        .eq("list_id", listId)
        .eq("email", "someone-else@example.com")
        .eq("status", "pending")
        .select()
        .maybeSingle();
      assert(
        "Owner A can revoke a pending invite",
        !revokeErr && revokedByA?.status === "revoked",
        revokeErr?.message ?? revokedByA,
      );

      const { data: removedByA, error: removeErr } = await clientA
        .from("list_members")
        .delete()
        .eq("list_id", listId)
        .eq("user_id", userBId)
        .select()
        .maybeSingle();
      assert(
        "Owner A can remove member B",
        !removeErr && removedByA?.user_id === userBId,
        removeErr?.message ?? removedByA,
      );

      const { data: listSeenByBAfterRemoval } = await clientB
        .from("lists")
        .select("*")
        .eq("id", listId);
      assert(
        "B loses list access after removal",
        (listSeenByBAfterRemoval ?? []).length === 0,
        listSeenByBAfterRemoval,
      );
    } else {
      fail("Assertion 5 skipped — no listId from Assertion 1");
    }

    // ---------- 6. Owner-only list actions ----------
    console.log("\n--- Assertion 6: owner-only list actions ---");
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
      fail("Assertion 6 skipped — no listId from Assertion 1");
    }
  } finally {
    // NOTE: only lists/rows are cleaned up here — the two Clerk test
    // identities (TEST_USER_A_EMAIL/TEST_USER_B_EMAIL) are left in place so
    // seed-test-users.ts stays idempotent across repeated
    // `pnpm seed:test && pnpm test:rls && pnpm test:auth` runs, matching the
    // pre-Clerk harness's behavior of never deleting the fixed test users.
    console.log("\nPost-run cleanup (idempotent)...");
    await cleanup(serviceClient, [userAId, userBId]);
  }

  console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
