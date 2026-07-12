// Pure, dependency-free date math for occasion reminders. All computations
// use UTC so a `YYYY-MM-DD` date column always means the same calendar day
// regardless of server/client timezone.

import type { Occasion } from "@/lib/types";

export const REMINDER_DAYS = [7, 3, 1] as const;

export function isReminderDay(days: number): boolean {
  return (REMINDER_DAYS as readonly number[]).includes(days);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Days until the next annual occurrence of `occasionDate`'s month/day,
 * on or after `today`. Rolls to next year once this year's date has passed;
 * 0 means the occurrence is today. Relies on Date's own month/day rollover
 * (e.g. Feb 29 -> Mar 1 on non-leap years).
 */
export function daysUntilNextOccurrence(occasionDate: string, today: Date = new Date()): number {
  const [, month, day] = occasionDate.split("-").map(Number);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  let next = Date.UTC(today.getUTCFullYear(), month - 1, day);
  if (next < todayUtc) {
    next = Date.UTC(today.getUTCFullYear() + 1, month - 1, day);
  }

  return Math.round((next - todayUtc) / MS_PER_DAY);
}

/**
 * Days until `occasionDate`. Recurring occasions roll to their next annual
 * occurrence (see daysUntilNextOccurrence); one-off occasions count against
 * the exact date and can go negative once it's passed.
 */
export function daysUntilOccasion(
  occasionDate: string,
  recurring: boolean,
  today: Date = new Date(),
): number {
  if (recurring) return daysUntilNextOccurrence(occasionDate, today);

  const [year, month, day] = occasionDate.split("-").map(Number);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const target = Date.UTC(year, month - 1, day);

  return Math.round((target - todayUtc) / MS_PER_DAY);
}

/**
 * Sorts occasions soonest-first; past one-off occasions (negative days) sort
 * to the end. Returns a new array — does not mutate `occasions`.
 */
export function sortOccasionsByProximity(occasions: Occasion[], today: Date = new Date()): Occasion[] {
  function sortKey(occasion: Occasion) {
    const days = daysUntilOccasion(occasion.occasion_date, occasion.recurring, today);
    return days < 0 ? Number.POSITIVE_INFINITY : days;
  }

  return [...occasions].sort((a, b) => sortKey(a) - sortKey(b));
}
