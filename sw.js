// Offline cache. Bump VERSION when shipping changes.
// App shell is cached up front; kit samples are cached the first time they're used,
// so every kit you've played works offline without downloading all of them on install.
const VERSION = "v12";
const SHELL = ["./", "index.html", "app.js", "engine.js", "patterns.js", "manifest.webmanifest", "icon.svg"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL))));
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok && new URL(e.request.url).pathname.includes("/kits/")) {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
    }
    return res;
  })));
});
