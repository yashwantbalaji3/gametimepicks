/**
 * NBA priced-line grading + its append-only ledger. Real 10-20 finals and box scores; TEST FIXTURE price records only
 * (labelled), plus invariant checks over whatever real pilot captures are committed (no slate-dependent counts).
 * Run: npx tsx --test src/lib/sports/nba/priced-prop-grading.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  PRICED_SCHEMA, appendPricedGrades, gradePricedRow, pricedLedgerAppendOnlyViolations, pricedLedgerLines, pricedRow, summarisePricedGrades,
} from "./priced-prop-grading.mjs";
import { nbaPropResult, readNbaFinalsRecords } from "./prop-settlement-source.mjs";
import { gradeNbaPlayerProp } from "./prop-settlement.mjs";
import { runPricedGrading } from "../../../../scripts/nba/grade-nba-priced-props.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const BOS_DET = "401909088"; // 10-20 real final, BOS 113 @ DET 121
const box = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/nba/experimental/boxscores/401909088.json"), "utf8"));
const fin = readNbaFinalsRecords({ repoRoot: REPO });
const resultFrom = (doc) => (eventId, athleteId) => nbaPropResult({ finalsRecord: fin, boxscore: doc, providerEventId: eventId, providerAthleteId: athleteId });
/** TEST FIXTURE price record (not a real offer) in the gtp.nba.prop-price@1 shape. */
const rec = (o) => ({ schema: "gtp.nba.prop-price@1", eventId: BOS_DET, family: "pts", book: "fixturebook", recordId: `npp_test_${o.providerAthleteId}_${o.line}`, overAmerican: -110, underAmerican: -110, capturedAt: "2026-10-20T22:00:00Z", fetchedAt: "2026-10-20T22:00:30Z", ...o });
const played = box.players.find((p) => !p.didNotPlay && Number.isInteger(p.minutes) && p.minutes > 0 && p.pts > 0);
const dnp = box.players.find((p) => p.didNotPlay);

test("both sides at the book's line, by the one grader: over/under are complements, and agree with gradeNbaPlayerProp", () => {
  for (const [line, over, under] of [[played.pts - 0.5, "WIN", "LOSS"], [played.pts + 0.5, "LOSS", "WIN"]]) {
    const row = pricedRow(rec({ providerAthleteId: played.providerAthleteId, line }));
    const g = gradePricedRow(row, resultFrom(box)(BOS_DET, row.playerId));
    assert.equal(g.state, "GRADED");
    assert.equal(g.measurement.actual, played.pts);
    assert.equal(g.measurement.over, over);
    assert.equal(g.measurement.under, under);
    assert.equal(g.measurement.over, gradeNbaPlayerProp({ family: "pts", side: "OVER", line, providerAthleteId: row.playerId, eventId: BOS_DET }, resultFrom(box)(BOS_DET, row.playerId)).outcome);
  }
  const push = gradePricedRow(pricedRow(rec({ providerAthleteId: played.providerAthleteId, line: played.pts })), resultFrom(box)(BOS_DET, String(played.providerAthleteId)));
  assert.deepEqual([push.measurement.over, push.measurement.under], ["PUSH", "PUSH"]);
});

test("holds as PR 1169: DNP is NO_MEASUREMENT (never a loss), no box score is PENDING_BOXSCORE, not final is PENDING_FINAL", () => {
  const d = gradePricedRow(pricedRow(rec({ providerAthleteId: dnp.providerAthleteId, line: 0.5 })), resultFrom(box)(BOS_DET, String(dnp.providerAthleteId)));
  assert.equal(d.state, "NO_MEASUREMENT");
  assert.equal(d.measurement.bookRuleUnknown, true);
  const nb = gradePricedRow(pricedRow(rec({ providerAthleteId: played.providerAthleteId, line: 10.5 })), resultFrom(null)(BOS_DET, String(played.providerAthleteId)));
  assert.equal(nb.state, "PENDING_BOXSCORE");
  const nf = gradePricedRow(pricedRow(rec({ eventId: "401999999", providerAthleteId: played.providerAthleteId, line: 10.5 })), resultFrom(null)("401999999", String(played.providerAthleteId)));
  assert.equal(nf.state, "PENDING_FINAL");
  assert.equal(pricedRow({ schema: "something-else" }), null);
  assert.equal(pricedRow(rec({ providerAthleteId: "1", line: 10.5, overAmerican: 1.91 })), null, "a non-American price is not a price record");
});

