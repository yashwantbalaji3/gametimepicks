/**
 * P250-W2 — EVERY BUTTON GOES SOMEWHERE, MEASURED ON THE BYTES A READER RECEIVES.
 *
 * A dead control is not a cosmetic defect: a reader who clicks "Jump to Steven Kwan · Hits" and
 * lands nowhere learns that the site is broken, and nothing in the source says so — the link and
 * its target were both correct in isolation. The failure lived in the JOIN between them.
 *
 * That is what happened on 2026-09-04. The MLB board resolved each scheduled game to its odds
 * event id through a `${away}-${home}` matchup key, and that slate had a DET@CLE doubleheader:
 * one key, two games, second id overwrites the first. Both sections rendered the late game's one
 * lean, the early game's forty-seven became unreachable, and the server-rendered "top clean leans"
 * strip above them linked into rows that existed in the artifact and not in the page.
 *
 * So the guard is stated over the built export rather than over any component: on every page we
 * ship, an in-page anchor resolves on that page, and a route link resolves to a route we built.
 * It is the same question a reader answers by clicking, asked of all of them at once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");

function pages() {
  const acc = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "index.html") acc.push(p);
    }
  })(OUT);
  return acc;
}

/** The RSC payload is data, not UI — an href inside a <script> is not a control a reader can click. */
const uiOf = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, "");
const routeOf = (file) => "/" + path.relative(OUT, file).replace(/index\.html$/, "").replace(/\/$/, "");

test("BUILT · every in-page anchor resolves on the page that offers it", () => {
  const dead = [];
  for (const f of pages()) {
    const html = fs.readFileSync(f, "utf8");
    const ui = uiOf(html);
    const main = ui.match(/<main[\s\S]*?<\/main>/i);
    if (!main) continue;
    // ids may live outside <main> (skip links, chrome); anchors are judged from the page's whole id set
    const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    for (const a of new Set([...main[0].matchAll(/href="#([^"]+)"/g)].map((m) => m[1]))) {
      if (!a) continue;
      if (!ids.has(a)) dead.push(`${routeOf(f)} → #${a}`);
    }
  }
  assert.deepEqual(dead, [], `in-page links with no target on their own page:\n  ${dead.join("\n  ")}`);
});

test("BUILT · every internal route link resolves to a page we shipped", () => {
  const exists = (href) => {
    const clean = href.split("#")[0].split("?")[0].replace(/^\//, "").replace(/\/$/, "");
    if (clean === "") return true;
    return fs.existsSync(path.join(OUT, clean, "index.html")) || fs.existsSync(path.join(OUT, clean));
  };
  const dead = new Map();
  for (const f of pages()) {
    const ui = uiOf(fs.readFileSync(f, "utf8"));
    for (const m of ui.matchAll(/href="(\/[^"]*)"/g)) {
      const href = m[1];
      if (href.startsWith("//") || href.startsWith("/_next")) continue;
      if (/\.(png|jpe?g|svg|ico|json|xml|txt|webmanifest|pdf|css|js|avif|webp)$/i.test(href)) continue;
      if (!exists(href)) {
        if (!dead.has(href)) dead.set(href, new Set());
        dead.get(href).add(routeOf(f));
      }
    }
  }
  const lines = [...dead.entries()].map(([h, from]) => `${h}  ← ${[...from].slice(0, 3).join(", ")}`);
  assert.deepEqual(lines, [], `links to routes that were never built:\n  ${lines.join("\n  ")}`);
});
