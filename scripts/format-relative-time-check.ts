// scripts/format-relative-time-check.ts
//
// Assert-based, dependency-free check for lib/format-relative-time.ts
// (formatRelativeTime). No DB, no test framework.
//
// Usage: npx tsx scripts/format-relative-time-check.ts
// Exits non-zero if any assertion fails.

import { formatRelativeTime } from "../lib/format-relative-time";

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

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

function main() {
  console.log("\n--- just now (en) ---");
  {
    const result = formatRelativeTime(isoMinutesAgo(0), "en");
    assert("0 minutes ago is 'just now' in en", result === "just now", result);
  }

  console.log("\n--- just now (es) ---");
  {
    const result = formatRelativeTime(isoMinutesAgo(0), "es");
    assert("0 minutes ago is 'ahora' in es", result === "ahora", result);
  }

  console.log("\n--- minutes (en) ---");
  {
    const result = formatRelativeTime(isoMinutesAgo(30), "en");
    assert("30 minutes ago is '30m ago' in en", result === "30m ago", result);
  }

  console.log("\n--- minutes (es) ---");
  {
    const result = formatRelativeTime(isoMinutesAgo(30), "es");
    assert("30 minutes ago is 'hace 30 min' in es", result === "hace 30 min", result);
  }

  console.log("\n--- hours (en) ---");
  {
    const result = formatRelativeTime(isoMinutesAgo(3 * 60), "en");
    assert("3 hours ago is '3h ago' in en", result === "3h ago", result);
  }

  console.log("\n--- hours (es) ---");
  {
    const result = formatRelativeTime(isoMinutesAgo(3 * 60), "es");
    assert("3 hours ago is 'hace 3 h' in es", result === "hace 3 h", result);
  }

  console.log("\n--- days (en) ---");
  {
    const result = formatRelativeTime(isoMinutesAgo(2 * 24 * 60), "en");
    assert("2 days ago is '2d ago' in en", result === "2d ago", result);
  }

  console.log("\n--- days (es) ---");
  {
    const result = formatRelativeTime(isoMinutesAgo(2 * 24 * 60), "es");
    assert("2 days ago is 'hace 2 d' in es", result === "hace 2 d", result);
  }

  console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
