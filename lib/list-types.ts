export type ListTypeKey = "shopping" | "todo" | "wishlist" | "other";

export type ListTypeMeta = {
  label: string;
  icon: string;
};

export type ListTypeConfig = {
  icon: string;
  supportsCheckoff: boolean;
  supportsReservation: boolean;
  supportsImages: boolean;
  supportsUrl: boolean;
  supportsRecurring: boolean;
  supportsAisles: boolean;
  supportsReorder: boolean;
};

export const LIST_TYPE_KEYS: ListTypeKey[] = ["shopping", "todo", "wishlist", "other"];

const LIST_TYPE_CONFIG: Record<ListTypeKey, ListTypeConfig> = {
  shopping: {
    icon: "🛒",
    supportsCheckoff: true,
    supportsReservation: false,
    supportsImages: false,
    supportsUrl: false,
    supportsRecurring: true,
    supportsAisles: true,
    supportsReorder: true,
  },
  todo: {
    icon: "✓",
    supportsCheckoff: true,
    supportsReservation: false,
    supportsImages: false,
    supportsUrl: false,
    supportsRecurring: false,
    supportsAisles: false,
    supportsReorder: true,
  },
  wishlist: {
    icon: "🎁",
    supportsCheckoff: true,
    supportsReservation: true,
    supportsImages: true,
    supportsUrl: true,
    supportsRecurring: false,
    supportsAisles: false,
    supportsReorder: false,
  },
  other: {
    icon: "📋",
    supportsCheckoff: true,
    supportsReservation: false,
    supportsImages: false,
    supportsUrl: false,
    supportsRecurring: false,
    supportsAisles: false,
    supportsReorder: true,
  },
};

const DEFAULT_LABELS: Record<ListTypeKey | "fallback", string> = {
  shopping: "Shopping",
  todo: "To-do",
  wishlist: "Wishlist",
  other: "Other",
  fallback: "List",
};

export function isWishlist(type: string): boolean {
  return type === "wishlist";
}

export function getListTypeConfig(type: string): ListTypeConfig {
  if (type in LIST_TYPE_CONFIG) {
    return LIST_TYPE_CONFIG[type as ListTypeKey];
  }
  return LIST_TYPE_CONFIG.other;
}

/** Safe lookup for a (possibly unknown/legacy) `type` value stored on a list row. */
export function getListTypeMeta(
  type: string,
  translate?: (key: ListTypeKey | "fallback") => string,
): ListTypeMeta {
  const isKnown = type in LIST_TYPE_CONFIG;
  const key = (isKnown ? type : "fallback") as ListTypeKey | "fallback";
  const icon = isKnown ? LIST_TYPE_CONFIG[type as ListTypeKey].icon : "📋";

  return {
    label: translate ? translate(key) : DEFAULT_LABELS[key],
    icon,
  };
}

/** Icons only — for type picker grids that supply their own translated labels. */
export function getListTypeIcon(type: ListTypeKey): string {
  return LIST_TYPE_CONFIG[type].icon;
}
