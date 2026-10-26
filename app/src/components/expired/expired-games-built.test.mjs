/**
 * POST-BUILD · expired game links (founder P1 2026-10-26), read from the built export: the index ships as one static file
 * the 404 notices fetch, and NOT inside any page — the root not-found tree rides in every page's flight payload, so an
 * index passed as a 404 prop cost ~18 KB on every page (CI 2026-10-26: /teams/nfl 80.7 → 98.4 KB).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");

test("out/data/expired-games.json ships with every sport's index; no page carries the index", (t) => {
  if (!fs.existsSync(path.join(OUT, "index.html"))) { t.skip("no export in this run"); return; }
  const file = path.join(OUT, "data", "expired-games.json");
  assert.ok(fs.existsSync(file), "the post-build /data sweep kept the fetched file");
  const idx = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const k of ["nba", "mlb", "ufc"]) assert.equal(typeof idx[k], "object", k);
  assert.ok(fs.statSync(file).size < 40_000, `index bytes ${fs.statSync(file).size}`);
  // a key that only the index carries: an MLB slug or UFC bout id must not appear in the 404 page or a sample of pages
  const probe = Object.keys(idx.mlb)[0] ?? Object.keys(idx.ufc)[0];
  if (!probe) { t.diagnostic("index empty in this window — nothing to probe"); return; }
  const pages = ["404.html", "index.html", "teams/nfl/index.html"].map((p) => path.join(OUT, p)).filter((p) => fs.existsSync(p));
  assert.ok(pages.length >= 2, "pages to probe");
  for (const p of pages) assert.ok(!fs.readFileSync(p, "utf8").includes(`"${probe}"`), `${path.relative(OUT, p)} carries the index (${probe})`);
});
