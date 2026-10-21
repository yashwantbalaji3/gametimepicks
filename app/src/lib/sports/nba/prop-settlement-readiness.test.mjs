/**
 * NBA player-prop settlement readiness: forward-graded evidence opens the settlement gate per family, and nothing else.
 * Run: npx tsx --test src/lib/sports/nba/prop-settlement-readiness.test.mjs
 *
 * Ledger entries below are TEST FIXTURES in the nba-prop-shadow-grade@1 shape. No line here is a price.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { nbaPropSettlementReadiness } from "./prop-settlement-readiness.mjs";
import { committedNbaPropReadiness } from "./prop-settlement-source.mjs";

const entry = (seq, family, state, { date = "2026-10-20", eventId = "401909088", playerId = "1" } = {}) => ({
  schema: "nba-prop-shadow-grade@1", seq, key: `${date}|${eventId}|${playerId}|${family}`, date, eventId, playerId, family, state,
});

test("no ledger, an empty ledger, or only pending rows: no family is ready", () => {
  assert.deepEqual(nbaPropSettlementReadiness(null).readyFamilies, []);
  assert.deepEqual(nbaPropSettlementReadiness([]).readyFamilies, []);
  assert.deepEqual(nbaPropSettlementReadiness([entry(1, "pts", "PENDING_FINAL"), entry(2, "reb", "NO_MEASUREMENT", { playerId: "2" })]).readyFamilies, []);
  assert.deepEqual(nbaPropSettlementReadiness([{ seq: 1, family: "pts", state: "GRADED" }]).readyFamilies, [], "an entry without the schema and key does not count");
});

test("a GRADED forward row makes its own family ready, per family, with counts", () => {
  const r = nbaPropSettlementReadiness([
    entry(1, "pts", "PENDING_FINAL"),
    entry(2, "pts", "GRADED"),                                   // supersedes seq 1 for the same key
    entry(3, "pra", "GRADED", { playerId: "7", eventId: "401909089" }),
    entry(4, "reb", "VOID_PENDING_REVIEW", { playerId: "8" }),
    entry(5, "minutes", "GRADED"),                               // not a bettable family: ignored
  ]);
  assert.deepEqual(r.readyFamilies, ["pra", "pts"]);
  assert.equal(r.families.pts.graded, 1);
  assert.deepEqual(r.families.pts.dates, ["2026-10-20"]);
  assert.equal(r.families.reb.graded, 0);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.readyFamilies));
});

test("the latest entry per key wins: a row that moved back under review stops counting", () => {
  const r = nbaPropSettlementReadiness([entry(1, "ast", "GRADED"), entry(2, "ast", "VOID_PENDING_REVIEW")]);
  assert.deepEqual(r.readyFamilies, []);
  const back = nbaPropSettlementReadiness([entry(1, "ast", "VOID_PENDING_REVIEW"), entry(2, "ast", "GRADED")]);
  assert.deepEqual(back.readyFamilies, ["ast"]);
});

test("the committed repo state today: the forward ledger has not been written yet, so every prop family is NOT ready", () => {
  const repo = path.resolve(process.cwd(), "..");
  const ledger = path.join(repo, "data/internal/research/nba/prop-grades/v0.1/ledger.jsonl");
  const r = committedNbaPropReadiness({ repoRoot: repo });
  if (!fs.existsSync(ledger)) assert.deepEqual(r.readyFamilies, [], "no ledger reads as not ready, never as ready");
  else assert.ok(Array.isArray(r.readyFamilies), "once the scheduled writer appends, readiness is read from it");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nba-ready-"));
  const dir = path.join(tmp, "data/internal/research/nba/prop-grades/v0.1");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "ledger.jsonl"), "{not json\n");
  assert.deepEqual(committedNbaPropReadiness({ repoRoot: tmp }).readyFamilies, [], "an unreadable ledger is not ready");
  fs.writeFileSync(path.join(dir, "ledger.jsonl"), `${JSON.stringify(entry(1, "threePm", "GRADED"))}\n`);
  assert.deepEqual(committedNbaPropReadiness({ repoRoot: tmp }).readyFamilies, ["threePm"]);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("SYNTHETIC_MEDIAN_LINE rows are never a price or a settled leg: readiness ignores their outcome and returns no line or price", () => {
  const withLine = (outcome) => ({ ...entry(1, "pts", "GRADED"), notAPrice: true, measurement: { actual: 19, syntheticMedianLine: { label: "SYNTHETIC_MEDIAN_LINE", line: 1.18, side: "OVER", outcome, notAPrice: true } } });
  const win = nbaPropSettlementReadiness([withLine("WIN")]);
  const loss = nbaPropSettlementReadiness([withLine("LOSS")]);
  assert.deepEqual(win, loss, "a synthetic-line WIN or LOSS changes nothing");
  assert.doesNotMatch(JSON.stringify(win), /line|price|odds|WIN|LOSS|SYNTHETIC/i, "readiness carries counts and dates only");
});

/* ── THE GATE: forward-graded evidence is NECESSARY; a founder-approved promotion record is SUFFICIENT ──────────── */
import { nbaPropSettlementGate } from "./prop-settlement-readiness.mjs";
import { committedNbaPropSettlementGate } from "./prop-settlement-source.mjs";
import { VERDICT } from "./champion-challenger.mjs";
import { NBA_PROP_SETTLEMENT_GATE_SCHEMA, openPropFamilies } from "../../parlays/nba-lab-grading.mjs";
import { execFileSync } from "node:child_process";

