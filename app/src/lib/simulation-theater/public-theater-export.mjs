/**
 * SIMULATION THEATER V2 · what one exported /nfl/simulation/<id>/ page carries of the Theater. Pure apart from reading
 * the static export directory it is given. Used by public-theater-export.test.mjs (post-build) to prove that a build
 * with GTP_NFL_THEATER_PUBLIC unset ships NO theater pack, NO theater CSS and NO island chunk on that page, and that a
 * build with the flag "1" ships all three plus the labels and the no-JS drive table.
 */
import fs from "node:fs";
import path from "node:path";

/** Strings only the Theater produces. The pack's version tag is also a literal in the island's decoder. */
export const THEATER_MARKERS = Object.freeze({
  pack: "theater-pack@1",
  /** in the island chunk: its decoder's version check and its region label */
  islandJs: Object.freeze(["theater-pack@1", "\"Simulation theater\""]),
  /** in the theater stylesheets */
  css: Object.freeze([".st-root{", ".stp-labels{"]),
  /** in the server-rendered HTML of the section */
  html: Object.freeze(["data-stp-section", "class=\"st-root\""]),
});

const readIf = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };

/** `_next/static/...` js/css paths named by a page's HTML or RSC payload (the files the page loads). */
export function referencedAssets(text) {
  const out = new Set();
  // route segments appear as `[eventId]` or URL-encoded `%5BeventId%5D`; both name the same file
  for (const m of String(text).matchAll(/(?:\/_next\/)?(static\/(?:chunks|css)\/[^"'\s,\\)]+?\.(?:js|css))/g)) {
    let p = m[1];
    try { p = decodeURIComponent(p); } catch { /* keep as written */ }
    out.add(p);
  }
  return [...out].sort();
}

/** Every built JS chunk that contains the island's markers (e.g. the dev route's island, if a dev build left one). */
export function islandChunks(outDir) {
  const root = path.join(outDir, "_next", "static", "chunks");
  if (!fs.existsSync(root)) return [];
  const hits = [];
  for (const rel of fs.readdirSync(root, { recursive: true })) {
    const f = path.join(root, String(rel));
    if (!f.endsWith(".js") || !fs.statSync(f).isFile()) continue;
    const s = fs.readFileSync(f, "utf8");
    if (THEATER_MARKERS.islandJs.every((m) => s.includes(m))) hits.push(`static/chunks/${String(rel).split(path.sep).join("/")}`);
  }
  return hits.sort();
}

/**
 * @returns {{ page: string, exists: boolean, pack: boolean, html: string[], css: string[], island: string[], referenced: string[] }}
 *   pack       the page's HTML or RSC payload carries a theater pack
 *   html       theater section markers found in the HTML
 *   css        referenced stylesheets that hold theater rules
 *   island     referenced scripts that ARE an island chunk, or name one by file
 */
export function scanSimulationPage(outDir, eventId, { islands = null } = {}) {
  const dir = path.join(outDir, "nfl", "simulation", String(eventId));
  const html = readIf(path.join(dir, "index.html"));
  const rsc = readIf(path.join(dir, "index.txt")) ?? "";
  const res = { page: `nfl/simulation/${eventId}/`, exists: html != null, pack: false, html: [], css: [], island: [], referenced: [] };
  if (html == null) return res;
  const both = `${html}\n${rsc}`;
  res.pack = both.includes(THEATER_MARKERS.pack);
  res.html = THEATER_MARKERS.html.filter((m) => html.includes(m));
  res.referenced = referencedAssets(both);
  const known = islands ?? islandChunks(outDir);
  const knownNames = known.map((k) => path.basename(k));
  for (const rel of res.referenced) {
    const body = readIf(path.join(outDir, "_next", rel));
    if (body == null) continue;
    if (rel.endsWith(".css")) {
      if (THEATER_MARKERS.css.some((m) => body.includes(m))) res.css.push(rel);
      continue;
    }
    if (known.includes(rel) || THEATER_MARKERS.islandJs.every((m) => body.includes(m))) { res.island.push(rel); continue; }
    // a loaded script that names an island chunk file would fetch it on demand
    if (knownNames.some((n) => body.includes(n))) res.island.push(`${rel} → names an island chunk`);
  }
  for (const n of knownNames) if (both.includes(n) && !res.island.some((x) => x.includes(n))) res.island.push(`page names ${n}`);
  return res;
}
