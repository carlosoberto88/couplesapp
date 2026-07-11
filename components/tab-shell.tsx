"use client";

import { usePathname } from "next/navigation";

import { BottomNav } from "@/components/bottom-nav";

export function TabShell() {
  const pathname = usePathname();
  const showTabs = pathname === "/lists" || pathname === "/items" || pathname === "/dates";

  if (!showTabs) return null;

  return <BottomNav />;
}
