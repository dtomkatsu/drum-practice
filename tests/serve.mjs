// Serve the app to Playwright straight from disk (no HTTP server): requests to
// http://app.local/ are fulfilled from the repo directory inside the browser process.
import fs from "fs"; import path from "path";
const ROOT = path.join(process.env.HOME, "repos/drum-practice");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".m4a": "audio/mp4", ".wav": "audio/wav", ".webmanifest": "application/manifest+json", ".png": "image/png" };
export async function serve(ctxOrPage) {
  await ctxOrPage.route("http://app.local/**", (route) => {
    let p = decodeURIComponent(new URL(route.request().url()).pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
    route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" } });
  });
}
