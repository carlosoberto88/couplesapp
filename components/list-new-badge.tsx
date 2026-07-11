"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { countNewItems } from "@/lib/item-list-utils";
import { Badge } from "@/components/ui/badge";

export function ListNewBadge({
  listId,
  createdAts,
}: {
  listId: string;
  createdAts: string[];
}) {
  const t = useTranslations("lists");
  const [count, setCount] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem(`couples:list-seen:${listId}`);
    // Reads an external system (localStorage) unavailable during SSR; the null->count
    // update after mount is intentional so server and first client render match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCount(countNewItems(createdAts, seen));
  }, [listId, createdAts]);

  if (count === 0) return null;

  return (
    <Badge variant="default" className="h-4 px-1.5 text-[10px]">
      {t("newItems", { count })}
    </Badge>
  );
}
