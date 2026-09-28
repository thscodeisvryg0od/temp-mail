const CACHE = "tempmail-v2";
const ASSETS = [
  "./", "./index.html", "./manifest.json",
  "./assets/css/style.css",
  "./assets/js/settings.js",
  "./assets/js/i18n.js",
  "./assets/js/notify.js",
  "./assets/js/app.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // API çağrılarını cache'leme
  if (url.hostname === "api.mail.tm" || url.hostname.includes("qrserver.com")) return;

  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match("./index.html"))
    )
  );
});