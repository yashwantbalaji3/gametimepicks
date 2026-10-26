/**
 * Top Board grades × box-score STAT CORRECTIONS (release owner 2026-10-25, after POR @ SAC 401909852: Avdija's rebounds
 * corrected 6 → 7 after the grade). The Top Board grader reads the same canonical box score as the forecast grader and
 * the public board — the newest BOXSCORE_CORRECTION logged in any family's ledger, else the first capture — and a row
 * whose grade that changes is APPENDED as a CORRECTION superseding the earlier entry. Nothing is rewritten.
 * Run (from app/): npx tsx --test src/lib/sports/nba/top-board-correction.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { boxscoreLocator, correctionLedgers } from "../../../../scripts/nba/grade-nba-top-boards.mjs";
import { appendGrades, boardRows, gradeBoardRow, latestByRow, ledgerAppendOnlyViolations } from "./top-board-grading.mjs";
import { latestCorrectionAcross } from "./experimental-grading-ledger.mjs";
import { boxscore } from "./__fixtures__/top-board-fixtures.mjs";

const APP = process.cwd(), REPO = path.resolve(APP, "..");
const NBA = path.join(REPO, "data/internal/research/nba");

/** A temporary NBA research dir: a first capture, a stored correction and the family ledger that logs it. */
function fixtureDir({ corrected = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tb-corr-"));
  const box = (reb) => boxscore("777", [{ id: "p1", minutes: 38, pts: 26, reb, ast: 6 }, { id: "p2", minutes: 30, pts: 10, reb: 4, ast: 2 }]);
  fs.mkdirSync(path.join(dir, "boxscores"), { recursive: true });
  fs.writeFileSync(path.join(dir, "boxscores", "777.json"), JSON.stringify({ ...box(6), capturedAt: "2026-10-24T13:16:03Z" }));
  const ledgers = [];
  if (corrected) {
    fs.mkdirSync(path.join(dir, "experimental/boxscores/corrections"), { recursive: true });
    fs.writeFileSync(path.join(dir, "experimental/boxscores/corrections/777.abc.json"), JSON.stringify({ ...box(7), capturedAt: "2026-10-25T13:41:38Z" }));
    ledgers.push({ boxscoreCorrections: [{ providerEventId: "777", detectedAt: "2026-10-25T13:41:38Z", new: { file: "experimental/boxscores/corrections/777.abc.json" } }] });
  }
  return { dir, ledgers };
}
const row = (stat, pid, p50 = 30) => ({ rowId: `2026-10-23|v0.1|e2|${stat}|777|${pid}`, category: stat, stat, eventId: "777", player: { providerAthleteId: pid }, p50, mean: p50, p10: p50 - 8, p90: p50 + 8, expectedMinutes: 36, marketLine: null });

test("the locator: the newest logged correction wins over the first capture; no correction → the first capture", () => {
  const { dir, ledgers } = fixtureDir();
  const find = boxscoreLocator([], { ledgers, nbaDir: dir });
  assert.equal(find("777")?.source, "experimental-correction");
  assert.equal(find("777").doc.players.find((p) => p.providerAthleteId === "p1").reb, 7);
  assert.equal(find("777").file, path.relative(REPO, path.join(dir, "experimental/boxscores/corrections/777.abc.json")));
  // a newer correction in ANOTHER family's ledger wins (one canonical box score across families)
  assert.equal(latestCorrectionAcross([...ledgers, { boxscoreCorrections: [{ providerEventId: "777", detectedAt: "2026-10-26T00:00:00Z", new: { file: "x" } }] }], "777").new.file, "x");
  const plain = fixtureDir({ corrected: false });
  const first = boxscoreLocator([path.join(plain.dir, "boxscores")], { ledgers: [], nbaDir: plain.dir })("777");
  assert.equal(first.source, "extra");
  assert.equal(first.doc.players.find((p) => p.providerAthleteId === "p1").reb, 6);
});

test("a correction appends CORRECTION entries superseding EXACTLY the rows whose grade it changes; a re-run appends nothing", () => {
  const plain = fixtureDir({ corrected: false }), { dir, ledgers } = fixtureDir();
  const rows = [row("pra", "p1", 36), row("ptsReb", "p1", 30), row("points", "p1", 25), row("assists", "p1", 6), row("pra", "p2", 16)];
  const grade = (find) => rows.map((r) => ({ ...gradeBoardRow(r, { boxscore: find(r.eventId)?.doc ?? null }), date: "2026-10-23", edition: 2 }));
  const firstFind = boxscoreLocator([path.join(plain.dir, "boxscores")], { ledgers: [], nbaDir: plain.dir });
  const { ledger: before } = appendGrades(null, grade(firstFind), { gradedAt: "2026-10-24T13:16:03Z" });
  assert.equal(before.entries.length, 5);
  const corrFind = boxscoreLocator([path.join(dir, "boxscores")], { ledgers, nbaDir: dir });
  const sources = (g) => ({ boxscore: corrFind(g.eventId).source, file: corrFind(g.eventId).file, capturedAt: corrFind(g.eventId).doc.capturedAt });
  const { ledger: after, appended } = appendGrades(before, grade(corrFind), { gradedAt: "2026-10-26T13:16:00Z", sourceOf: sources });
  assert.deepEqual(appended.map((e) => [e.rowId.split("|")[3], e.providerAthleteId, e.lineageReason, e.accuracy.actual]), [["pra", "p1", "CORRECTION", 39], ["ptsReb", "p1", "CORRECTION", 33]]);
  for (const e of appended) {
    assert.equal(e.supersedes, before.entries.find((b) => b.rowId === e.rowId).seq);
    assert.equal(e.source.boxscore, "experimental-correction");
    assert.equal(e.source.capturedAt, "2026-10-25T13:41:38Z");
  }
  assert.deepEqual(ledgerAppendOnlyViolations({ before, after }), [], "the earlier entries are an unchanged prefix");
  assert.equal(appendGrades(after, grade(corrFind), { gradedAt: "2026-10-26T14:00:00Z", sourceOf: sources }).appended.length, 0, "idempotent");
});

test("COMMITTED ledger: every graded row's latest entry equals its grade on the canonical box score, or a correction logged after that entry explains the difference", () => {
  const ledgerFile = path.join(NBA, "top-boards/v0.1/ledger.json");
  if (!fs.existsSync(ledgerFile)) return;
  const ledger = JSON.parse(fs.readFileSync(ledgerFile, "utf8"));
  const latest = latestByRow(ledger);
  const ledgers = correctionLedgers(NBA);
  const find = boxscoreLocator([], { ledgers, nbaDir: NBA });
  const dir = path.join(NBA, "top-boards/v0.1");
  let checked = 0;
  const pendingCorrections = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    for (const r of boardRows(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))) {
      const e = latest.get(r.rowId);
      if (!e || e.projectionStatus !== "GRADED") continue;
      const g = gradeBoardRow(r, { boxscore: find(r.eventId)?.doc ?? null });
      checked += 1;
      if (g.accuracy?.actual === e.accuracy?.actual) continue;
      const c = latestCorrectionAcross(ledgers, r.eventId);
      assert.ok(c && Date.parse(c.detectedAt) > Date.parse(e.gradedAt), `${r.rowId}: ledger ${e.accuracy?.actual} vs canonical ${g.accuracy?.actual} with no later correction to explain it`);
      pendingCorrections.push(r.rowId);
    }
  }
  assert.ok(checked > 0);
  // the nightly grader appends these as CORRECTION entries; until it runs they are the only differences (2026-10-26)
  for (const id of pendingCorrections) assert.ok(["2026-10-23|v0.1|e2|pra|401909852|4683021", "2026-10-23|v0.1|e2|ptsReb|401909852|4683021"].includes(id), id);
});
