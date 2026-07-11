// scripts/occasion-utils-check.ts
//
// Assert-based, dependency-free check for lib/occasion-utils.ts
// (daysUntilNextOccurrence, daysUntilOccasion, isReminderDay). No DB, no test framework.
//
// Usage: npx tsx scripts/occasion-utils-check.ts
// Exits non-zero if any assertion fails.

import {
  daysUntilNextOccurrence,
  daysUntilOccasion,
  isReminderDay,
  REMINDER_DAYS,
} from "../lib/occasion-utils";

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
  const today = new Date(Date.UTC(2026, 6, 11)); // 2026-07-11

  console.log("\n--- Date later this year ---");
  {
    const days = daysUntilNextOccurrence("2026-07-18", today);
    assert("2026-07-18 from 2026-07-11 is 7 days away", days === 7, days);
  }

  console.log("\n--- Date already passed this year rolls to next year ---");
  {
    const days = daysUntilNextOccurrence("2026-01-01", today);
    const expected = Math.round(
      (Date.UTC(2027, 0, 1) - Date.UTC(2026, 6, 11)) / (24 * 60 * 60 * 1000),
    );
    assert("2026-01-01 rolls to 2027-01-01", days === expected, { days, expected });
  }

  console.log("\n--- Today ---");
  {
    const days = daysUntilNextOccurrence("2026-07-11", today);
    assert("occasion date equal to today is 0 days away", days === 0, days);
  }

  console.log("\n--- daysUntilOccasion (recurring delegates to daysUntilNextOccurrence) ---");
  {
    const days = daysUntilOccasion("2026-07-18", true, today);
    assert("recurring 2026-07-18 from 2026-07-11 is 7 days away", days === 7, days);
  }

  console.log("\n--- daysUntilOccasion (one-off future date) ---");
  {
    const days = daysUntilOccasion("2026-07-18", false, today);
    assert("one-off 2026-07-18 from 2026-07-11 is 7 days away", days === 7, days);
  }

  console.log("\n--- daysUntilOccasion (one-off past date is negative) ---");
  {
    const days = daysUntilOccasion("2026-01-01", false, today);
    assert("one-off 2026-01-01 from 2026-07-11 is negative", days < 0, days);
  }

  console.log("\n--- daysUntilOccasion (one-off today is 0) ---");
  {
    const days = daysUntilOccasion("2026-07-11", false, today);
    assert("one-off occasion date equal to today is 0 days away", days === 0, days);
  }

  console.log("\n--- isReminderDay ---");
  {
    assert("7 is a reminder day", isReminderDay(7));
    assert("3 is a reminder day", isReminderDay(3));
    assert("1 is a reminder day", isReminderDay(1));
    assert("0 is not a reminder day", !isReminderDay(0));
    assert("2 is not a reminder day", !isReminderDay(2));
    assert("REMINDER_DAYS is [7, 3, 1]", JSON.stringify(REMINDER_DAYS) === JSON.stringify([7, 3, 1]));
  }

  console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
