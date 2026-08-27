/**
 * BUILT LINK INTEGRITY (P214 · Release F) — every internal href the EXPORT actually ships resolves
 * to an exported page. The nav-source guards (public-route-inventory) police what surfaces may
 * declare; this walks the rendered truth end to end, so a dead or internal destination cannot ship
 * inside any page the user can reach. Buildless CI lanes skip (assert-when-built convention).
 *
 * Run: npx tsx --test src/lib/uiux/built-link-integrity.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const hasBuild = fs.existsSync(path.join(OUT, "index.html"));

const pages = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["_next", "data", "brand"].includes(e.name)) walk(p); }
    else if (e.name === "index.html") pages.push(p);
  }
};

test("every internal href in the export resolves to an exported page — no dead or pruned destination ships", () => {
  if (!hasBuild) return;
  walk(OUT);
  const missing = new Map();
  for (const p of pages) {
    const html = fs.readFileSync(p, "utf8");
    for (const m of html.matchAll(/href="(\/[^"#?]*)[#?]?[^"]*"/g)) {
      const raw = m[1];
      if (raw.startsWith("/_next") || raw.startsWith("/data/") || raw.startsWith("/brand/")) continue;
      const clean = raw.replace(/\/$/, "") || "/";
      const target = clean === "/" ? path.join(OUT, "index.html") : path.join(OUT, clean.slice(1), "index.html");
      const flat = clean === "/" ? null : path.join(OUT, clean.slice(1)); // files like /sitemap.xml
      if (!fs.existsSync(target) && !(flat && fs.existsSync(flat))) {
        if (!missing.has(clean)) missing.set(clean, path.relative(OUT, p));
      }
    }
  }
  const report = [...missing.entries()].map(([href, from]) => `${href} (first seen in ${from})`);
  assert.deepEqual(report, [], `dead internal destinations in the shipped export:\n  ${report.join("\n  ")}`);
});

test("no exported page links an internal-only route — the prune must never leave a door", () => {
  if (!hasBuild) return;
  if (!pages.length) walk(OUT);
  const doors = [];
  for (const p of pages) {
    const html = fs.readFileSync(p, "utf8");
    for (const m of html.matchAll(/href="(\/(?:launch|ops|preview)(?:\/[^"]*)?)"/g)) {
      doors.push(`${m[1]} in ${path.relative(OUT, p)}`);
    }
  }
  assert.deepEqual(doors, [], `public pages link internal routes:\n  ${doors.join("\n  ")}`);
});
