"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export function MainNav() {
  const pathname = usePathname();
  const t = useTranslations("allItems");
  const onItems = pathname.startsWith("/items");

  return (
    <nav
      className="inline-flex w-fit items-center gap-1 rounded-full bg-muted p-1 text-sm"
      role="tablist"
      aria-label={t("navLabel")}
    >
      <Link href="/lists" prefetch={false} role="tab" aria-selected={!onItems}>
        <span
          className={cn(
            "flex h-9 items-center rounded-full px-4 font-medium transition-colors",
            !onItems
              ? "bg-duo-coral-tint text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("listsTab")}
        </span>
      </Link>
      <Link href="/items" prefetch={false} role="tab" aria-selected={onItems}>
        <span
          className={cn(
            "flex h-9 items-center rounded-full px-4 font-medium transition-colors",
            onItems
              ? "bg-duo-coral-tint text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("itemsTab")}
        </span>
      </Link>
    </nav>
  );
}
