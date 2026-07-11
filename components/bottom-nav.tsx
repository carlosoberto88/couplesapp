"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarHeart, Gift, ListChecks, ShoppingCart } from "lucide-react";

import { LinkPendingIndicator } from "@/components/link-pending-indicator";
import { cn } from "@/lib/utils";

const tabs = [
  {
    href: "/lists?room=shopping",
    icon: ShoppingCart,
    labelKey: "shoppingTab" as const,
    isActive: (pathname: string, room: string | null) =>
      pathname === "/lists" && room !== "wishlist",
    activeText: "text-duo-teal",
    activeBg: "bg-duo-teal-tint",
  },
  {
    href: "/lists?room=wishlist",
    icon: Gift,
    labelKey: "wishlistsTab" as const,
    isActive: (pathname: string, room: string | null) =>
      pathname === "/lists" && room === "wishlist",
    activeText: "text-duo-coral",
    activeBg: "bg-duo-coral-tint",
  },
  {
    href: "/items",
    icon: ListChecks,
    labelKey: "allTab" as const,
    isActive: (pathname: string) => pathname === "/items",
    activeText: "text-primary",
    activeBg: "bg-muted",
  },
  {
    href: "/dates",
    icon: CalendarHeart,
    labelKey: "datesTab" as const,
    isActive: (pathname: string) => pathname === "/dates",
    activeText: "text-duo-gold",
    activeBg: "bg-duo-gold-tint",
  },
];

function BottomNavTabs() {
  const pathname = usePathname();
  const room = useSearchParams().get("room");
  const t = useTranslations("allItems");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80"
      role="navigation"
      aria-label={t("navLabel")}
    >
      <div className="mx-auto flex h-16 w-full max-w-[640px] items-stretch px-2 pb-safe">
        {tabs.map(({ href, icon: Icon, labelKey, isActive, activeText, activeBg }) => {
          const active = isActive(pathname, room);

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-medium transition-colors",
                active ? activeText : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "relative flex size-9 items-center justify-center rounded-full transition-colors",
                  active && activeBg,
                )}
              >
                <Icon className="size-5" aria-hidden />
                <LinkPendingIndicator className="top-1 right-1" />
              </span>
              {t(labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function BottomNav() {
  return (
    <Suspense fallback={null}>
      <BottomNavTabs />
    </Suspense>
  );
}
