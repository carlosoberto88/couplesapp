// scripts/wishlist-utils-check.ts
//
// Assert-based, dependency-free check for lib/wishlist-utils.ts
// (hasPriorityContrast, formatPrice). No DB, no test framework.
//
// Usage: npx tsx scripts/wishlist-utils-check.ts
// Exits non-zero if any assertion fails.

import { formatPrice, hasPriorityContrast } from "../lib/wishlist-utils";
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

function makeItem(overrides: Partial<Item>): Item {
  return {
    id: "item-1",
    list_id: "list-1",
    name: "Gift",
    note: null,
    position: 0,
    aisle: null,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    checked_at: null,
    checked_by: null,
    assigned_to: null,
    url: null,
    reserved_by: null,
    reserved_at: null,
    price: 12.5,
    currency: "USD",
    priority: null,
    is_extra: false,
    removed_at: null,
    ...overrides,
  };
}

function main() {
  console.log("\n--- hasPriorityContrast: empty list ---");
  {
    assert("empty items is false", hasPriorityContrast([]) === false);
  }

  console.log("\n--- hasPriorityContrast: all must_have ---");
  {
    const items = [
      makeItem({ id: "1", priority: "must_have" }),
      makeItem({ id: "2", priority: "must_have" }),
    ];
    assert("uniform must_have is false", hasPriorityContrast(items) === false);
  }

  console.log("\n--- hasPriorityContrast: all nice_to_have ---");
  {
    const items = [
      makeItem({ id: "1", priority: "nice_to_have" }),
      makeItem({ id: "2", priority: null }),
    ];
    assert("nice_to_have + null both 'other' is false", hasPriorityContrast(items) === false);
  }

  console.log("\n--- hasPriorityContrast: mixed ---");
  {
    const items = [
      makeItem({ id: "1", priority: "must_have" }),
      makeItem({ id: "2", priority: "nice_to_have" }),
    ];
    assert("mixed tiers is true", hasPriorityContrast(items) === true);
  }

  console.log("\n--- hasPriorityContrast: purchased items ignored ---");
  {
    const items = [
      makeItem({ id: "1", priority: "must_have", checked_at: "2026-01-02T00:00:00.000Z" }),
      makeItem({ id: "2", priority: "nice_to_have", checked_at: "2026-01-02T00:00:00.000Z" }),
      makeItem({ id: "3", priority: "must_have" }),
    ];
    assert(
      "purchased items excluded, remaining uniform is false",
      hasPriorityContrast(items) === false,
    );
  }

  console.log("\n--- formatPrice: normal USD ---");
  {
    const formatted = formatPrice(12.5, "USD", "en-US");
    assert("formats USD price with $ sign", formatted === "$12.50", formatted);
  }

  console.log("\n--- formatPrice: invalid currency falls back ---");
  {
    const formatted = formatPrice(12.5, "NOTACURRENCY", "en-US");
    assert("falls back to raw string", formatted === "NOTACURRENCY 12.50", formatted);
  }

  console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
