"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BottomNav } from "@/components/bottom-nav";

const TAB_ROUTES = ["/lists", "/dates", "/us"];

// ponytail: lives here instead of one hook per tab page because TabShell already
// tracks pathname for the same three routes and is mounted for the whole
// authenticated shell lifetime — one effect covers route entry, focus, and
// foreground for all three screens with zero per-page wiring.
function useRefreshTabScreens(active: boolean, pathname: string, room: string | null) {
  const router = useRouter();
  const lastRefreshAt = useRef(0);
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (!active) return;

    const refresh = () => {
      // Browsers fire `focus` and `visibilitychange` together on foreground,
      // and visibility can flap. One refresh per 100ms is plenty.
      if (Date.now() - lastRefreshAt.current < 100) return;
      lastRefreshAt.current = Date.now();
      router.refresh();
    };

    // First render of a session came straight from the server, so skip it.
    if (isFirstRun.current) isFirstRun.current = false;
    else refresh();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active, pathname, room, router]);
}

export function TabShell() {
  const pathname = usePathname();
  const room = useSearchParams().get("room");
  const showTabs = TAB_ROUTES.includes(pathname);

  useRefreshTabScreens(showTabs, pathname, room);

  if (!showTabs) return null;

  return <BottomNav />;
}
