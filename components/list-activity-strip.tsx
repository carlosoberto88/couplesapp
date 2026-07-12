"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import type { Item } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format-relative-time";

type ListActivityStripProps = {
  items: Item[];
  nameFor: (userId: string) => string | null;
};

export function ListActivityStrip({ items, nameFor }: ListActivityStripProps) {
  const t = useTranslations("activity");

  const events = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = [...items]
      .filter((item) => new Date(item.created_at).getTime() > cutoff)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 8);

    const grouped = new Map<string, { userId: string; names: string[]; latest: string }>();

    for (const item of recent) {
      const key = item.created_by;
      const existing = grouped.get(key);
      if (existing) {
        existing.names.push(item.name);
        if (item.created_at > existing.latest) existing.latest = item.created_at;
      } else {
        grouped.set(key, { userId: key, names: [item.name], latest: item.created_at });
      }
    }

    return [...grouped.values()]
      .sort((a, b) => b.latest.localeCompare(a.latest))
      .slice(0, 2);
  }, [items]);

  if (events.length === 0) return null;

  const locale =
    typeof document !== "undefined" ? document.documentElement.lang || "en" : "en";

  return (
    <div className="rounded-2xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground tabular-nums">
      <ul className="flex flex-col gap-1">
        {events.map((event) => {
          const userName = nameFor(event.userId) ?? t("someone");
          const preview =
            event.names.length === 1
              ? event.names[0]
              : event.names.length === 2
                ? `${event.names[0]}, ${event.names[1]}`
                : t("itemPreviewMany", { count: event.names.length });
          return (
            <li key={event.userId + event.latest}>
              {t("addedItems", {
                user: userName,
                items: preview,
                time: formatRelativeTime(event.latest, locale),
              })}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
