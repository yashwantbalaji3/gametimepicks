/**
 * POST-BUILD · the Simulation replay (Theater) on /nfl/simulation/<id>/ follows its build flag (P242 narrow exception).
 *
 * Reads the static export at app/out/ (so scripts/ci/run-suite.mjs sorts this file into the post-build phase):
 *   flag OFF (GTP_NFL_THEATER_PUBLIC unset or not "1" in the environment that built out/ — the gate runs the build and
 *            this phase with the same environment): out/nfl/simulation/<id>/index.html and its RSC payload carry no
 *            `theater-pack@1`, no section markup, and load no theater stylesheet and no island chunk;
 *   flag ON  every page carries the pack, the four labels, the methodology note and the server-rendered drive table.
 *   Projected box score (box-score.mjs): OFF ⇒ no box-score markup, watermark, version tag, rules or script on any page;
 *   ON ⇒ every available page carries the server-rendered box table (watermark, NOT_MODELED rows as words) and its
 *   rules, and a built chunk carries the dialog's module.
 * The scanner itself is mutation-tested against a planted export below, so it cannot pass by not looking.
 *
 * Run (after `npm run build`): npx tsx --test src/lib/simulation-theater/public-theater-export.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { THEATER_MARKERS, boxScoreChunks, islandChunks, referencedAssets, scanSimulationPage } from "./public-theater-export.mjs";
import { PUBLIC_THEATER_LABELS } from "./public-theater.mjs";
import { BOX_SCORE_VERSION, BOX_SCORE_WATERMARK, NOT_MODELED_TEXT } from "./box-score.mjs";

const APP = process.cwd();
const OUT = path.join(APP, "out");
const SIM = path.join(OUT, "nfl", "simulation");
const BUILT = fs.existsSync(path.join(SIM));
const FLAG_ON = process.env.GTP_NFL_THEATER_PUBLIC === "1";
const pages = () => fs.readdirSync(SIM, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(SIM, d.name, "index.html"))).map((d) => d.name).sort();

test("flag OFF: no exported simulation page carries a theater pack, section markup, theater CSS or an island chunk", { skip: !BUILT ? "no export at app/out/nfl/simulation (run the build first)" : FLAG_ON ? "this export was built with GTP_NFL_THEATER_PUBLIC=1" : false }, () => {
  const ids = pages();
  assert.ok(ids.length > 0, "no /nfl/simulation/<id>/ page in the export — the check would be vacuous");
  const islands = islandChunks(OUT);
  const bad = [];
  for (const id of ids) {
    const r = scanSimulationPage(OUT, id, { islands });
    assert.ok(r.referenced.length > 0, `${id}: the scan found no referenced assets — it is not looking`);
    if (r.pack) bad.push(`${id}: theater-pack@1 serialized`);
    for (const m of r.html) bad.push(`${id}: html ${m}`);
    for (const c of r.css) bad.push(`${id}: stylesheet ${c}`);
    for (const c of r.island) bad.push(`${id}: island ${c}`);
    if (r.box.version) bad.push(`${id}: ${BOX_SCORE_VERSION} serialized`);
    for (const m of r.box.html) bad.push(`${id}: box score html ${m}`);
    for (const c of r.box.css) bad.push(`${id}: box score stylesheet ${c}`);
    for (const c of r.box.js) bad.push(`${id}: box score script ${c}`);
  }
  assert.deepEqual(bad, []);
  console.log(`# theater OFF: ${ids.length} simulation pages clean; ${islands.length} island chunk(s) elsewhere in the export (dev route), none referenced`);
});

test("flag ON: every exported simulation page carries the pack, the labels, the methodology note and the drive table", { skip: !BUILT ? "no export at app/out/nfl/simulation" : !FLAG_ON ? "flag OFF build" : false }, () => {
  const ids = pages();
  assert.ok(ids.length > 0);
  for (const id of ids) {
    const r = scanSimulationPage(OUT, id);
    const html = fs.readFileSync(path.join(SIM, id, "index.html"), "utf8");
    if (/data-stp-state="unavailable"/.test(html)) {
      assert.match(html, /Simulation replay unavailable/, `${id}: truthful unavailable state`);
      assert.equal(r.pack, false, `${id}: nothing packed when unavailable`);
      continue;
    }
    assert.ok(r.pack, `${id}: pack`);
    for (const l of PUBLIC_THEATER_LABELS) assert.ok(html.includes(`<li>${l}</li>`), `${id}: label ${l}`);
    assert.match(html, /data-stp-method=""/, `${id}: methodology note`);
    assert.match(html, /data-stp-drive-table=""[\s\S]*<tbody>[\s\S]*data-stp-drive="1"/, `${id}: server-rendered drive table`);
    assert.ok(!/Development route · unlinked/.test(html), `${id}: no dev bar`);
    // the projected box score of the same run, server-rendered
    assert.deepEqual(r.box.html, THEATER_MARKERS.boxScore.html, `${id}: box score table, compare table and watermark`);
    assert.ok(r.box.version, `${id}: ${BOX_SCORE_VERSION} tag`);
    assert.ok(html.includes(BOX_SCORE_WATERMARK), `${id}: watermark`);
    assert.ok(html.includes(NOT_MODELED_TEXT), `${id}: NOT_MODELED rows rendered as words`);
    assert.match(html, /data-stbx-player="passing"/, `${id}: player sections listed as not modeled`);
    assert.ok(r.box.css.length > 0, `${id}: box score rules in a referenced stylesheet`);
  }
  assert.ok(boxScoreChunks(OUT).length > 0, "the box score dialog's module is in a built chunk (the island)");
});

// ── the scanner, against planted exports (runs with or without a build) ────────────────────────────────────────────
function plant({ pack = false, css = false, island = false, named = false, boxHtml = false, boxCss = false, boxJs = false }) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "theater-export-"));
  const w = (rel, body) => { fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true }); fs.writeFileSync(path.join(out, rel), body); };
  w("_next/static/chunks/app/nfl/simulation/[eventId]/page-1.js", named ? `x.u=function(){return "static/chunks/917-abc.js"}` : "self.page=1");
  w("_next/static/chunks/917-abc.js", `const V="theater-pack@1";const L="Simulation theater";`); // an island chunk (dev route)
  w("_next/static/css/a.css", `${css ? ".st-root{color:var(--x)}" : ".vault{color:var(--x)}"}${boxCss ? ".stbx-table{width:100%}" : ""}`);
  w("_next/static/chunks/55-box.js", `const B="nfl-box-score@1";`); // the dialog's module in a shared chunk
  const scripts = [`<script src="/_next/static/chunks/app/nfl/simulation/[eventId]/page-1.js"></script>`];
  if (island) scripts.push(`<script src="/_next/static/chunks/917-abc.js"></script>`);
  if (boxJs) scripts.push(`<script src="/_next/static/chunks/55-box.js"></script>`);
  const box = boxHtml ? `<section class="stbx stbx-static" data-stbx-static="" data-stbx-version="nfl-box-score@1"><p>SIMULATED · PROJECTED · NOT ACTUAL GAME STATISTICS</p><table data-stbx-compare=""></table></section>` : "";
  w("nfl/simulation/1/index.html", `<html><head><link rel="stylesheet" href="/_next/static/css/a.css"/>${scripts.join("")}</head><body>${box}${pack ? '<script>self.__next_f.push([1,"{\\"v\\":\\"theater-pack@1\\"}"])</script>' : ""}</body></html>`);
  w("nfl/simulation/1/index.txt", "0:[]");
  return out;
}

test("scanner: a clean page is clean; a planted pack, theater CSS, island script or island reference is caught", () => {
  const clean = scanSimulationPage(plant({}), "1");
  assert.equal(clean.exists, true);
  assert.deepEqual([clean.pack, clean.css, clean.island, clean.html], [false, [], [], []]);
  assert.deepEqual(clean.box, { version: false, html: [], css: [], js: [] });
  const bh = scanSimulationPage(plant({ boxHtml: true }), "1");
  assert.equal(bh.box.version, true);
  assert.deepEqual(bh.box.html, ["data-stbx-static", "data-stbx-compare", "SIMULATED · PROJECTED · NOT ACTUAL GAME STATISTICS"]);
  assert.deepEqual(bh.html, ["data-stbx-static"], "the box table alone is caught by the section markers too");
  assert.deepEqual(scanSimulationPage(plant({ boxCss: true }), "1").box.css, ["static/css/a.css"]);
  assert.deepEqual(scanSimulationPage(plant({ boxCss: true }), "1").css, [], "box rules are their own marker");
  assert.deepEqual(scanSimulationPage(plant({ boxJs: true }), "1").box.js, ["static/chunks/55-box.js"]);
  assert.deepEqual(boxScoreChunks(plant({})), ["static/chunks/55-box.js"]);
  assert.equal(scanSimulationPage(plant({ pack: true }), "1").pack, true);
  assert.deepEqual(scanSimulationPage(plant({ css: true }), "1").css, ["static/css/a.css"]);
  assert.deepEqual(scanSimulationPage(plant({ island: true }), "1").island, ["static/chunks/917-abc.js"]);
  assert.equal(scanSimulationPage(plant({ named: true }), "1").island.length, 1, "a loaded chunk that names the island file");
  assert.deepEqual(islandChunks(plant({})), ["static/chunks/917-abc.js"]);
  assert.deepEqual(referencedAssets('<script src="/_next/static/chunks/a-1.js"></script>"static/css/b.css"'), ["static/chunks/a-1.js", "static/css/b.css"]);
});
