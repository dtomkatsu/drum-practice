// Offline cache. Bump VERSION when shipping changes.
const VERSION = "v2";
const FILES = ["./", "index.html", "app.js", "engine.js", "patterns.js", "manifest.webmanifest", "icon.svg",
  "kits/CR78/hihat.wav", "kits/CR78/kick.wav", "kits/CR78/snare.wav", "kits/LINN/hihat.wav", "kits/LINN/kick.wav", "kits/LINN/snare.wav", "kits/R8/hihat.wav", "kits/R8/kick.wav", "kits/R8/snare.wav", "kits/Stark/hihat.wav", "kits/Stark/kick.wav", "kits/Stark/snare.wav", "kits/acoustic-kit/hihat.wav", "kits/acoustic-kit/kick.wav", "kits/acoustic-kit/snare.wav"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES))));
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))));
self.addEventListener("fetch", (e) =>
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request))));
