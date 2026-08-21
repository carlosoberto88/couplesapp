// PWA service worker — installability, offline shell, web push notifications.

const CACHE_NAME = "couples-shell-v2";
// ponytail: the shell is static and data-free, so a stale copy is
// indistinguishable from a fresh one. No versioning beyond CACHE_NAME.
const SHELL_URL = "/shell.html";
const SHELL_URLS = [SHELL_URL, "/icons/icon-192.png"];
const NAV_TIMEOUT_MS = 400;

// Serve the shell as a *timeout* fallback at most once per worker lifetime, so
// the reload shell.html triggers always races a clean network-first fetch and
// cannot loop. The worker is idle-terminated after ~30s, which resets this —
// exactly the right granularity: one shell per cold launch.
let shellUsedForTimeout = false;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function shellResponse() {
  return caches.match(SHELL_URL);
}

function handleNavigate(request) {
  const network = fetch(request);

  const timeout = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS))
    .then(() => (shellUsedForTimeout ? null : shellResponse()))
    .then((cached) => {
      // ponytail: a promise that never settles is the shortest way to say
      // "withdraw from the race" — no cached shell means the network wins,
      // however long it takes.
      if (!cached) return new Promise(() => {});
      shellUsedForTimeout = true;
      return cached;
    });

  return Promise.race([network, timeout]).catch(
    async () => (await shellResponse()) ?? Response.error(),
  );
}

self.addEventListener("fetch", (event) => {
  // ponytail: no respondWith == default browser handling. Shorter than the
  // previous `respondWith(fetch(request))` passthrough and strictly better —
  // that form breaks streaming request bodies on some browsers.
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(handleNavigate(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request).catch(
      async () => (await caches.match(event.request)) ?? Response.error(),
    ),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = { title: "Couples", body: "List updated", url: "/lists" };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/lists";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
