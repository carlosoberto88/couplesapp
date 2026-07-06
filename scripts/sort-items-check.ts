// scripts/sort-items-check.ts
//
// Assert-based, dependency-free check for the aisle-aware sort/group model
// in lib/item-list-utils.ts (sortItems, compareAisles, aisleGroupKey). Pure
// in-memory Item fixtures — no DB, no test framework.
//
// Usage: npx tsx scripts/sort-items-check.ts
// Exits non-zero if any assertion fails.

import { aisleGroupKey, compareAisles, sortItems } from "../lib/item-list-utils";
import type { Item } from "../lib/types";

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

let idCounter = 0;
function makeItem(overrides: Partial<Item> = {}): Item {
  idCounter += 1;
  return {
    id: `item-${idCounter}`,
    list_id: "list-1",
    name: `Item ${idCounter}`,
    note: null,
    url: null,
    priority: null,
    price: null,
    currency: null,
    is_extra: false,
    aisle: null,
    position: 0,
    created_by: "user-1",
    created_at: new Date(2026, 0, idCounter).toISOString(),
    checked_at: null,
    checked_by: null,
    reserved_by: null,
    reserved_at: null,
    removed_at: null,
    ...overrides,
  } as Item;
}

function main() {
  // ---------- Legacy degradation: all null/0 -> created_at order ----------
  console.log("\n--- Legacy degradation (regression gate) ---");
  {
    const items = [
      makeItem({ id: "a", created_at: "2026-01-01T00:00:00.000Z" }),
      makeItem({ id: "b", created_at: "2026-01-03T00:00:00.000Z" }),
      makeItem({ id: "c", created_at: "2026-01-02T00:00:00.000Z" }),
    ];
    const sorted = sortItems(items).map((i) => i.id);
    assert(
      "all-null-aisle/all-zero-position items sort by created_at asc (legacy order)",
      JSON.stringify(sorted) === JSON.stringify(["a", "c", "b"]),
      sorted,
    );
  }

  // ---------- Numeric before text before untagged ----------
  console.log("\n--- Numeric before text before untagged ---");
  {
    const items = [
      makeItem({ id: "dairy", aisle: "Dairy" }),
      makeItem({ id: "none", aisle: null }),
      makeItem({ id: "ten", aisle: "10" }),
      makeItem({ id: "two", aisle: "2" }),
    ];
    const sorted = sortItems(items).map((i) => i.id);
    assert(
      '"2" < "10" < "Dairy" < untagged',
      JSON.stringify(sorted) === JSON.stringify(["two", "ten", "dairy", "none"]),
      sorted,
    );
    assert("compareAisles: '2' < '10'", compareAisles("2", "10") < 0, compareAisles("2", "10"));
    assert("compareAisles: '10' < 'Dairy'", compareAisles("10", "Dairy") < 0, compareAisles("10", "Dairy"));
    assert("compareAisles: 'Dairy' < null", compareAisles("Dairy", null) < 0, compareAisles("Dairy", null));
  }

  // ---------- Position ordering within a group ----------
  console.log("\n--- Position ordering within a group ---");
  {
    const items = [
      makeItem({ id: "p2", aisle: "Dairy", position: 2, created_at: "2026-01-01T00:00:00.000Z" }),
      makeItem({ id: "p0", aisle: "Dairy", position: 0, created_at: "2026-01-02T00:00:00.000Z" }),
      makeItem({ id: "p1", aisle: "Dairy", position: 1, created_at: "2026-01-03T00:00:00.000Z" }),
    ];
    const sorted = sortItems(items).map((i) => i.id);
    assert(
      "items in the same aisle group sort by position asc",
      JSON.stringify(sorted) === JSON.stringify(["p0", "p1", "p2"]),
      sorted,
    );

    const tiedPosition = [
      makeItem({ id: "later", aisle: "Dairy", position: 1, created_at: "2026-01-02T00:00:00.000Z" }),
      makeItem({ id: "earlier", aisle: "Dairy", position: 1, created_at: "2026-01-01T00:00:00.000Z" }),
    ];
    const sortedTied = sortItems(tiedPosition).map((i) => i.id);
    assert(
      "equal positions within a group tiebreak by created_at asc",
      JSON.stringify(sortedTied) === JSON.stringify(["earlier", "later"]),
      sortedTied,
    );
  }

  // ---------- Checked items unaffected by aisle ----------
  console.log("\n--- Checked items unaffected by aisle ---");
  {
    const items = [
      makeItem({ id: "checked-old", aisle: "9", checked_at: "2026-01-01T00:00:00.000Z" }),
      makeItem({ id: "checked-new", aisle: "1", checked_at: "2026-01-02T00:00:00.000Z" }),
      makeItem({ id: "unchecked", aisle: "5" }),
    ];
    const sorted = sortItems(items).map((i) => i.id);
    assert(
      "unchecked items precede checked items regardless of aisle",
      sorted[0] === "unchecked",
      sorted,
    );
    assert(
      "checked items sort by checked_at desc regardless of aisle",
      JSON.stringify(sorted.slice(1)) === JSON.stringify(["checked-new", "checked-old"]),
      sorted,
    );
  }

  // ---------- Case-insensitive text grouping ----------
  console.log("\n--- Case-insensitive text grouping ---");
  {
    assert(
      '"dairy" and "Dairy" share a group key',
      aisleGroupKey("dairy") === aisleGroupKey("Dairy"),
      { dairy: aisleGroupKey("dairy"), Dairy: aisleGroupKey("Dairy") },
    );
    assert(
      '"dairy" and "Dairy" compare equal (same group)',
      compareAisles("dairy", "Dairy") === 0,
      compareAisles("dairy", "Dairy"),
    );
    assert(
      "whitespace-only aisle collapses to the no-aisle bucket",
      aisleGroupKey("   ") === null && aisleGroupKey(null) === null,
      { whitespace: aisleGroupKey("   "), nullVal: aisleGroupKey(null) },
    );
  }

  console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
