#!/usr/bin/env node
/*
 * serve.mjs — dependency-free static server for a captured/cloned site.
 *
 * Serves a directory verbatim with correct MIME types (so ES-module bundles
 * execute) and `Access-Control-Allow-Origin: *` (so a crossorigin="anonymous"
 * entry script's runtime errors surface instead of opaque "Script error").
 * SPA fallback: unknown extensionless routes serve index.html.
 *
 * Usage:  node serve.mjs [dir=./public] [port=3100]
 *   or:   PORT=3200 node serve.mjs ./shelby/public
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname, resolve } from "node:path";

const ROOT = resolve(process.argv[2] || "./public");
const PORT = Number(process.env.PORT) || Number(process.argv[3]) || 3100;
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".woff2": "font/woff2", ".woff": "font/woff",
  ".ttf": "font/ttf", ".otf": "font/otf", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".avif": "image/avif", ".ico": "image/x-icon", ".mp4": "video/mp4", ".webm": "video/webm",
  ".wasm": "application/wasm", ".map": "application/json; charset=utf-8",
  // .riv (Rive), .lottie, .glb, .hdr fall through to octet-stream — fetched as arraybuffer, fine.
};

async function readIfFile(pathAbs) {
  const nt = normalize(pathAbs);
  if (!nt.startsWith(ROOT)) return null;
  try {
    const st = await stat(nt);
    if (st.isFile()) return { target: nt, body: await readFile(nt) };
    if (st.isDirectory()) { const idx = join(nt, "index.html"); return { target: idx, body: await readFile(idx) }; }
  } catch {}
  return null;
}

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const origExt = extname(pathname); // "" for routes / trailing-slash paths
    // Try, in order: dir index (for trailing "/"), clean-URL "<path>.html" and
    // "<path>/index.html" (Webflow / multi-page static), then the raw path (assets).
    const tries = [];
    if (pathname.endsWith("/")) tries.push(join(ROOT, pathname, "index.html"));
    else if (!origExt) tries.push(join(ROOT, pathname + ".html"), join(ROOT, pathname, "index.html"));
    tries.push(join(ROOT, pathname));
    let hit = null;
    for (const t of tries) { hit = await readIfFile(t); if (hit) break; }
    if (!hit) {
      // route miss (no real-asset ext, or .html) → custom 404.html, else index.html
      // (the SPA deep-link / clean-URL fallback). Real-asset misses stay 404.
      if (!origExt || origExt === ".html") hit = (await readIfFile(join(ROOT, "404.html"))) || (await readIfFile(join(ROOT, "index.html")));
      if (!hit) return void res.writeHead(404).end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": MIME[extname(hit.target)] || "application/octet-stream",
      "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*",
    });
    res.end(hit.body);
  } catch (e) { res.writeHead(e.code === "ENOENT" ? 404 : 500).end(String(e)); }
}).listen(PORT, "0.0.0.0", () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
