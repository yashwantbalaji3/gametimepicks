/**
 * NO ORPHANED FORECAST — Program 235 · Release C. (post-build: reads out/)
 *
 * Run: npx tsx --test src/lib/sports/epl/archive-reachability.test.mjs   (needs a built export)
 *
 * `/epl/match/[slug]` is generated for every fixture ever forecast, and until Program 235 nothing
 * linked to the played ones — their pages were reachable only by typing the URL. That is the same
 * orphan-route class Program 234 closed for `/nfl/game/[eventId]`, and it is the reason recovering a
 * lost forecast is not finished when the JSON is written: a route with no path to it is not a
 * delivered feature.
 *
 * Scans the BUILT EXPORT, because what matters is whether the HTML a visitor receives carries the
 * link. A section rendered behind a condition nothing satisfies passes a source check and fails a
 * reader.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const OUT = path.join(APP, "out");
const hubPath = path.join(OUT, "epl", "index.html");

const generated = () => {
  try {
    return fs.readdirSync(path.join(OUT, "epl", "match"), { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name);
  } catch { return []; }
};

/** Every page in the export that links to this slug, excluding the fixture's own page. */
function linkedFrom(slug) {
  const hits = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "_next") walk(p); continue; }
      if (e.name !== "index.html") continue;
      let html;
      try { html = fs.readFileSync(p, "utf8"); } catch { continue; }
      if (html.includes(`/epl/match/${slug}`) && !p.includes(path.join("epl", "match", slug))) {
        hits.push(path.relative(OUT, p));
      }
    }
  };
  walk(OUT);
  return hits;
}

test("EVERY GENERATED EPL FIXTURE PAGE IS LINKED FROM SOMEWHERE", () => {
  if (!fs.existsSync(OUT)) return;              // no build present
  const routes = generated();
  if (!routes.length) return;                   // nothing published; nothing to reach
  const orphans = routes.filter((r) => linkedFrom(r).length === 0);
  assert.deepEqual(
    orphans, [],
    `these fixture pages are generated and nothing links to them — reachable only by typing the URL: ${orphans.join(", ")}`,
  );
});

test("THE HUB CARRIES AN ARCHIVE, and labels it as past rather than current", () => {
  if (!fs.existsSync(hubPath)) return;
  const html = fs.readFileSync(hubPath, "utf8");
  const routes = generated();
  if (!routes.length) return;
  assert.match(html, /\/epl\/match\//, "the EPL hub links to no fixture at all");
  /* A played fixture must not be offered as a live read. */
  if (/Every fixture we published a forecast for/.test(html)) {
    assert.match(html, /These are past fixtures|nothing here is a current read/i,
      "the archive section does not say its contents are past");
  }
});

test("A RECOVERED FIXTURE IS REACHABLE, not merely generated", () => {
  const recoveredPath = path.join(APP, "public/data/soccer/epl/forecasts/recovered.json");
  if (!fs.existsSync(recoveredPath) || !fs.existsSync(OUT)) return;
  const rows = JSON.parse(fs.readFileSync(recoveredPath, "utf8")).rows ?? [];
  if (!rows.length) return;
  for (const r of rows) {
    assert.ok(
      fs.existsSync(path.join(OUT, "epl", "match", r.slug, "index.html")),
      `${r.slug} was recovered and has no page`,
    );
    assert.ok(
      linkedFrom(r.slug).length > 0,
      `${r.slug} was recovered, has a page, and nothing links to it — the repair stopped one step short`,
    );
  }
});
