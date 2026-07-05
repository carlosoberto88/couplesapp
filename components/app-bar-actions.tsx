"use client";

import { UserButton } from "@clerk/nextjs";
import { useLocale } from "next-intl";

import { clerkAppearance } from "@/lib/clerk-appearance";
import { SettingsSheet } from "@/components/settings-sheet";

export function AppBarActions() {
  const locale = useLocale();

  return (
    <>
      <SettingsSheet currentLocale={locale} />
      <UserButton appearance={clerkAppearance} />
    </>
  );
}
