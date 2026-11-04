import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPropAnalysisArtifacts, pricesPath, publicPath, readPropAnalysis, writePropAnalysisArtifacts } from "./nba-prop-analysis.mjs";

const KEY = "11".repeat(32); // test key only
const OTHER = "22".repeat(32);
const LANE_SHA = "ab".repeat(32);
const row = (over) => ({
  eventId: "401900001", game: "AAA @ BBB", tipUtc: "2099-01-15T00:00Z", playerId: "7", name: "Test Player", team: "BBB", family: "pts",
  projectionLabel: "MODEL PROJECTION", projection: 21.3, expectedMinutes: 32,
  line: { book: "draftkings", line: 19.5, overPrice: -115, underPrice: -105, capturedAt: "2099-01-14T20:00:00.000Z" },
  bookRange: { min: 19.5, max: 20.5, books: 3 }, state: "COMPARED", excluded: [], ...over,
});
const analysis = {
  schema: "gtp-nba-prop-provisional-analysis@1", date: "2099-01-15",
  lane: { file: "app/public/data/nba/experimental-public/2099-01-15.json", generatedAt: "2099-01-15T06:00:00Z", family: "v0.1" },
  capture: { file: "2099-01-14T2000Z.json", capturedAt: "2099-01-14T20:00:00.000Z" }, offerRule: "chooseOffer", lineMaxAgeHours: 6,
  comparisonRule: "nba-line-comparison@1", guard: { rules: { R1: "status Out or Day-To-Day" } },
  rows: [row(), row({ playerId: "8", name: "Guarded Player", state: "EXCLUDED", excluded: [{ rule: "R1", reason: "injury status Day-To-Day" }] }), row({ family: "reb", projection: 4.1, line: { book: "fanduel", line: 5.5, overPrice: 100, underPrice: -130, capturedAt: "2099-01-14T20:00:00.000Z" } })],
};
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "prop-analysis-")); fs.mkdirSync(path.join(d, "app")); return path.join(d, "app"); };

test("public artifact is price-free, labelled provisional, deterministic and has no probability", () => {
  const a = buildPropAnalysisArtifacts(analysis, { laneSha256: LANE_SHA });
  const b = buildPropAnalysisArtifacts(structuredClone(analysis), { laneSha256: LANE_SHA });
  assert.deepEqual(a.publicDoc, b.publicDoc);
  assert.equal(a.pricesPlain, b.pricesPlain);
  const text = JSON.stringify(a.publicDoc);
  for (const banned of ['"line"', '"book"', "American", "capturedAt", "draftkings", "19.5", "probability", "confidence"]) assert.ok(!text.includes(banned), `public file contains ${banned}`);
  assert.equal(a.publicDoc.gate.passed, false);
  assert.match(a.publicDoc.label, /not a challenge leg/);
  assert.equal(a.publicDoc.rows[0].projection.label, "MODEL PROJECTION");
});

test("reader joins with the key: difference = projection − line; excluded rows have no difference or side", () => {
  const app = tmp();
  writePropAnalysisArtifacts({ appDir: app, analysis, laneSha256: LANE_SHA, env: { GTP_ODDS_DISPLAY_KEY: KEY } });
  const r = readPropAnalysis({ appDir: app, date: "2099-01-15", env: { GTP_ODDS_DISPLAY_KEY: KEY }, asOf: "2099-01-14T21:00:00Z" });
  assert.equal(r.pricesAvailable, true);
  const pts = r.rows.find((x) => x.playerId === "7" && x.market === "pts");
  assert.equal(pts.difference, 1.8);
  assert.equal(pts.side, "OVER");
  assert.equal(pts.book, "draftkings");
  const reb = r.rows.find((x) => x.market === "reb");
  assert.equal(reb.side, "UNDER");
  const g = r.rows.find((x) => x.playerId === "8");
  assert.equal(g.state, "EXCLUDED");
  assert.equal(g.difference, null);
  assert.equal(g.side, null);
  assert.equal(g.line, 19.5, "an excluded row still shows its line");
  assert.ok(!r.rows.some((x) => "probability" in x));
});

test("stale line (older than 6 h at the comparison instant) gives no difference", () => {
  const app = tmp();
  const early = { ...analysis, rows: [row({ line: { book: "draftkings", line: 19.5, overPrice: -115, underPrice: -105, capturedAt: "2099-01-14T15:00:00.000Z" } })] };
  writePropAnalysisArtifacts({ appDir: app, analysis: early, laneSha256: LANE_SHA, env: { GTP_ODDS_DISPLAY_KEY: KEY } });
  const r = readPropAnalysis({ appDir: app, date: "2099-01-15", env: { GTP_ODDS_DISPLAY_KEY: KEY }, asOf: "2099-01-14T23:30:00Z" });
  const pts = r.rows.find((x) => x.playerId === "7" && x.market === "pts");
  assert.equal(pts.comparison, "STALE");
  assert.equal(pts.difference, null);
});

test("no key or another key → public rows only, no prices; no public file → null", () => {
  const app = tmp();
  writePropAnalysisArtifacts({ appDir: app, analysis, laneSha256: LANE_SHA, env: { GTP_ODDS_DISPLAY_KEY: KEY } });
  for (const env of [{}, { GTP_ODDS_DISPLAY_KEY: OTHER }]) {
    const r = readPropAnalysis({ appDir: app, date: "2099-01-15", env });
    assert.equal(r.pricesAvailable, false);
    assert.ok(r.rows.every((x) => x.line === null && x.difference === null && x.side === null));
  }
  assert.equal(readPropAnalysis({ appDir: app, date: "2099-01-16", env: {} }), null);
});

test("exporter refuses without a key; an edited public file or a prices file bound elsewhere throws", () => {
  assert.throws(() => writePropAnalysisArtifacts({ appDir: tmp(), analysis, laneSha256: LANE_SHA, env: {} }), /GTP_ODDS_DISPLAY_KEY/);
  const app = tmp();
  writePropAnalysisArtifacts({ appDir: app, analysis, laneSha256: LANE_SHA, env: { GTP_ODDS_DISPLAY_KEY: KEY } });
  const pub = publicPath(app, "2099-01-15");
  const doc = JSON.parse(fs.readFileSync(pub, "utf8"));
  doc.rows[0].projection.value = 30;
  fs.writeFileSync(pub, JSON.stringify(doc));
  assert.throws(() => readPropAnalysis({ appDir: app, date: "2099-01-15", env: { GTP_ODDS_DISPLAY_KEY: KEY } }), /contentSha256/);
  const app2 = tmp();
  writePropAnalysisArtifacts({ appDir: app2, analysis, laneSha256: LANE_SHA, env: { GTP_ODDS_DISPLAY_KEY: KEY } });
  writePropAnalysisArtifacts({ appDir: app, analysis: { ...analysis, rows: analysis.rows.slice(0, 1) }, laneSha256: LANE_SHA, env: { GTP_ODDS_DISPLAY_KEY: KEY } });
  fs.copyFileSync(pricesPath(app2, "2099-01-15"), pricesPath(app, "2099-01-15"));
  assert.throws(() => readPropAnalysis({ appDir: app, date: "2099-01-15", env: { GTP_ODDS_DISPLAY_KEY: KEY } }), /different public file/);
});
