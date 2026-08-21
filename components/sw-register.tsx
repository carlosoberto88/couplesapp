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

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // Installed PWAs get resumed from the home screen far more often
        // than they get navigated, so the browser's page-load update check
        // rarely fires. Re-check for a new worker on foreground instead.
        const onVisibilityChange = () => {
          if (document.visibilityState === "visible") registration.update();
        };

        // ponytail: no cleanup — this component mounts once for the app's
        // lifetime, so the listener never needs to be torn down.
        document.addEventListener("visibilitychange", onVisibilityChange);
      })
      .catch(() => {
        // Installability is best-effort — no user-facing error on failure.
      });
  }, []);

  return null;
}
