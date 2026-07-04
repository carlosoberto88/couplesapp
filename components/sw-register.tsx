"use client";

import { useEffect } from "react";

/**
 * Registers the minimal service worker (public/sw.js) so the app is
 * installable as a PWA. Production-only — skips in dev to avoid interfering
 * with fast refresh / caching quirks during local development.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability is best-effort — no user-facing error on failure.
    });
  }, []);

  return null;
}
