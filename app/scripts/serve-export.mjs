#!/usr/bin/env node
/**
 * Static server for the exported site, used as the Playwright webServer (Sprint 031 · Phase 4).
 *
 * Exists because `python3 -m http.server` is SINGLE-THREADED. Playwright runs specs in parallel
 * workers, so concurrent requests queue behind one another and some are dropped — surfacing as a
 * flood of spurious 404s that fail any "no console errors" assertion. The markets spec passed when
 * run alone and failed in a full run purely because of that, which is exactly the kind of flake that
 * teaches people to distrust a suite.
 *
 * Also mirrors two behaviours the export depends on and a naive file server gets wrong:
 *   · `trailingSlash: true` — `/markets/` must resolve to `markets/index.html`
 *   · unknown paths must serve the exported 404 page rather than a bare Node error
 *
 * Node's http module handles connections concurrently, so no threading work is needed here.
 *
 * Usage: node scripts/serve-export.mjs [port] [dir]
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const PORT = Number(process.argv[2] ?? 4173);
const ROOT = path.resolve(process.argv[3] ?? "out");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

/** Resolve a request path to a file inside ROOT, or null. Never escapes ROOT. */
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const target = path.normalize(path.join(ROOT, clean));
  // Path traversal guard: a request must not read outside the exported directory.
  if (!target.startsWith(ROOT)) return null;

  if (existsSync(target) && statSync(target).isFile()) return target;
  // trailingSlash: true — a directory request resolves to its index.html.
  const asIndex = path.join(target, "index.html");
  if (existsSync(asIndex)) return asIndex;
  const asHtml = `${target}.html`;
  if (existsSync(asHtml)) return asHtml;
  return null;
}

const server = createServer((req, res) => {
  const file = resolveFile(req.url ?? "/");
  if (!file) {
    const notFound = path.join(ROOT, "404.html");
    if (existsSync(notFound)) {
      res.writeHead(404, { "content-type": TYPES[".html"] });
      createReadStream(notFound).pipe(res);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("404");
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(res);
});

if (!existsSync(ROOT)) {
  console.error(`[serve-export] ${ROOT} does not exist — run \`npm run build\` first.`);
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`[serve-export] serving ${ROOT} on http://localhost:${PORT}`);
});
