/**
 * EVERY PUBLIC LINK POINTS AT A REAL FINAL DESTINATION — Program 231 · I.
 *
 * Run: npx tsx --test src/lib/uiux/link-destinations.test.mjs   (after a public build)
 *
 * Scanned against the BUILT export, because the question is what a visitor can actually click. The
 * first run over 316 pages and 28,010 internal links found zero dead hrefs and zero empty anchors —
 * and six links into RETIRED ROUTES that only exist to redirect.
 *
 * The extra hop is the smaller cost. `ClientRedirect` calls `window.location.replace(to)` with a
 * FIXED target, so a link like `/picks?sport=mlb` arrives at `/build#suggested-cards` with the sport
 * discarded. The link carried the reader's intent to a page that throws it away — and nothing
 * anywhere said so, because both ends worked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");

function pages(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pages(p, acc);
    else if (e.name === "index.html") acc.push(p);
  }
  return acc;
}

const routeOf = (p) => {
  const rel = path.relative(OUT, path.dirname(p)).split(path.sep).join("/");
  return rel ? `/${rel}/` : "/";
};

const built = fs.existsSync(OUT) ? pages(OUT) : [];
const routes = new Set(built.map(routeOf));
/** A page whose whole job is to bounce somewhere else. */
const stubs = new Set(built.filter((p) => /Redirecting to/i.test(fs.readFileSync(p, "utf8"))).map(routeOf));

/** Internal hrefs on a page, normalised to a route. */
function linksOf(file) {
  const html = fs.readFileSync(file, "utf8");
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]*)"/g)) {
    const href = m[1];
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    const clean = href.split("#")[0].split("?")[0];
    out.push({ href, route: clean.endsWith("/") ? clean : `${clean}/` });
  }
  return out;
}

test("the export is present and substantial — otherwise this proves nothing", () => {
  if (!built.length) return;
  assert.ok(built.length > 100, `only ${built.length} pages built`);
  assert.ok(stubs.size > 0, "no redirect stubs found — the stub detector has stopped working");
});

test("NO PUBLIC LINK POINTS AT A REDIRECT STUB", () => {
  if (!built.length) return;
  const chained = new Set();
  for (const f of built) {
    if (stubs.has(routeOf(f))) continue; // a stub's own fallback link is its whole purpose
    for (const { href, route } of linksOf(f)) {
      if (stubs.has(route)) chained.add(`${routeOf(f)} → ${href}`);
    }
  }
  assert.deepEqual(
    [...chained].sort(),
    [],
    `links into retired routes — the hop discards any query the link carried: ${[...chained].slice(0, 6).join("; ")}`,
  );
});

test("no dead internal link and no empty anchor", () => {
  if (!built.length) return;
  const dead = new Set();
  let empty = 0;
  for (const f of built) {
    const html = fs.readFileSync(f, "utf8");
    for (const m of html.matchAll(/<a\b[^>]*href="([^"]*)"/g)) {
      if (!m[1] || m[1] === "#") empty++;
    }
    for (const { href, route } of linksOf(f)) {
      if (route === "/") continue;
      const asFile = path.join(OUT, href.split("#")[0].split("?")[0].replace(/^\//, ""));
      if (!routes.has(route) && !fs.existsSync(asFile)) dead.add(`${routeOf(f)} → ${href}`);
    }
  }
  assert.equal(empty, 0, "an anchor with no destination is a control that looks clickable and is not");
  assert.deepEqual([...dead].sort(), [], `dead internal links: ${[...dead].slice(0, 6).join("; ")}`);
});

test("a redirect stub goes somewhere real, and only one hop", () => {
  /* A stub pointing at another stub is the same defect compounded — and the second hop is where a
     reader gives up. */
  if (!built.length) return;
  const bad = [];
  for (const f of built) {
    const route = routeOf(f);
    if (!stubs.has(route)) continue;
    for (const { href, route: dest } of linksOf(f)) {
      if (dest === route) continue;
      if (stubs.has(dest)) bad.push(`${route} → ${href} (also a stub)`);
      else if (!routes.has(dest)) bad.push(`${route} → ${href} (nowhere)`);
    }
  }
  assert.deepEqual(bad, [], `redirect stubs that do not land: ${bad.join("; ")}`);
});
