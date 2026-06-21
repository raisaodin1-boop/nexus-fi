/* HODIX — Service Worker: offline shell, asset cache, background sync, push */
const CACHE_VERSION = "hodix-pwa-v4";
const PRECACHE = [
  "/",
  "/manifest.json",
  "/favicon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/og-image.png",
  "/offline.html",
  "/seo.html",
];

const API_HOST_PATTERNS = [
  "supabase.co",
  "cinetpay.com",
  "stripe.com",
  "vercel.live",
  "googleapis.com",
  "gstatic.com",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  return API_HOST_PATTERNS.some((host) => url.hostname.includes(host));
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/_expo/") ||
    /\.(js|css|png|jpg|jpeg|webp|svg|woff2?|ico)$/i.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Never cache runtime env — always fetch fresh Supabase config */
  if (url.pathname === "/hodix-env.js") {
    event.respondWith(fetch(request));
    return;
  }

  if (isApiRequest(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/") || caches.match("/offline.html")),
        ),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "REGISTER_SYNC") {
    if ("sync" in self.registration) {
      self.registration.sync.register("hodix-replay-queue").catch(() => {});
    }
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "hodix-replay-queue") {
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: "REPLAY_OFFLINE_QUEUE" }));
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title ?? "HODIX", {
      body: data.body ?? "",
      icon: "/icon-192.png",
      badge: "/favicon.png",
      data: data,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url ?? "/"));
});
