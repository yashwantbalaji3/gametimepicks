/* GTP CEO console service worker: makes the page installable to the iPhone home screen and receives Web Push.
   It deliberately caches nothing — every screen is live ledger state behind a passkey session. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  // Payloads carry no content, only "something needs you": the page itself shows what, after sign-in.
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { /* plain ping */ }
  e.waitUntil(self.registration.showNotification(data.title || "GTP Command Center", { body: data.body || "A decision is waiting for you.", tag: "gtp-cc", icon: "/icon-192.png" }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow("/"))));
});
