/**
 * POST-BUILD · the NBA Simulation Theater (a dev-only PRIVATE CANDIDATE) never reaches the default export.
 *
 * Reads app/out/ (so scripts/ci/run-suite.mjs sorts this file into the post-build phase). In a default build — no
 * GTP_DEV_ROUTES=1 — it fails if ANY exported file contains `nba-sim-v1-coherent`, `data/internal/research/nba`,
 * `experimental-v1`, the NBA dev copy's sha256 (current or superseded) or a theater pack with sport `nba`, and if
 * out/dev/ survived the prune. The scanner (export-boundary.mjs) is mutation-tested on a planted export below, so the
 * guard cannot pass by not looking.
 *
 * Run (after `npm run build`): npx tsx --test src/lib/simulation-theater/nba/export-boundary.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { NBA_PRIVATE_MARKERS, scanExportForNbaPrivate } from "./export-boundary.mjs";
import { NBA_BOX_SCORE_SCHEMA, NBA_BOX_WATERMARK } from "./box-score.mjs";
import { NBA_PROJECTED_BOX_SCHEMA } from "./projected-box.mjs";

const APP = process.cwd();
const OUT = path.join(APP, "out");
const BUILT = fs.existsSync(path.join(OUT, "index.html"));
const DEV_BUILD = process.env.GTP_DEV_ROUTES === "1";

test("default export: no file names the private NBA candidate, its data, its family or its sha; no NBA pack; no out/dev/", { skip: !BUILT ? "no export at app/out (run the build first)" : DEV_BUILD ? "GTP_DEV_ROUTES=1 build: the dev tree is kept on purpose (never deploy it)" : false }, () => {
  const r = scanExportForNbaPrivate(OUT);
  assert.ok(r.files > 500, `scanned only ${r.files} files — the scan is not looking at the export`);
  assert.equal(r.devTree, false, "out/dev/ survived the prune");
  assert.deepEqual(r.leaks.slice(0, 20), [], `${r.leaks.length} leak(s)`);
  console.log(`# NBA export boundary: ${r.files} exported files clean; no out/dev/`);
});

test("the markers cover the dev copy actually on disk (its sha256 is listed)", () => {
  const prov = JSON.parse(fs.readFileSync(path.join(APP, "src/lib/simulation-theater/nba/__fixtures__/nba-sim-v1-real-2026-10-20-r2.provenance.json"), "utf8"));
  const bytes = fs.readFileSync(path.join(APP, "src/lib/simulation-theater/nba/__fixtures__", prov.artifactFile));
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha, prov.sha256);
  assert.ok(NBA_PRIVATE_MARKERS.includes(sha), "the current dev copy's sha256 is a marker");
  assert.ok(NBA_PRIVATE_MARKERS.includes(prov.supersedes.sha256), "the superseded copy's sha256 is a marker");
  for (const m of ["nba-sim-v1-coherent", "data/internal/research/nba", "experimental-v1"]) assert.ok(NBA_PRIVATE_MARKERS.includes(m));
});

// ── mutation proof: a planted export with one leak of each kind is caught; a clean one is clean ──────────────────────
function plant(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nba-export-"));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  return dir;
}
const CLEAN = {
  "index.html": "<html><body>NBA · games · forecasts</body></html>",
  "nba/index.html": "<html><body>NBA experimental-v0.2 (public label)</body></html>",
  "_next/static/chunks/app/nba/page-1.js": "self.x='nba schedule'",
  "nfl/simulation/1/index.txt": '1:["theater-pack@1",{"sport":"nfl"}]',
};

test("scanner: a clean planted export is clean", () => {
  const r = scanExportForNbaPrivate(plant(CLEAN));
  assert.equal(r.exists, true);
  assert.equal(r.files, 4);
  assert.equal(r.devTree, false);
  assert.deepEqual(r.leaks, []);
  assert.deepEqual(scanExportForNbaPrivate(path.join(os.tmpdir(), "does-not-exist-nba-export")), { exists: false, files: 0, devTree: false, leaks: [] });
});

test("scanner: each planted leak is caught (engine id, data path, family, both shas, NBA pack as JSON and escaped in RSC, out/dev)", () => {
  const cases = [
    ["_next/static/chunks/9-abc.js", 'const E="nba-sim-v1-coherent"', "nba-sim-v1-coherent"],
    ["nba/game/1/index.html", "<p>source data/internal/research/nba/experimental-v1/forecasts/2026-10-20.json</p>", "data/internal/research/nba"],
    ["nba/game/2/index.txt", '"family":"experimental-v1"', "experimental-v1"],
    ["data/x.json", `{"sha":"${NBA_PRIVATE_MARKERS[3]}"}`, NBA_PRIVATE_MARKERS[3]],
    ["data/y.json", `{"sha":"${NBA_PRIVATE_MARKERS[4]}"}`, NBA_PRIVATE_MARKERS[4]],
    ["nba/sim/1/index.html", '<script>{"v":"theater-pack@1","m":{"sport":"nba"}}</script>', "theater pack with sport nba"],
    ["nba/sim/2/index.txt", '1:"{\\"v\\":\\"theater-pack@1\\",\\"m\\":{\\"sport\\":\\"nba\\"}}"', "theater pack with sport nba"],
    // Projected Final Box Score (Lane A-NBA 2026-10-20)
    ["_next/static/chunks/7-def.js", 'const S="nba-box-score@1"', "nba-box-score@"],
    ["_next/static/chunks/8-ghi.js", '(0,r.jsx)("div",{role:"dialog","data-nba-boxscore":""})', "data-nba-boxscore"],
    ["nba/game/3/index.html", "<p>PROJECTED · SIMULATED · NOT ACTUAL GAME STATISTICS · PRIVATE CANDIDATE MODEL</p>", "PRIVATE CANDIDATE MODEL"],
  ];
  for (const [file, body, marker] of cases) {
    const r = scanExportForNbaPrivate(plant({ ...CLEAN, [file]: body }));
    assert.ok(r.leaks.some((l) => l.file === file && l.marker === marker), `${marker} in ${file}: ${JSON.stringify(r.leaks)}`);
    assert.ok(r.leaks.every((l) => l.file === file), "nothing else is flagged");
  }
  const dev = scanExportForNbaPrivate(plant({ ...CLEAN, "dev/simulation-theater/nba/401909088/index.html": "<html></html>" }));
  assert.equal(dev.devTree, true, "a surviving out/dev/ is reported");
});

test("scanner: build-info's commit subject may name a marker; any other build-info field may not", () => {
  const info = (extra) => JSON.stringify({ commit: { sha: "29b6bdeb", message: "NBA guard fails on experimental-v1 and nba-sim-v1-coherent" }, ...extra });
  const subjectOnly = scanExportForNbaPrivate(plant({ ...CLEAN, "data/build-info.json": info({}) }));
  assert.deepEqual(subjectOnly.leaks, [], "the deployed commit's subject line is not a leak");
  const realLeak = scanExportForNbaPrivate(plant({ ...CLEAN, "data/build-info.json": info({ source: "data/internal/research/nba/x.json" }) }));
  assert.deepEqual(realLeak.leaks, [{ file: "data/build-info.json", marker: "data/internal/research/nba" }]);
  const elsewhere = scanExportForNbaPrivate(plant({ ...CLEAN, "data/other.json": info({}) }));
  assert.ok(elsewhere.leaks.some((l) => l.marker === "experimental-v1"), "a message field outside build-info is still scanned");
});

test("box-score markers: the schema, the dialog attribute and the watermark's private clause are markers; an NFL-style public watermark is not", () => {
  assert.ok(NBA_PRIVATE_MARKERS.some((m) => NBA_BOX_SCORE_SCHEMA.startsWith(m)), "the box-score schema id is covered");
  assert.ok(NBA_PRIVATE_MARKERS.some((m) => NBA_BOX_WATERMARK.includes(m)), "the watermark is covered");
  assert.ok(NBA_PRIVATE_MARKERS.includes("data-nba-boxscore"));
  // V2 (2026-10-20): the three-layer box score's schema and its layer attributes; its CSS (nba-px-*) is not a marker
  assert.ok(NBA_PRIVATE_MARKERS.some((m) => NBA_PROJECTED_BOX_SCHEMA.startsWith(m)), "the three-layer box schema id is covered");
  assert.ok(NBA_PRIVATE_MARKERS.includes("data-nba-px-"));
  const v2css = fs.readFileSync(path.join(APP, "src/components/simulation-theater/nba/nba-theater.css"), "utf8");
  assert.ok(!NBA_PRIVATE_MARKERS.some((m) => v2css.includes(m)), "no marker in the NBA stylesheet (CSS ships un-pruned)");
  for (const m of NBA_PRIVATE_MARKERS) assert.match(m, /^[\x20-\x7e]+$/, `marker ${m} is ASCII (a minifier's escaping cannot hide it)`);
  const nflLike = scanExportForNbaPrivate(plant({ ...CLEAN, "nfl/simulation/2/index.html": '<p>PROJECTED · SIMULATED · NOT ACTUAL GAME STATISTICS</p><table class="st-box-score"></table>' }));
  assert.deepEqual(nflLike.leaks, [], "a public NFL box score's watermark is not an NBA leak");
  // CSS ships un-pruned under _next/static/css, so no NBA box-score CLASS name is a marker (its styles use nba-bx-*)
  const css = scanExportForNbaPrivate(plant({ ...CLEAN, "_next/static/css/a.css": ".nba-bx-table{min-width:600px}.nba-bx-watermark{margin:0}" }));
  assert.deepEqual(css.leaks, []);
});
