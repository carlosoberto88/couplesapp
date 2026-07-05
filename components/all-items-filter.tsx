"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

type AllItemsFilterProps = {
  showDone: boolean;
};

export function AllItemsFilter({ showDone }: AllItemsFilterProps) {
  const t = useTranslations("allItems");

  return (
    <div
      className="inline-flex w-fit items-center gap-1 rounded-full bg-muted p-1 text-sm"
      role="tablist"
      aria-label={t("filterLabel")}
    >
      <Link href="/items" role="tab" aria-selected={!showDone}>
        <span
          className={cn(
            "flex h-9 items-center rounded-full px-4 font-medium transition-colors",
            !showDone
              ? "bg-duo-coral-tint text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("pending")}
        </span>
      </Link>
      <Link href="/items?status=done" role="tab" aria-selected={showDone}>
        <span
          className={cn(
            "flex h-9 items-center rounded-full px-4 font-medium transition-colors",
            showDone
              ? "bg-duo-coral-tint text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("done")}
        </span>
      </Link>
    </div>
  );
}
