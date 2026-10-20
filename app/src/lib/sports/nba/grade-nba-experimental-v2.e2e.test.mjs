/**
 * END-TO-END: the real grader script (grade-nba-experimental-forecasts.mjs) on COMMITTED, frozen preseason data
 * (v0.1, slate 2026-10-16), writing ONLY to a temp --out-dir, with an offline-replayed stat correction
 * (SYNTHETIC: one player's points are changed in a payload rebuilt from the committed box score).
 *
 *   run 1 (no fetch)            → schema-2 ledger, every graded game INITIAL, legacy entries content-identical
 *   run 2 (--fetch, replay)     → BOXSCORE_CORRECTION logged with old/new hashes; the corrected payload is stored
 *                                 beside the original (original file untouched); the game appends a CORRECTION that
 *                                 supersedes its INITIAL entry
 *   run 3 (same instant)        → appends nothing (re-check interval; identical grades)
 * The repository's own ledger is never written.
 *
 * Run (from app/): npx tsx --test src/lib/sports/nba/grade-nba-experimental-v2.e2e.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { parseSummary } from "./boxscore-parse.mjs";
import { experimentalLedgerAppendOnlyViolations, boxscoreContentHash, LINEAGE, CORRECTION_CAUSE } from "./experimental-grading-ledger.mjs";
import { summaryFromDoc, FIXTURE_NOTE } from "./__fixtures__/nba-grading-fixtures.mjs";

const APP = process.cwd();
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const DATE = "2026-10-16", FAM_DIR = "experimental-v0.1";
const LEDGER = path.join(NBA, FAM_DIR, "ledger.json");
const run = (args) => execFileSync(process.execPath, ["scripts/nba/grade-nba-experimental-forecasts.mjs", "--family", "v0.1", "--date", DATE, ...args], { cwd: APP, encoding: "utf8" });

test("e2e: INITIAL → replayed stat correction → CORRECTION lineage; originals untouched; repo ledger untouched", { skip: !fs.existsSync(path.join(NBA, FAM_DIR, "forecasts", `${DATE}.json`)) }, () => {
  const repoLedgerBefore = fs.readFileSync(LEDGER, "utf8");
  const forecast = JSON.parse(fs.readFileSync(path.join(NBA, FAM_DIR, "forecasts", `${DATE}.json`), "utf8"));
  const id = String(forecast.games[0].providerEventId);
  const origFile = path.join(NBA, "experimental", "boxscores", `${id}.json`);
  const origText = fs.readFileSync(origFile, "utf8");
  const orig = JSON.parse(origText);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nba-grader-v2-"));
  try {
    const out = path.join(tmp, "out"), sums = path.join(tmp, "summaries");
    fs.mkdirSync(sums, { recursive: true });
    // SYNTHETIC correction: +2 points to the first predicted home player who played.
    const predIds = new Set(forecast.games[0].forecast.players.home.map((p) => p.providerAthleteId));
    const target = orig.players.find((p) => predIds.has(p.providerAthleteId) && Number.isInteger(p.pts));
    const corrected = { ...orig, players: orig.players.map((p) => (p === target ? { ...p, pts: p.pts + 2 } : p)) };
    const payload = summaryFromDoc(corrected, { period: 4 });
    assert.equal(payload.fixture, FIXTURE_NOTE);
    // The replayed payload must parse back to exactly the corrected facts (otherwise the test proves nothing).
    assert.equal(boxscoreContentHash(parseSummary(payload, { providerEventId: id, capturedAt: "x" }).doc), boxscoreContentHash(corrected));
    fs.writeFileSync(path.join(sums, `${id}.json`), JSON.stringify(payload));

    const o1 = run(["--now", "2026-10-18T10:00:00Z", "--write", "--out-dir", out]);
    assert.match(o1, /appended \d+ grade entries \{"INITIAL":\d+\}/);
    const l1 = JSON.parse(fs.readFileSync(path.join(out, FAM_DIR, "ledger.json"), "utf8"));
    const before = JSON.parse(repoLedgerBefore);
    assert.equal(l1.schemaVersion, 2);
    assert.deepEqual(l1.entries, before.entries, "legacy schema-1 entries kept content-identical");
    const initial = l1.gradeEntries.find((e) => e.providerEventId === id);
    assert.equal(initial.lineageReason, LINEAGE.INITIAL);
    assert.equal(typeof initial.grade.overtime.actual, "boolean", "OT is derived for a 2026-27 game");
    assert.equal(initial.inputs.finalSource, "finals-record:2026-27");

    const o2 = run(["--now", "2026-10-18T12:00:00Z", "--fetch", "--write", "--out-dir", out, "--summary-dir", sums]);
    assert.match(o2, new RegExp(`${id}: BOX SCORE CORRECTION`));
    const l2 = JSON.parse(fs.readFileSync(path.join(out, FAM_DIR, "ledger.json"), "utf8"));
    assert.deepEqual(experimentalLedgerAppendOnlyViolations({ before: l1, after: l2 }), []);
    const corr = l2.boxscoreCorrections.find((c) => c.providerEventId === id);
    assert.equal(corr.old.hash, boxscoreContentHash(orig));
    assert.equal(corr.new.hash, boxscoreContentHash(corrected));
    assert.deepEqual(corr.changes.map((c) => [c.providerAthleteId, c.fields]), [[target.providerAthleteId, [{ field: "pts", old: target.pts, new: target.pts + 2 }]]]);
    assert.ok(fs.existsSync(path.join(out, corr.new.file)), "the corrected payload is stored beside the original");
    const last = l2.gradeEntries.filter((e) => e.providerEventId === id).at(-1);
    assert.deepEqual([last.lineageReason, last.supersedes, last.cause], [LINEAGE.CORRECTION, initial.seq, CORRECTION_CAUSE.BOXSCORE_CORRECTION]);
    assert.deepEqual(last.correction, { oldBoxscoreHash: corr.old.hash, newBoxscoreHash: corr.new.hash });
    // Games whose replay has no payload log CHECK_FAILED and keep their grade; none of them is re-graded.
    assert.equal(l2.gradeEntries.filter((e) => e.lineageReason !== LINEAGE.INITIAL).length, 1);

    const o3 = run(["--now", "2026-10-18T12:00:00Z", "--fetch", "--write", "--out-dir", out, "--summary-dir", sums]);
    assert.match(o3, /appended 0 grade entries/);
    assert.equal(fs.readFileSync(origFile, "utf8"), origText, "the original box-score file is never rewritten");
    assert.equal(fs.readFileSync(LEDGER, "utf8"), repoLedgerBefore, "the repository's ledger is never written by --out-dir runs");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("e2e: --summary-dir without --out-dir is refused (a replay never writes the repo)", () => {
  assert.throws(() => run(["--summary-dir", "/nonexistent", "--now", "2026-10-18T12:00:00Z"]), /Command failed/);
});
