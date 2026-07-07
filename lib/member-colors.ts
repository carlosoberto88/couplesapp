/**
 * Deterministic per-member accent color assignment ("His & Hers" signature).
 *
 * Given the ordered list of a list's members, each member is assigned a
 * stable accent color based on their position in that order. The ordering
 * must be identical for every viewer (sorted by `created_at` ascending,
 * tiebreak `user_id` ascending) so both partners always see the same
 * person mapped to the same color, on every device.
 *
 * This module is pure (no React) and is consumed by list-detail UI in a
 * later task — it is not wired into any component yet.
 */

export type MemberColorKey = "coral" | "teal" | "gold" | "plum" | "sky";

export type MemberColor = {
  key: MemberColorKey;
  /** CSS variable reference for the accent foreground color, e.g. "var(--duo-coral)" */
  color: string;
  /** CSS variable reference for the accent tint/background color, e.g. "var(--duo-coral-tint)" */
  tint: string;
};

/**
 * Ordered accent palette. Person-A (coral slot, now marigold) and person-B
 * (teal slot, now indigo) are the primary two-person palette; gold (now
 * rose) and the extra fallbacks cover lists with more than two members.
 */
export const DUO_PALETTE: MemberColor[] = [
  { key: "coral", color: "var(--duo-coral)", tint: "var(--duo-coral-tint)" },
  { key: "teal", color: "var(--duo-teal)", tint: "var(--duo-teal-tint)" },
  { key: "gold", color: "var(--duo-gold)", tint: "var(--duo-gold-tint)" },
  // Fallback accents for >3 members. These reuse existing token values
  // (no new CSS variables introduced in this foundation task). Under the
  // Bold Indigo & Marigold palette `--destructive` is literally the same
  // rose hue as `--duo-gold`, so `plum` can no longer borrow it without
  // rendering identical to the `gold` slot — both fallbacks use neutral
  // ink/muted pairings instead so a 4th/5th member never silently matches
  // an existing member's color.
  { key: "plum", color: "var(--foreground)", tint: "var(--muted)" },
  { key: "sky", color: "var(--muted-foreground)", tint: "var(--secondary)" },
];

/** Fallback for a user_id that can't be resolved (e.g. departed member, null checked_by). */
export const UNKNOWN_MEMBER_COLOR: MemberColor = {
  key: "coral",
  color: "var(--muted-foreground)",
  tint: "var(--muted)",
};

export type OrderableMember = {
  user_id: string;
  created_at: string;
};

/**
 * Sorts members by `created_at` ascending, tiebreaking on `user_id`
 * ascending, and assigns each a stable color from `DUO_PALETTE`
 * (cycling via modulo if there are more members than palette entries).
 */
export function buildMemberColorMap(
  members: OrderableMember[],
): Map<string, MemberColor> {
  const ordered = [...members].sort((a, b) => {
    const byDate = a.created_at.localeCompare(b.created_at);
    if (byDate !== 0) return byDate;
    return a.user_id.localeCompare(b.user_id);
  });

  const map = new Map<string, MemberColor>();
  ordered.forEach((member, index) => {
    map.set(member.user_id, DUO_PALETTE[index % DUO_PALETTE.length]);
  });

  return map;
}

/**
 * Convenience accessor: given a user_id and the ordered member list,
 * returns that member's assigned color, or `UNKNOWN_MEMBER_COLOR` if the
 * user_id can't be resolved.
 */
export function getMemberColor(
  userId: string | null | undefined,
  orderedMembers: OrderableMember[],
): MemberColor {
  if (!userId) return UNKNOWN_MEMBER_COLOR;
  return buildMemberColorMap(orderedMembers).get(userId) ?? UNKNOWN_MEMBER_COLOR;
}

// --- Inline self-check (dev sanity, not a test suite) ---
// buildMemberColorMap([{user_id:"b",created_at:"2024-01-02"},{user_id:"a",created_at:"2024-01-01"}])
//   -> Map { "a" => coral (index 0), "b" => teal (index 1) }
// Order is stable regardless of input array order since we sort by created_at/user_id first.
