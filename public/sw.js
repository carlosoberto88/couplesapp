// Minimal service worker — exists only for PWA installability (PRD non-goal:
// no offline caching / background sync). It takes control immediately and
// passes every request straight through to the network.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
