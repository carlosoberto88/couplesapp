"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

type ListFilterProps = {
  showArchived: boolean;
};

export function ListFilter({ showArchived }: ListFilterProps) {
  const t = useTranslations("lists");

  return (
    <div
      className="inline-flex w-fit items-center gap-1 rounded-full bg-muted p-1 text-sm"
      role="tablist"
      aria-label={t("filterLabel")}
    >
      <Link href="/lists" prefetch={false} role="tab" aria-selected={!showArchived}>
        <span
          className={cn(
            "flex h-9 items-center rounded-full px-4 font-medium transition-colors",
            !showArchived
              ? "bg-duo-coral-tint text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("active")}
        </span>
      </Link>
      <Link href="/lists?filter=archived" prefetch={false} role="tab" aria-selected={showArchived}>
        <span
          className={cn(
            "flex h-9 items-center rounded-full px-4 font-medium transition-colors",
            showArchived
              ? "bg-duo-coral-tint text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("archived")}
        </span>
      </Link>
    </div>
  );
}
