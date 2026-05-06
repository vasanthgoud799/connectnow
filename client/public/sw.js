const CACHE_NAME = "connectnow-shell-v2";
const APP_SHELL = ["/", "/auth", "/manifest.webmanifest", "/pwa-icon.svg", "/pwa-maskable.svg", "/favicon.png", "/avatar.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/socket.io")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(async () => {
          const cachedShell = await caches.match("/");
          return cachedShell || Response.error();
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned)).catch(() => {});
        return response;
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification?.data || {};
  const targetUrl = new URL("/", self.location.origin);
  if (data.conversationKey) {
    targetUrl.searchParams.set("conversation", data.conversationKey);
  }
  if (data.messageId) {
    targetUrl.searchParams.set("message", data.messageId);
  }
  if (data.notificationKind === "call") {
    targetUrl.searchParams.set("focus", "call");
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => "focus" in client);
      if (existingClient) {
        existingClient.postMessage({
          type: "CONNECTNOW_NOTIFICATION_CLICK",
          data,
        });
        return existingClient.focus();
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl.href);
      }

      return undefined;
    })
  );
});
