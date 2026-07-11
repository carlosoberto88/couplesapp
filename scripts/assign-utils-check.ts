// scripts/assign-utils-check.ts
//
// Assert-based, dependency-free check for lib/item-mutations.ts
// (nextAssignee). No DB, no test framework.
//
// Usage: npx tsx scripts/assign-utils-check.ts
// Exits non-zero if any assertion fails.

import { nextAssignee } from "../lib/item-mutations";

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

function main() {
  const me = "user-me";
  const partner = "user-partner";

  console.log("\n--- null -> currentUser ---");
  {
    const result = nextAssignee(null, me, [me, partner]);
    assert("unassigned cycles to current user", result === me, result);
  }

  console.log("\n--- currentUser -> the other member ---");
  {
    const result = nextAssignee(me, me, [me, partner]);
    assert("current user cycles to partner", result === partner, result);
  }

  console.log("\n--- the other -> null ---");
  {
    const result = nextAssignee(partner, me, [me, partner]);
    assert("anyone else cycles to unassigned", result === null, result);
  }

  console.log("\n--- single-member edge: currentUser -> null ---");
  {
    const result = nextAssignee(me, me, [me]);
    assert("current user cycles to unassigned when no other member exists", result === null, result);
  }

  console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
