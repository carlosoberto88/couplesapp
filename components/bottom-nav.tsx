"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutList, ListChecks } from "lucide-react";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/lists", icon: LayoutList, labelKey: "listsTab" as const },
  { href: "/items", icon: ListChecks, labelKey: "itemsTab" as const },
];

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("allItems");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80"
      role="navigation"
      aria-label={t("navLabel")}
    >
      <div className="mx-auto flex h-16 w-full max-w-[640px] items-stretch px-2 pb-safe">
        {tabs.map(({ href, icon: Icon, labelKey }) => {
          const active = pathname === href;

          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full transition-colors",
                  active && "bg-duo-coral-tint",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              {t(labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
