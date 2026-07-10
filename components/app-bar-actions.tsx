"use client";

import { UserButton } from "@clerk/nextjs";
import { useLocale } from "next-intl";
import { useTheme } from "next-themes";

import { clerkAppearance } from "@/lib/clerk-appearance";
import { SettingsSheet } from "@/components/settings-sheet";

export function AppBarActions() {
  const locale = useLocale();
  const { resolvedTheme } = useTheme();

  return (
    <>
      <SettingsSheet currentLocale={locale} />
      <UserButton appearance={clerkAppearance(resolvedTheme === "dark")} />
    </>
  );
}