const FAMS = ["pts", "reb", "ast", "threePm", "pra", "ptsReb", "ptsAst"];
/** A fully satisfied synthetic ledger: every family GRADED on many forward rows (TEST FIXTURE). */
const FULL_LEDGER = nbaPropSettlementReadiness(FAMS.flatMap((f, i) => Array.from({ length: 600 }, (_, k) => entry(i * 1000 + k + 1, f, "GRADED", { playerId: String(k), eventId: String(401909000 + (k % 50)) }))));
const promotion = (over = {}) => ({
  seq: 1, kind: "PROMOTION", family: "v0.1", version: "nba-preseason-experimental-v0.1", market: "player_points",
  date: "2026-11-20", decidedAt: "2026-11-20T15:00:00Z", metrics: { pricedRows: { value: 600, n: 600 } },
  reason: "TEST FIXTURE — not a founder decision", approver: "Test Founder",
  evidence: { verdict: VERDICT.READY_FOR_FOUNDER_REVIEW, report: "data/internal/research/nba/reports/test.json", market: "player_points" }, ...over,
});
const doc = (records) => ({ schemaVersion: 1, artifact: "nba-promotion-record", records });

test("GATE: a fully satisfied ledger with NO promotion record stays closed for every family", () => {
  assert.deepEqual(FULL_LEDGER.readyFamilies, [...FAMS].sort(), "the synthetic ledger is complete");
  for (const pr of [null, doc([]), { records: "nope" }]) {
    const g = nbaPropSettlementGate({ readiness: FULL_LEDGER, promotionRecord: pr });
    assert.deepEqual(g.openFamilies, []);
    assert.match(g.families.pts.reason, /no founder-approved promotion/);
  }
});

test("GATE: a valid founder PROMOTION opens its own family only, and only with the ledger evidence", () => {
  const g = nbaPropSettlementGate({ readiness: FULL_LEDGER, promotionRecord: doc([promotion()]) });
  assert.deepEqual(g.openFamilies, ["pts"]);
  assert.equal(g.families.pts.promotionSeq, 1);
  assert.equal(g.schema, NBA_PROP_SETTLEMENT_GATE_SCHEMA);
  const noEvidence = nbaPropSettlementGate({ readiness: nbaPropSettlementReadiness([]), promotionRecord: doc([promotion()]) });
  assert.deepEqual(noEvidence.openFamilies, [], "a promotion without forward-graded evidence opens nothing");
  assert.match(noEvidence.families.pts.reason, /not graded forward/);
  assert.deepEqual(nbaPropSettlementGate({ readiness: FULL_LEDGER, promotionRecord: doc([promotion({ market: "pts", evidence: { ...promotion().evidence, market: "pts" } })]) }).openFamilies, ["pts"], "our family key is accepted too");
});

test("GATE: invalid, automated, rolled-back or wrong-family records open nothing", () => {
  const closed = (records) => assert.deepEqual(nbaPropSettlementGate({ readiness: FULL_LEDGER, promotionRecord: doc(records) }).openFamilies, [], JSON.stringify(records).slice(0, 120));
  closed([promotion({ approver: "github-actions[bot]" })]);
  closed([promotion({ approver: "claude" })]);
  closed([promotion({ approver: "" })]);
  closed([promotion({ evidence: { ...promotion().evidence, verdict: "HOLD" } })]);
  closed([promotion({ family: "v1", version: "nba-sim-v1-coherent" })]);
  closed([promotion({ seq: undefined })]);
  closed([promotion(), { seq: 2, kind: "ROLLBACK", rollsBack: 1, family: "v0.1", version: "nba-preseason-experimental-v0.1", market: "player_points", date: "2026-11-21", decidedAt: "2026-11-21T15:00:00Z", metrics: { x: { value: 1, n: 1 } }, reason: "TEST FIXTURE rollback text", approver: "Test Founder" }]);
  assert.deepEqual(nbaPropSettlementGate({ readiness: { ...FULL_LEDGER, version: "forged" }, promotionRecord: doc([promotion()]) }).openFamilies, [], "readiness must be the readiness function's own output");
});

test("GATE: only the gate function's stamped, frozen output opens a predicate; raw readiness or a hand-built object opens nothing", () => {
  assert.deepEqual(openPropFamilies(FULL_LEDGER), [], "raw readiness is not a gate");
  assert.deepEqual(openPropFamilies({ schema: NBA_PROP_SETTLEMENT_GATE_SCHEMA, openFamilies: ["pts"] }), [], "an unfrozen hand-built object is not a gate");
  const hits = execFileSync("git", ["grep", "-l", "NBA_PROP_SETTLEMENT_GATE_SCHEMA", "--", "src/**/*.mjs", "src/**/*.ts", "src/**/*.tsx", "scripts/**"], { encoding: "utf8" })
    .split("\n").filter((f) => f && !/\.test\.mjs$/.test(f)).sort();
  assert.deepEqual(hits, ["src/lib/parlays/nba-lab-grading.mjs", "src/lib/sports/nba/prop-settlement-readiness.mjs"], "the stamp has one producer and one definition");
});

test("GATE: the committed repo state is closed (the promotion record has no records)", () => {
  const g = committedNbaPropSettlementGate({ repoRoot: path.resolve(process.cwd(), "..") });
  assert.deepEqual(g.openFamilies, []);
});
