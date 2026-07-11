"use client";

import { usePathname } from "next/navigation";

import { BottomNav } from "@/components/bottom-nav";

export function TabShell() {
  const pathname = usePathname();
  const showTabs = pathname === "/lists" || pathname === "/dates" || pathname === "/us";

  if (!showTabs) return null;

  return <BottomNav />;
}
