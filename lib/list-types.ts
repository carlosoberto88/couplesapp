// List "type" is label/icon only — no type-specific behavior (PRD non-goal).

export type ListTypeKey = "shopping" | "todo" | "other";

export type ListTypeMeta = {
  label: string;
  icon: string;
};

export const LIST_TYPES: Record<ListTypeKey, ListTypeMeta> = {
  shopping: { label: "Shopping", icon: "🛒" },
  todo: { label: "To-do", icon: "✓" },
  other: { label: "Other", icon: "📋" },
};

const FALLBACK_LIST_TYPE: ListTypeMeta = { label: "List", icon: "📋" };

/** Safe lookup for a (possibly unknown/legacy) `type` value stored on a list row. */
export function getListTypeMeta(type: string): ListTypeMeta {
  return (LIST_TYPES as Record<string, ListTypeMeta>)[type] ?? FALLBACK_LIST_TYPE;
}