test("ledger lineage: pending → graded is PENDING_RESOLVED; a box-score correction is a CORRECTION; pending never returns; priced block is write-once", () => {
  const row = pricedRow(rec({ providerAthleteId: played.providerAthleteId, line: played.pts - 0.5 }));
  const item = (doc) => ({ ...row, ...gradePricedRow(row, resultFrom(doc)(BOS_DET, row.playerId)), date: "2026-10-20", inputs: { boxscoreHash: doc ? `h${doc === box ? 1 : 2}` : null, final: { ftHome: 121, ftAway: 113 } } });
  const a = appendPricedGrades([], [item(null)], { gradedAt: "2026-10-21T01:00:00Z" }).appended;
  assert.equal(a[0].lineageReason, "INITIAL");
  assert.equal(a[0].state, "PENDING_BOXSCORE");
  const b = appendPricedGrades(a, [item(box)], { gradedAt: "2026-10-21T14:00:00Z" }).appended;
  assert.equal(b[0].lineageReason, "PENDING_RESOLVED");
  assert.equal(b[0].supersedes, 1);
  assert.equal(appendPricedGrades([...a, ...b], [item(box)], { gradedAt: "x" }).appended.length, 0, "an identical re-grade appends nothing");
  assert.equal(appendPricedGrades([...a, ...b], [item(null)], { gradedAt: "x" }).appended.length, 0, "a recorded grade never goes back to pending");
  const corrected = { ...box, players: box.players.map((p) => (p === played ? { ...p, pts: p.pts - 1 } : p)) };
  const c = appendPricedGrades([...a, ...b], [item(corrected)], { gradedAt: "2026-10-22T14:00:00Z" }).appended;
  assert.equal(c[0].lineageReason, "CORRECTION");
  assert.equal(c[0].cause, "BOXSCORE_CORRECTION");
  assert.deepEqual([c[0].correction.oldActual, c[0].correction.newActual], [played.pts, played.pts - 1]);
  const moved = { ...item(box), priced: { ...row.priced, overAmerican: -120 } };
  assert.equal(appendPricedGrades([...a, ...b], [moved], { gradedAt: "x" }).pricedMismatches.length, 1, "a changed price for a recorded key is refused");
  const text = pricedLedgerLines([...a, ...b, ...c]);
  assert.deepEqual(pricedLedgerAppendOnlyViolations({ beforeText: pricedLedgerLines(a), afterText: text }), []);
  assert.ok(pricedLedgerAppendOnlyViolations({ beforeText: text, afterText: pricedLedgerLines(a) }).length > 0, "a shortened ledger is a violation");
  assert.ok([...a, ...b, ...c].every((e) => e.schema === PRICED_SCHEMA && e.notAPick === true && e.productEligible === false && e.dataClass === "PRIVATE_RESEARCH"));
  const s = summarisePricedGrades([...a, ...b, ...c]);
  assert.equal(s.pts.rows, 1);
});

test("writer over the committed pilot captures (invariants only): a scratch run, then a re-run that appends nothing", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nba-priced-"));
  const repoLedger = path.join(REPO, "data/internal/research/nba/priced-props/ledger.jsonl");
  const repoBefore = fs.existsSync(repoLedger) ? fs.readFileSync(repoLedger, "utf8") : null;
  try {
    const first = runPricedGrading({ repoRoot: REPO, now: "2026-10-22T03:00:00Z", write: true, outDir: tmp });
    const ledger = path.join(tmp, "priced-props", "ledger.jsonl");
    if (first.appended === 0) { assert.equal(fs.existsSync(ledger), false); return; }
    const text = fs.readFileSync(ledger, "utf8");
    assert.deepEqual(pricedLedgerAppendOnlyViolations({ beforeText: "", afterText: text }), []);
    const second = runPricedGrading({ repoRoot: REPO, now: "2026-10-22T03:05:00Z", write: true, outDir: tmp });
    assert.equal(second.appended, 0, "re-running on unchanged inputs appends nothing");
    assert.equal(fs.readFileSync(ledger, "utf8"), text, "the scratch ledger is byte-identical");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    const repoAfter = fs.existsSync(repoLedger) ? fs.readFileSync(repoLedger, "utf8") : null;
    assert.equal(repoAfter, repoBefore, "a scratch (--out-dir) run never touches the repo ledger");
  }
});

test("ONE PRICED-LEDGER WRITER: only scripts/nba/grade-nba-priced-props.mjs writes it, and it is offline", () => {
  const WRITES = /writeFileSync|appendFileSync|createWriteStream|renameSync|copyFileSync|\.writeFile\(|\.appendFile\(/;
  const NAMES = /PRICED_DIR|PRICED_LEDGER_FILE|pricedLedgerPath|priced-props\//;
  const writers = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
      const f = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(f); continue; }
      if (!/\.(m?js|ts|tsx)$/.test(ent.name) || /\.test\.|\.spec\./.test(ent.name)) continue;
      const src = fs.readFileSync(f, "utf8");
      if (NAMES.test(src) && WRITES.test(src)) writers.push(path.relative(APP, f));
    }
  };
  walk(path.join(APP, "scripts"));
  walk(path.join(APP, "src"));
  assert.deepEqual(writers, [path.join("scripts", "nba", "grade-nba-priced-props.mjs")]);
  const script = fs.readFileSync(path.join(APP, "scripts/nba/grade-nba-priced-props.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.ok(!/\bfetch\(|https?:\/\/|ODDS_API_KEY|apiKey/.test(script), "reads committed files only: no network, no key");
  assert.match(script, /appendFileSync/);
  assert.match(script, /flag: "wx"/);
});
