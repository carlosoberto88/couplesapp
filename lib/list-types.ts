// List "type" is label/icon only — no type-specific behavior (PRD non-goal).

export type ListTypeKey = "shopping" | "todo" | "other";

export type ListTypeMeta = {
  label: string;
  icon: string;
};

export const LIST_TYPE_KEYS: ListTypeKey[] = ["shopping", "todo", "other"];

const LIST_TYPE_ICONS: Record<ListTypeKey, string> = {
  shopping: "🛒",
  todo: "✓",
  other: "📋",
};

const DEFAULT_LABELS: Record<ListTypeKey | "fallback", string> = {
  shopping: "Shopping",
  todo: "To-do",
  other: "Other",
  fallback: "List",
};

/** Safe lookup for a (possibly unknown/legacy) `type` value stored on a list row. */
export function getListTypeMeta(
  type: string,
  translate?: (key: ListTypeKey | "fallback") => string,
): ListTypeMeta {
  const isKnown = type in LIST_TYPE_ICONS;
  const key = (isKnown ? type : "fallback") as ListTypeKey | "fallback";
  const icon = isKnown ? LIST_TYPE_ICONS[type as ListTypeKey] : "📋";

  return {
    label: translate ? translate(key) : DEFAULT_LABELS[key],
    icon,
  };
}

/** Icons only — for type picker grids that supply their own translated labels. */
export function getListTypeIcon(type: ListTypeKey): string {
  return LIST_TYPE_ICONS[type];
}
