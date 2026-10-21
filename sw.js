// Offline cache. Bump VERSION when shipping changes.
const VERSION = "v3";
const FILES = ["./", "index.html", "app.js", "engine.js", "patterns.js", "manifest.webmanifest", "icon.svg",
  "kits/muldjord/c00.m4a", "kits/muldjord/c01.m4a", "kits/muldjord/c10.m4a", "kits/muldjord/c11.m4a", "kits/muldjord/c20.m4a", "kits/muldjord/c21.m4a", "kits/muldjord/h00.m4a", "kits/muldjord/h01.m4a", "kits/muldjord/h10.m4a", "kits/muldjord/h11.m4a", "kits/muldjord/h20.m4a", "kits/muldjord/h21.m4a", "kits/muldjord/k00.m4a", "kits/muldjord/k01.m4a", "kits/muldjord/k10.m4a", "kits/muldjord/k11.m4a", "kits/muldjord/k20.m4a", "kits/muldjord/k21.m4a", "kits/muldjord/kit.json", "kits/muldjord/o00.m4a", "kits/muldjord/o01.m4a", "kits/muldjord/o10.m4a", "kits/muldjord/o11.m4a", "kits/muldjord/o20.m4a", "kits/muldjord/o21.m4a", "kits/muldjord/r00.m4a", "kits/muldjord/r01.m4a", "kits/muldjord/r10.m4a", "kits/muldjord/r11.m4a", "kits/muldjord/r20.m4a", "kits/muldjord/r21.m4a", "kits/muldjord/s00.m4a", "kits/muldjord/s01.m4a", "kits/muldjord/s10.m4a", "kits/muldjord/s11.m4a", "kits/muldjord/s20.m4a", "kits/muldjord/s21.m4a", "kits/muldjord/t00.m4a", "kits/muldjord/t01.m4a", "kits/muldjord/t10.m4a", "kits/muldjord/t11.m4a", "kits/muldjord/t20.m4a", "kits/muldjord/t21.m4a",
  "kits/CR78/hihat.wav", "kits/CR78/kick.wav", "kits/CR78/snare.wav", "kits/LINN/hihat.wav", "kits/LINN/kick.wav", "kits/LINN/snare.wav", "kits/R8/hihat.wav", "kits/R8/kick.wav", "kits/R8/snare.wav", "kits/Stark/hihat.wav", "kits/Stark/kick.wav", "kits/Stark/snare.wav", "kits/acoustic-kit/hihat.wav", "kits/acoustic-kit/kick.wav", "kits/acoustic-kit/snare.wav"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES))));
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))));
self.addEventListener("fetch", (e) =>
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request))));
