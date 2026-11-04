import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DISPLAY_AUTHORIZATION } from "./display-authorization.mjs";
import { DisplayArtifactTamperedError } from "./display-crypto.mjs";
import { PROP_ANALYSIS_LABEL, propAnalysisPath, readPropAnalysis, sitePropAnalysis, writePropAnalysis } from "./nba-prop-analysis.mjs";

const KEY = "11".repeat(32); // test key only
const env = { GTP_ODDS_DISPLAY_KEY: KEY };
const row = (over) => ({
  eventId: "401900001", game: "AAA @ BBB", tipUtc: "2099-01-15T00:00Z", playerId: "7", name: "Test Player", team: "BBB", family: "pts",
  projectionLabel: "MODEL PROJECTION", projection: 21.3, expectedMinutes: 32,
  line: { book: "draftkings", line: 19.5, overPrice: -115, underPrice: -105, capturedAt: "2099-01-14T20:00:00.000Z" },
  bookRange: { min: 19.5, max: 20.5, books: 3 }, difference: 1.8, differenceExact: 1.8000000000000007, side: "OVER", state: "COMPARED", comparisonReason: null, excluded: [], ...over,
});
const analysis = {
  schema: "gtp-nba-prop-provisional-analysis@1", dataClass: "PRIVATE_RESEARCH", label: PROP_ANALYSIS_LABEL, date: "2099-01-15", generatedAt: "2099-01-15T06:31:07.123Z", asOf: "2099-01-15T06:30:00Z",
  lane: { file: "app/public/data/nba/experimental-public/2099-01-15.json", generatedAt: "2099-01-15T06:00:00Z", family: "v0.1" },
  capture: { file: "2099-01-14T2000Z.json", capturedAt: "2099-01-14T20:00:00.000Z", records: 3, books: ["draftkings"] }, lineStaleAfter: "2099-01-15T02:00:00.000Z",
  rows: [row(), row({ playerId: "8", name: "Guarded Player", state: "EXCLUDED", difference: null, differenceExact: null, side: null, excluded: [{ rule: "R1", reason: "injury status Day-To-Day" }] })],
  notProjected: [], summary: { compared: 1, excluded: 1, topDifferences: [{ name: "Test Player", family: "pts", difference: 1.8, side: "OVER" }] },
};
const tmpApp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "prop-analysis-")); fs.mkdirSync(path.join(d, "app")); return path.join(d, "app"); };
const siteOff = { ...DISPLAY_AUTHORIZATION, nba: { ...DISPLAY_AUTHORIZATION.nba, siteDisplay: false } };

test("site document: verbatim label, gate not passed, no side anywhere, no wall clock, no probability", () => {
  const d = sitePropAnalysis(analysis);
  const text = JSON.stringify(d);
  assert.equal(d.label, PROP_ANALYSIS_LABEL);
  assert.equal(d.gate.passed, false);
  for (const banned of ['"side"', "generatedAt\":\"2099-01-15T06:31", "probability", "confidence"]) assert.ok(!text.includes(banned), `contains ${banned}`);
  assert.equal(d.rows[0].difference, 1.8);
  assert.equal(d.rows[0].line.book, "draftkings");
});

test("write → read round trip; deterministic bytes; nothing in plaintext on disk", () => {
  const a = tmpApp(), b = tmpApp();
  writePropAnalysis({ appDir: a, analysis, env });
  writePropAnalysis({ appDir: b, analysis: { ...structuredClone(analysis), generatedAt: "2099-01-15T07:00:00Z" }, env });
  const ea = fs.readFileSync(propAnalysisPath(a, "2099-01-15"), "utf8");
  assert.equal(ea, fs.readFileSync(propAnalysisPath(b, "2099-01-15"), "utf8"));
  assert.ok(!ea.includes("draftkings") && !ea.includes("Test Player"));
  const doc = readPropAnalysis({ appDir: a, date: "2099-01-15", env });
  assert.equal(doc.rows.length, 2);
  assert.equal(doc.rows.find((r) => r.state === "EXCLUDED").difference, null);
});

test("null: no file, no key, another key, site display not authorized", () => {
  const a = tmpApp();
  writePropAnalysis({ appDir: a, analysis, env });
  assert.equal(readPropAnalysis({ appDir: a, date: "2099-01-16", env }), null);
  assert.equal(readPropAnalysis({ appDir: a, date: "2099-01-15", env: {} }), null);
  assert.equal(readPropAnalysis({ appDir: a, date: "2099-01-15", env: { GTP_ODDS_DISPLAY_KEY: "22".repeat(32) } }), null);
  assert.equal(readPropAnalysis({ appDir: a, date: "2099-01-15", env, record: siteOff }), null);
});

test("refusals: no key, site off, not the provisional label; tampered or renamed envelope throws", () => {
  assert.throws(() => writePropAnalysis({ appDir: tmpApp(), analysis, env: {} }), /GTP_ODDS_DISPLAY_KEY/);
  assert.throws(() => writePropAnalysis({ appDir: tmpApp(), analysis, env, record: siteOff }), /REFUSED/);
  assert.throws(() => sitePropAnalysis({ ...analysis, label: "Top picks" }), /provisional label/);
  const a = tmpApp();
  writePropAnalysis({ appDir: a, analysis, env });
  const f = propAnalysisPath(a, "2099-01-15");
  const e = JSON.parse(fs.readFileSync(f, "utf8"));
  fs.writeFileSync(f, JSON.stringify({ ...e, ct: Buffer.from("x".repeat(40)).toString("base64") }));
  assert.throws(() => readPropAnalysis({ appDir: a, date: "2099-01-15", env }), DisplayArtifactTamperedError);
  const b = tmpApp();
  writePropAnalysis({ appDir: b, analysis, env });
  const g = propAnalysisPath(b, "2099-01-16");
  fs.copyFileSync(propAnalysisPath(b, "2099-01-15"), g);
  assert.throws(() => readPropAnalysis({ appDir: b, date: "2099-01-16", env }), DisplayArtifactTamperedError);
});
