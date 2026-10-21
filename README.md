# Groove — drum practice PWA

Drum grooves with tempo control for practicing guitar. Synthesized drums (no samples, no licensing), Web Audio look-ahead scheduler, offline-capable.

Run locally: `python3 -m http.server 8000`, then on iPhone (same Wi-Fi) open `http://<mac-ip>:8000`.
Service worker + wake lock need HTTPS, so for the installed home-screen version deploy to GitHub Pages and use Share → Add to Home Screen.

Add grooves in `patterns.js` (X accent, x hit, g ghost, - rest).
