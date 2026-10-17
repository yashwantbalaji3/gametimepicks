/**
 * TRUTH-001 · Stage B — MLB forecast-of-record restatements: fail-closed, exact, approval-gated, append-only.
 *
 * Run: npx tsx --test src/lib/mlb/results/restatements.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { RESTATEMENT_SCHEMA, countsAsPublicForecast, indexRestatements, rowsOfRecord } from "./restatements.mjs";
import { readMlbGradesOfRecord, readRestatementLogs } from "./grades-of-record-io.mjs";
import { compareLedgers } from "../../forecast-ledger/append-only.mjs";
import { CONTRACT_AMENDMENTS, LEDGER_FILE_STATUSES, PUBLIC_LEDGER_STATUSES, validateRow } from "../../forecast-ledger/contract.mjs";
import { forecastRecord, statusCounts } from "../../results/v2/forecast-record.mjs";

const ROOT = path.resolve(process.cwd(), "..");
const row = (over = {}) => ({ gamePk: 1, date: "2026-09-04", market: "moneyline", pick: "A (home)", modelProbability: 0.55, outcome: "LOSS", forecastSource: "snapshot:x", gradedAt: "g", ...over });
const log = (games, status = "PROPOSED_NOT_APPLIED") => ({ file: "t.json", doc: { schema: RESTATEMENT_SCHEMA, restatementId: "t", status, games } });

test("rows of record: a restated row is replaced, a NOT_SERVED row is kept and marked, everything else untouched", () => {
  const stored = [row(), row({ market: "total", pick: "UNDER 8" }), row({ gamePk: 2 })];
  const after = row({ pick: "B (away)", modelProbability: 0.52, outcome: "WIN", forecastSource: "git:abc" });
  const idx = indexRestatements([log([
    { gamePk: 1, date: "2026-09-04", kind: "SERVED_DIFFERENT_REVISION", rows: [{ log: "game-predictions-graded", before: stored[0], after }] },
    { gamePk: 1, date: "2026-09-04", kind: "NOT_SERVED", rows: [{ log: "game-predictions-graded", before: stored[1], after: null }] },
  ])]);
  const out = rowsOfRecord("game-predictions-graded", stored, idx);
  assert.equal(out[0].pick, "B (away)");
  assert.deepEqual(out[0].restatement, { id: "t", kind: "SERVED_DIFFERENT_REVISION", replacedSource: "snapshot:x" });
  assert.equal(out[1].pick, "UNDER 8", "never substituted");
  assert.equal(out[1].publication, "NOT_SERVED");
  assert.equal(countsAsPublicForecast(out[1]), false);
  assert.deepEqual(out[2], stored[2], "an unrelated row is byte-identical");
});

test("fail closed: a drifted before-state, an unmatched key, a double restatement, a NOT_SERVED replacement all refuse", () => {
  const stored = [row()];
  const entry = (before, after = row({ outcome: "WIN" })) => ({ gamePk: 1, date: "2026-09-04", kind: "SERVED_DIFFERENT_REVISION", rows: [{ log: "game-predictions-graded", before, after }] });
  assert.throws(() => rowsOfRecord("game-predictions-graded", stored, indexRestatements([log([entry(row({ modelProbability: 0.56 }))])])), /no longer matches/);
  assert.throws(() => rowsOfRecord("game-predictions-graded", stored, indexRestatements([log([entry(row({ gamePk: 9 }))])])), /matches no stored row/);
  assert.throws(() => indexRestatements([log([entry(row()), entry(row())])]), /restated twice/);
  assert.throws(() => indexRestatements([log([{ gamePk: 1, date: "2026-09-04", kind: "NOT_SERVED", rows: [{ log: "game-predictions-graded", before: row(), after: row() }] }])]), /carries a replacement/);
  assert.throws(() => indexRestatements([{ file: "x", doc: { schema: "other" } }]), /is not/);
});

test("approval gate: the committed PROPOSED log applies nowhere unless explicitly included for local validation", () => {
  assert.deepEqual(readRestatementLogs(ROOT, { includeProposed: false }), []);
  const applied = readMlbGradesOfRecord(ROOT, { includeProposed: false });
  const stored = fs.readFileSync(path.join(ROOT, "app/public/data/mlb/results/game-predictions-graded.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  assert.deepEqual(applied.graded, stored, "with no approved log, the rows of record ARE the stored rows");
});

test("the committed log, applied locally: exactly its listed rows change, the counts match, unverified games are untouched", () => {
  const logs = readRestatementLogs(ROOT, { includeProposed: true });
  assert.equal(logs.length, 1);
  const doc = logs[0].doc;
  assert.equal(doc.status, "PROPOSED_NOT_APPLIED", "still a proposal");
  const stored = fs.readFileSync(path.join(ROOT, "app/public/data/mlb/results/game-predictions-graded.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const { graded } = readMlbGradesOfRecord(ROOT, { includeProposed: true });
  assert.equal(graded.length, stored.length, "no row disappears");
  const listed = new Set(doc.games.flatMap((g) => g.rows.filter((r) => r.log === "game-predictions-graded").map((r) => `${r.before.date}|${r.before.gamePk}|${r.before.market}`)));
  let changed = 0;
  for (let i = 0; i < stored.length; i += 1) {
    const k = `${stored[i].date}|${stored[i].gamePk}|${stored[i].market}`;
    if (JSON.stringify(stored[i]) !== JSON.stringify(graded[i])) { changed += 1; assert.ok(listed.has(k), `${k} changed but is not listed`); }
  }
  assert.equal(changed, listed.size);
  // The classification's UNVERIFIED games never appear in the log.
  const cls = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/ops/forecast-of-record-shadow/classification.json"), "utf8"));
  const unverified = new Set(cls.games.filter((g) => g.class.startsWith("UNVERIFIED")).map((g) => g.gamePk));
  assert.ok(doc.games.every((g) => !unverified.has(g.gamePk)));
  assert.equal(doc.games.filter((g) => g.kind === "NOT_SERVED").length, 4);
  assert.deepEqual(doc.held.map((h) => h.gamePk), [824424]);
});

test("the log builder's --check reproduces the committed log exactly (atomic and reproducible)", () => {
  const out = execFileSync("npx", ["tsx", "scripts/mlb/build-forecast-of-record-restatements.mjs", "--check"], { cwd: process.cwd(), encoding: "utf8" });
  assert.match(out, /RESTATEMENTS_CURRENT/);
});

test("contract amendment 1: NOT_SERVED is a ledger-file state, never a public forecast state, and it is dated", () => {
  assert.ok(LEDGER_FILE_STATUSES.includes("NOT_SERVED"));
  assert.ok(!PUBLIC_LEDGER_STATUSES.includes("NOT_SERVED"));
  assert.equal(CONTRACT_AMENDMENTS[0].id, "forecast-ledger@1/amendment-1");
  assert.equal(CONTRACT_AMENDMENTS[0].date, "2026-10-10");
  assert.ok(!validateRow({ publicationStatus: "NOT_SERVED" }).some((p) => /publicationStatus/.test(p)));
  assert.ok(validateRow({ publicationStatus: "SHADOW" }).some((p) => /publicationStatus/.test(p)));
});

test("ledger guard: only the listed (forecastId, field) changes are forgiven, exactly; PUBLISHED → NOT_SERVED only when listed", () => {
  const base = { forecastId: "fl1-0000000000000001", publicationStatus: "PUBLISHED", probability: 0.55, direction: "A", receiptId: "s", settlement: { state: "SETTLED", finalValue: 0, finalCategory: "LOSS", corrections: 0 }, measurement: { directionalResult: "LOSS" } };
  const next = { ...base, probability: 0.52, direction: "B", receiptId: "g", settlement: { ...base.settlement, finalValue: 1, finalCategory: "WIN", corrections: 1 }, measurement: { directionalResult: "WIN" } };
  // Without a listing: refused.
  assert.ok(compareLedgers([base], [next]).some((v) => v.kind === "IMMUTABLE_CHANGED"));
  const fields = { probability: { before: 0.55, after: 0.52 }, direction: { before: "A", after: "B" }, receiptId: { before: "s", after: "g" } };
  assert.deepEqual(compareLedgers([base], [next], { restatements: new Map([[base.forecastId, { fields, restatementId: "t" }]]) }), []);
  // A field that changes but is not listed still refuses.
  const partial = { probability: fields.probability, direction: fields.direction };
  assert.ok(compareLedgers([base], [next], { restatements: new Map([[base.forecastId, { fields: partial, restatementId: "t" }]]) }).some((v) => v.kind === "IMMUTABLE_CHANGED"));
  // A listed change with the wrong values refuses.
  assert.ok(compareLedgers([base], [next], { restatements: new Map([[base.forecastId, { fields: { ...fields, probability: { before: 0.55, after: 0.6 } }, restatementId: "t" }]]) }).some((v) => v.kind === "RESTATEMENT_MISMATCH"));
  // NOT_SERVED: refused unless listed.
  const ns = { ...base, publicationStatus: "NOT_SERVED" };
  assert.ok(compareLedgers([base], [ns]).some((v) => v.kind === "PUBLICATION_CHANGED"));
  assert.deepEqual(compareLedgers([base], [ns], { restatements: new Map([[base.forecastId, { fields: { publicationStatus: { before: "PUBLISHED", after: "NOT_SERVED" } }, restatementId: "t" }]]) }), []);
  // Any other publication move under a listing refuses.
  assert.ok(compareLedgers([ns], [base], { restatements: new Map([[base.forecastId, { fields: { publicationStatus: { before: "NOT_SERVED", after: "PUBLISHED" } }, restatementId: "t" }]]) }).some((v) => v.kind === "RESTATEMENT_MISMATCH"));
});

test("Results fail closed: a NOT_SERVED row is never published, measured, counted in a W–L or in the KPIs", () => {
  const mk = (id, status, result) => ({ forecastId: id, sport: "MLB", family: "mlb_moneyline", forecastKind: "BINARY_PROBABILITY", publicationStatus: status, probability: 0.6, settlement: { state: "SETTLED", settledAt: "2026-09-05" }, measurement: { type: "PROBABILITY_SCORE", brier: 0.16, logLoss: 0.51, observed: 1, directionalResult: result, directionalBasis: "PUBLISHED_PICK" } });
  const rows = [mk("a", "PUBLISHED", "WIN"), mk("b", "NOT_SERVED", "WIN"), mk("c", "PUBLISHED", "LOSS")];
  const c = statusCounts(rows);
  assert.equal(c.published, 2);
  assert.equal(c.notServed, 1);
  assert.equal(c.measured, 2);
  const rec = forecastRecord(rows);
  assert.equal(rec.kpis.forecasts, 2);
  assert.equal(rec.kpis.notServed, 1);
  const fam = rec.sports[0].families[0];
  assert.equal(fam.directional.win + fam.directional.loss, 2);
});
