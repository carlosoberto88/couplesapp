"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Settings } from "lucide-react";

import { clerkAppearance } from "@/lib/clerk-appearance";
import { DuoChip } from "@/components/duo-chip";
import { NotificationBell } from "@/components/notification-bell";

export function AppBarActions() {
  const t = useTranslations("settings");
  const { resolvedTheme } = useTheme();

  return (
    <>
      <DuoChip />
      <NotificationBell />
      <Link
        href="/settings"
        aria-label={t("open")}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Settings className="size-5" />
      </Link>
      <UserButton appearance={clerkAppearance(resolvedTheme === "dark")} />
    </>
  );
}
