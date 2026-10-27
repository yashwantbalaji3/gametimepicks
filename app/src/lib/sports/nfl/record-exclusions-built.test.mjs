/**
 * NFL record exclusions on the BUILT export (post-build phase; reads out/). Release-owner acceptance for #1253:
 *   · the built page of every excluded event that has a page keeps its official player table, and that table is the
 *     record's (recordInstead) — its input hash and official snapshot, never the excluded revision's;
 *   · an excluded record never renders as official anywhere: no rendered page (HTML / RSC payload; raw data files under
 *     out/data are copies of the committed public artifacts and are not rendered) names the excluded input hash —
 *     EXCEPT inside the one explanatory line a settled page prints for a game graded against the excluded revision
 *     (`data-graded-revision`: "Graded against revision rev-1329Z (identical values; …); the official record is …").
 *
 * Run after `npm run build`: npx tsx --test src/lib/sports/nfl/record-exclusions-built.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { RECORD_EXCLUSIONS } from "./record-exclusions.mjs";
import { loadForecastView } from "./forecast-view-load.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const OUT = path.join(APP, "out");
const has = (rel) => fs.existsSync(path.join(OUT, rel));
const html = (rel) => fs.readFileSync(path.join(OUT, rel), "utf8");
const readRel = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"));
/** Occurrences of `needle` NOT inside the graded-revision line (the marker must open within 600 chars before it). */
const outsideGradedLine = (s, needle) => {
  const out = [];
  for (let i = s.indexOf(needle); i !== -1; i = s.indexOf(needle, i + 1)) {
    if (!s.slice(Math.max(0, i - 600), i).includes("data-graded-revision")) out.push(i);
  }
  return out;
};

test("the built page of an excluded event shows its record's official player table, never the excluded revision", (t) => {
  if (!has("index.html")) { t.skip("no export in this run"); return; }
  let pages = 0;
  for (const e of RECORD_EXCLUSIONS) {
    const rel = `nfl/game/${e.providerEventId}/index.html`;
    if (!has(rel)) continue;
    const view = loadForecastView(path.join(APP, "public"), e.providerEventId);
    if (!view) continue; // settled after the week rolled: the archive path (next test)
    pages += 1;
    const page = html(rel);
    const rec = readRel(e.recordInstead);
    assert.ok(view?.official?.snapshotId, `${e.providerEventId}: the record's official snapshot resolves`);
    assert.match(page, /players on the official board/, `${e.providerEventId}: official player table`);
    assert.ok(page.includes(`snapshot ${view.official.snapshotId.slice(0, 12)}`), `${e.providerEventId}: the table is the record's snapshot`);
    assert.ok(page.includes(rec.model.inputHash), `${e.providerEventId}: the page names the record's input hash ${rec.model.inputHash}`);
    assert.deepEqual(outsideGradedLine(page, e.inputHash), [], `${e.providerEventId}: the excluded revision's input hash ${e.inputHash} appears only in the graded-revision line`);
    assert.doesNotMatch(page, /no official snapshot/);
  }
  t.diagnostic(`${pages} excluded event page(s) checked`);
});

test("a SETTLED page graded against an excluded revision names the official record and says which revision was graded", (t) => {
  if (!has("index.html")) { t.skip("no export in this run"); return; }
  let pages = 0;
  for (const e of RECORD_EXCLUSIONS) {
    const rel = `nfl/game/${e.providerEventId}/index.html`;
    if (!has(rel)) continue;
    const page = html(rel);
    if (!page.includes("data-graded-revision")) continue; // still in the live window: the union path (test above)
    pages += 1;
    const rec = readRel(e.recordInstead);
    // React's server HTML separates text and expressions with <!-- --> markers; read the line as text
    const line = page.slice(page.indexOf("data-graded-revision"), page.indexOf("</p>", page.indexOf("data-graded-revision"))).replace(/<!-- -->/g, "");
    assert.match(line, /Graded against revision rev-1329Z \(identical values/, `${e.providerEventId}: the graded revision is named`);
    assert.match(line, /the official record is rev-1236Z because rev-1329Z used an input sourced after kickoff/);
    assert.ok(page.includes(rec.model.inputHash), `${e.providerEventId}: provenance names the record's input hash`);
    assert.deepEqual(outsideGradedLine(page, e.inputHash), [], "the excluded hash only inside the graded line");
  }
  t.diagnostic(`${pages} settled excluded-event page(s) checked`);
});

test("an excluded record never renders anywhere: no rendered page names an excluded input hash", (t) => {
  if (!has("index.html")) { t.skip("no export in this run"); return; }
  const hits = [];
  let scanned = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (path.relative(OUT, p) !== "data") walk(p); continue; }
      if (!/\.(html|txt)$/.test(e.name)) continue;
      scanned += 1;
      const s = fs.readFileSync(p, "utf8");
      for (const x of RECORD_EXCLUSIONS) if (outsideGradedLine(s, x.inputHash).length) hits.push(`${path.relative(OUT, p)} names ${x.inputHash} outside the graded-revision line`);
    }
  };
  walk(OUT);
  assert.ok(scanned > 100, `scanned ${scanned} rendered files`);
  assert.deepEqual(hits, []);
});
