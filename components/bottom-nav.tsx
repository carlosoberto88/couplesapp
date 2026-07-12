"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Gift, ShoppingCart, Users } from "lucide-react";

import { LinkPendingIndicator } from "@/components/link-pending-indicator";
import { DuoRings } from "@/components/duo-rings";
import { useDuoState } from "@/components/use-duo-state";
import { cn } from "@/lib/utils";

/** Mini `DuoRings` reflecting live pairing state; falls back to a static glyph while loading or on error. */
function UsTabIcon() {
  const { state, loading } = useDuoState();

  if (loading) return <Users className="size-5" />;

  return (
    <DuoRings
      size={22}
      state={state}
      partnerA={{ initials: "" }}
      partnerB={state !== "solo" ? { initials: "" } : undefined}
    />
  );
}

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
    href: "/us",
    icon: Users,
    labelKey: "usTab" as const,
    isActive: (pathname: string) => pathname === "/us" || pathname === "/dates",
    activeText: "text-duo-gold",
    activeBg: "bg-duo-gold-tint",
    isUs: true,
  },
];

function BottomNavTabs() {
  const pathname = usePathname();
  const room = useSearchParams().get("room");
  const t = useTranslations("allItems");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 md:inset-x-auto md:left-1/2 md:w-full md:max-w-[var(--app-frame)] md:-translate-x-1/2 md:border-x"
      role="navigation"
      aria-label={t("navLabel")}
    >
      <div className="mx-auto flex h-16 w-full max-w-[640px] items-stretch px-2 pb-safe">
        {tabs.map(({ href, icon: Icon, labelKey, isActive, activeText, activeBg, isUs }) => {
          const active = isActive(pathname, room);

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              aria-label={isUs ? t(labelKey) : undefined}
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
                {isUs ? (
                  <span aria-hidden>
                    <UsTabIcon />
                  </span>
                ) : (
                  <Icon className="size-5" aria-hidden />
                )}
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
