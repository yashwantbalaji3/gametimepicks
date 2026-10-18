#!/usr/bin/env node
/**
 * Simulation Theater V2 · payload and bundle budget check (spec §6.1), over a LOCAL dev export.
 *
 * Needs an export built with the dev route enabled:
 *   cd app && GTP_DEV_ROUTES=1 npm run build      (then: git checkout -- ../data ../app/public/data)
 *   node scripts/simulation-theater/measure-theater-bundle.mjs [--json]
 *
 * Measures, per fixture page under out/dev/simulation-theater/<eventId>/:
 *   (a) the page's HTML bytes (raw and gzip)
 *   (b) the RSC payload inlined in that HTML (self.__next_f), the part attributable to the theater (payload minus a
 *       reference page's payload with the same layout), and the theater-pack@1 sample data itself
 *   (c) the theater's JavaScript: chunks the page loads that the reference page does not (first paint), plus the
 *       lazily imported island chunk(s), gzip -9; and the route's CSS
 * Ceilings (exit 1 when exceeded): JS ≤120 KB gzip incremental; inline sample data ≤20 KB raw for five samples.
 * Targets (reported, not enforced): first-paint JS ≤2 KB gzip; island ≤30 KB gzip.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(APP, "out");
const REF = path.join(OUT, "about", "index.html");
const DIR = path.join(OUT, "dev", "simulation-theater");
const JSON_MODE = process.argv.includes("--json");
const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
const KB = (n) => `${(n / 1024).toFixed(1)} KB`;

if (!fs.existsSync(DIR)) {
  console.error("no dev export at app/out/dev/simulation-theater — build with GTP_DEV_ROUTES=1 first");
  process.exit(2);
}
const flightOf = (html) => [...html.matchAll(/<script>self\.__next_f\.push\((.*?)\)<\/script>/gs)].map((m) => m[1]).join("");
const scriptsOf = (html) => [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
const cssOf = (html) => [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
const fileOf = (src) => path.join(OUT, decodeURIComponent(src.split("?")[0]));
const ref = fs.readFileSync(REF, "utf8");
const refScripts = new Set(scriptsOf(ref));
const refCss = new Set(cssOf(ref));
const refFlight = flightOf(ref).length;

// island chunk(s): JS under _next/static/chunks that carries the island's markup and is not loaded by any page's HTML
const chunkDir = path.join(OUT, "_next", "static", "chunks");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const islandChunks = walk(chunkDir).filter((f) => f.endsWith(".js") && !path.relative(chunkDir, f).startsWith("app") && /st-transport/.test(fs.readFileSync(f, "utf8")));
/** The decoded RSC text (the JSON strings pushed into self.__next_f), and the theater-pack@1 object inside it. */
function rscText(flight) {
  return [...flight.matchAll(/\[1,("(?:[^"\\]|\\.)*")\]/g)].map((m) => JSON.parse(m[1])).join("");
}
function packBytes(text) {
  const at = text.indexOf('"pack":{"v":"theater-pack@1"');
  if (at < 0) return null;
  let i = text.indexOf("{", at);
  const start = i;
  let depth = 0;
  let inStr = false;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) break;
  }
  return Buffer.byteLength(text.slice(start, i + 1));
}

const pages = fs.readdirSync(DIR).filter((d) => fs.existsSync(path.join(DIR, d, "index.html")));
const rows = [];
let fail = false;
for (const id of pages) {
  const html = fs.readFileSync(path.join(DIR, id, "index.html"), "utf8");
  const flight = flightOf(html);
  const pack = packBytes(rscText(flight));
  const extra = scriptsOf(html).filter((s) => !refScripts.has(s));
  const scripts = extra.filter((s) => /\/app\/dev\//.test(decodeURIComponent(s)));
  const shared = extra.filter((s) => !scripts.includes(s));
  const firstPaint = scripts.map((s) => fs.readFileSync(fileOf(s))).reduce((a, b) => a + gz(b), 0);
  const sharedGz = shared.map((s) => fs.readFileSync(fileOf(s))).reduce((a, b) => a + gz(b), 0);
  const island = islandChunks.map((f) => fs.readFileSync(f)).reduce((a, b) => a + gz(b), 0);
  const css = cssOf(html).filter((c) => !refCss.has(c)).map((c) => fs.readFileSync(fileOf(c))).reduce((a, b) => a + gz(b), 0);
  const row = {
    eventId: id,
    a_html: { raw: Buffer.byteLength(html), gzip: gz(Buffer.from(html)) },
    b_rsc: { raw: Buffer.byteLength(flight), gzip: gz(Buffer.from(flight)), theaterAttributableRaw: Buffer.byteLength(flight) - refFlight, packRaw: pack },
    c_js: {
      firstPaintGzip: firstPaint, firstPaintChunks: scripts.map((s) => path.basename(s)),
      islandGzip: island, islandChunks: islandChunks.map((f) => path.basename(f)),
      sharedNotOnReferenceGzip: sharedGz, sharedNotOnReferenceChunks: shared.map((s) => path.basename(s)),
      totalGzip: firstPaint + island,
    },
    css_gzip: css,
  };
  if (row.c_js.totalGzip > 120 * 1024) { fail = true; row.violation = "theater JS > 120 KB gzip"; }
  if (row.b_rsc.packRaw != null && row.b_rsc.packRaw > 20 * 1024) { fail = true; row.violation = "inline sample data > 20 KB raw"; }
  rows.push(row);
}
if (JSON_MODE) console.log(JSON.stringify({ reference: path.relative(APP, REF), referenceFlightRaw: refFlight, rows }, null, 2));
else {
  console.log(`reference page for shared layout: ${path.relative(APP, REF)} (RSC payload ${KB(refFlight)})`);
  for (const r of rows) {
    console.log(`\n${r.eventId}`);
    console.log(`  (a) HTML            ${KB(r.a_html.raw)} raw · ${KB(r.a_html.gzip)} gzip`);
    console.log(`  (b) RSC payload     ${KB(r.b_rsc.raw)} raw · ${KB(r.b_rsc.gzip)} gzip · theater share ≈${KB(r.b_rsc.theaterAttributableRaw)} raw · sample data (pack) ${r.b_rsc.packRaw == null ? "not found" : KB(r.b_rsc.packRaw)} raw  [ceiling 20 KB]`);
    console.log(`  (c) theater JS      first paint ${KB(r.c_js.firstPaintGzip)} [target 2 KB] + island ${KB(r.c_js.islandGzip)} [target 30 KB] = ${KB(r.c_js.totalGzip)} gzip  [ceiling 120 KB]`);
    console.log(`      (shared app chunks this page loads and the reference does not: ${KB(r.c_js.sharedNotOnReferenceGzip)} gzip — ${r.c_js.sharedNotOnReferenceChunks.join(", ") || "none"}; not theater code)`);
    console.log(`      route CSS       ${KB(r.css_gzip)} gzip`);
    if (r.violation) console.log(`  BUDGET VIOLATION: ${r.violation}`);
  }
}
process.exit(fail ? 1 : 0);
