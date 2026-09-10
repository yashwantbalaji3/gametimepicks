import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CHALLENGER, challengerInterval, contractBars, decide, publishedMarginInterval, shadowRows } from "./margin-interval-shadow.mjs";

const REPO = path.resolve(process.cwd(), "..");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"));
const CONTRACT = read("data/internal/research/nfl/regular-season-evaluation-contract.json");
const SHA = crypto.createHash("sha256").update(fs.readFileSync(path.join(REPO, CHALLENGER.preregistration))).digest("hex");

test("the frozen quantiles are the preregistered procedure's output (the evaluation report's fit)", () => {
  const rep = read("data/internal/research/nfl/reports/margin-interval-challenger-2025.json");
  assert.equal(CHALLENGER.residualQ10, rep.fit.residualQ10);
  assert.equal(CHALLENGER.residualQ90, rep.fit.residualQ90);
});

test("the preregistration's bytes still match the frozen hash", () => {
  assert.equal(SHA, CHALLENGER.preregistrationSha256);
});

test("the bars come from the contract's own words — 64 games, 4 weeks, band 0.75–0.85, MAE pad 0.5", () => {
  assert.deepEqual(contractBars(CONTRACT), { minimumSample: 64, minimumWeeks: 4, bandLo: 0.75, bandHi: 0.85, maePad: 0.5 });
  assert.throws(() => contractBars({ ...CONTRACT, bars: { marginHead: { requirement: "coverage should be good" } } }), /expected words/);
});

const rowsOf = (n, weeks, incIn, chaIn) => Array.from({ length: n }, (_, i) => ({ id: String(i), week: 1 + (i % weeks), projected: 0, actual: 0, incumbentInside: i < incIn * n, challengerInside: i < chaIn * n }));

test("under the minimum NOTHING is decided — in either direction", () => {
  const d = decide({ rows: rowsOf(63, 4, 0.6, 0.8), contract: CONTRACT, preregistrationSha256: SHA });
  assert.equal(d.decision, "INSUFFICIENT_SAMPLE");
  assert.equal(decide({ rows: rowsOf(80, 3, 0.6, 0.8), contract: CONTRACT, preregistrationSha256: SHA }).decision, "INSUFFICIENT_SAMPLE", "weeks count too");
});

test("PROMOTE only when the challenger is in band and the incumbent is not", () => {
  assert.equal(decide({ rows: rowsOf(80, 5, 0.65, 0.8), contract: CONTRACT, preregistrationSha256: SHA }).decision, "PROMOTE_CHALLENGER");
  assert.equal(decide({ rows: rowsOf(80, 5, 0.8, 0.8), contract: CONTRACT, preregistrationSha256: SHA }).decision, "KEEP_INCUMBENT", "both in band → keep");
  assert.equal(decide({ rows: rowsOf(80, 5, 0.65, 0.7), contract: CONTRACT, preregistrationSha256: SHA }).decision, "KEEP_INCUMBENT", "challenger out too → keep");
  assert.equal(decide({ rows: rowsOf(80, 5, 0.65, 0.95), contract: CONTRACT, preregistrationSha256: SHA }).decision, "KEEP_INCUMBENT", "a band, not a floor — too wide fails");
});

test("an altered preregistration decides nothing", () => {
  assert.equal(decide({ rows: rowsOf(80, 5, 0.65, 0.8), contract: CONTRACT, preregistrationSha256: "0".repeat(64) }).decision, "PREREGISTRATION_ALTERED");
});

test("the generator publishes the challenger ONLY on a positive promotion", () => {
  const inc = { median: 3.5, incumbentP10: -14, incumbentP90: 21 };
  assert.equal(publishedMarginInterval({ ...inc, report: null }).source, "incumbent");
  assert.equal(publishedMarginInterval({ ...inc, report: { decision: "INSUFFICIENT_SAMPLE" } }).source, "incumbent");
  const p = publishedMarginInterval({ ...inc, report: { decision: "PROMOTE_CHALLENGER", challenger: { id: CHALLENGER.id } } });
  assert.deepEqual(p, { ...challengerInterval(3.5), source: CHALLENGER.id });
});

test("REAL DATA · only regular-season rows are graded, each game once", () => {
  const dir = path.join(REPO, "data/internal/nfl/experimental-settlement");
  const docs = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  const rows = shadowRows(docs);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  const preseason = docs.flatMap((d) => d.events ?? []).filter((e) => e.seasonType === 1 || /pre/i.test(String(e.seasonType)));
  assert.ok(rows.every((r) => !preseason.some((e) => String(e.canonicalEventId) === r.id)), "preseason evidence neither qualifies nor disqualifies");
});
