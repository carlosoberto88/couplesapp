"use client";

import { UserButton } from "@clerk/nextjs";
import { useLocale } from "next-intl";
import { useTheme } from "next-themes";

import { clerkAppearance } from "@/lib/clerk-appearance";
import { SettingsSheet } from "@/components/settings-sheet";
import { DuoChip } from "@/components/duo-chip";
import { NotificationBell } from "@/components/notification-bell";

export function AppBarActions() {
  const locale = useLocale();
  const { resolvedTheme } = useTheme();

  return (
    <>
      <DuoChip />
      <NotificationBell />
      <SettingsSheet currentLocale={locale} />
      <UserButton appearance={clerkAppearance(resolvedTheme === "dark")} />
    </>
  );
}
