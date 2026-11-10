/**
 * NFL QB props · grade mode wiring (qb-props-inputs.mjs, scripts/nfl/grade-qb-props.mjs); R5 through nflOfficialOfRecord.
 * SYNTHETIC ROOT ONLY: a temporary directory with made-up receipts, box scores, finals and forecasts. No committed final
 * is read and no real outcome is graded (founder ruling 2026-11-10).
 * Run (from app/): npx tsx --test src/lib/sports/nfl/qb-props-inputs.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { LEDGER_REL, loadGradeInputs, r5FromRecord, runGrade } from "./qb-props-inputs.mjs";
import { APPROVED_PREREG_SHA256, PREREG_APPROVED_AT } from "./qb-props-grade.mjs";

const SHA = "synthetic-prereg";
const put = (root, rel, obj) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj)); };
const q = (v) => ({ p10: v, p50: v, p90: v });
const qbRow = (id, team) => ({ playerId: `nfl-athlete-${id}`, name: `QB${id}`, team, stats: { passAtt: q(30), cmp: q(20), passYds: q(240), passTd: q(1), int: q(0) }, exactCounts: { passYds: { 230: 5, 250: 5 }, cmp: { 20: 10 }, passAtt: { 30: 10 }, passTd: { 1: 10 }, int: { 0: 10 } } });
const box = (id, team, passYds) => ({ playerId: `nfl-athlete-${id}`, name: `QB${id}`, teamAbbr: team, passAtt: 30, passCmp: 20, passYds, passTd: 1, passInt: 0 });

const fc = (id, state) => ({ providerEventId: id, generatedAt: "2026-11-16T11:00:00Z", teamInputs: state ? { state } : undefined });

function synthRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qbp-synth-"));
  const g = (id, week, date) => ({ providerEventId: id, season: 2026, week, dateUtc: date, home: { abbr: "AAA" }, away: { abbr: "BBB" }, players: [box(1, "AAA", 240), box(2, "BBB", 250)] });
  put(root, "data/internal/research/nfl/player-events-v1/2026.json", { contentHash: "synthetic", games: [g("11", 11, "2026-11-16T18:00Z"), g("12", 12, "2026-11-23T18:00Z")] });
  put(root, "data/internal/research/nfl/sim-v2/shadow/2026-11-16/11-a.json", { eventId: "11", generatedAt: "2026-11-16T12:00:00Z", eventStart: "2026-11-16T18:00Z", artifactHash: "h11", playerStatDistributions: [qbRow(1, "AAA"), qbRow(2, "BBB")] });
  put(root, "data/internal/research/nfl/sim-v2/shadow/2026-11-23/12-a.json", { eventId: "12", generatedAt: "2026-11-23T12:00:00Z", eventStart: "2026-11-23T18:00Z", artifactHash: "h12", playerStatDistributions: [qbRow(1, "AAA"), qbRow(2, "BBB")] });
  put(root, "data/internal/nfl/official-stats/11.json", { state: "FINAL", players: { a: { team: "AAA", passYds: 240 }, b: { team: "BBB", passYds: 250 } } });
  put(root, "data/internal/nfl/official-stats/12.json", { state: "IN_PROGRESS", players: {} });
  // the official forecasts of record (public union): game 11 knows its QB situation, game 12 has no forecast
  put(root, "app/public/data/nfl/forecasts/latest.json", { forecasts: [fc("11", "NO_STARTING_QB_ABSENCE")] });
  return root;
}

test("refusal comes first: without an approved AND timestamped hash, no final, box score or receipt is read", () => {
  assert.equal(APPROVED_PREREG_SHA256.length, 1, "v1.3 only");
  assert.ok(!APPROVED_PREREG_SHA256.includes(SHA));
  const root = synthRoot();
  const reads = [];
  const orig = fs.readFileSync;
  fs.readFileSync = (p, ...a) => { reads.push(String(p)); return orig(p, ...a); };
  try {
    assert.deepEqual(runGrade({ root, preregSha256: SHA }), { refused: "no approved pre-registration" });
    assert.deepEqual(runGrade({ root, preregSha256: SHA, approvals: [SHA], approvedAt: {} }), { refused: "the approved pre-registration has no approval timestamp" });
  } finally { fs.readFileSync = orig; }
  assert.deepEqual(reads, [], "nothing was read before the gate");
  assert.ok(!fs.existsSync(path.join(root, LEDGER_REL)));
});

test("approved (synthetic): reads every input, applies R5 from the forecast of record, excludes non-finals, writes a ledger", () => {
  const root = synthRoot();
  const inp = loadGradeInputs(root);
  assert.equal(inp.entries.length, 2);
  assert.equal(inp.verified.size, 1, "only FINAL games are verified");
  assert.deepEqual(inp.inputs.r5, { source: "nflOfficialOfRecord", events: 2, withTeamInputs: 1 });
  assert.equal(inp.eligibilityAt, null, "eligibility@1 is not on this branch");
  const r = runGrade({ root, preregSha256: SHA, approvals: [SHA], approvedAt: { [SHA]: "2026-11-10T20:00:00Z" }, write: true });
  assert.equal(r.wrote, LEDGER_REL);
  const led = JSON.parse(fs.readFileSync(path.join(root, LEDGER_REL), "utf8"));
  assert.equal(led.counts.qbGames, 2, "game 11, both teams");
  assert.equal(led.counts.notFinal, 1, "game 12 is not final");
  assert.equal(led.counts.confirmatoryQbGames, 0, "eligibility PENDING ⇒ nothing confirmatory, whatever R5 says");
  assert.deepEqual(led.rows.map((x) => [x.team, x.r5, x.eligibility]), [["AAA", true, "PENDING_ELIGIBILITY_CONTRACT"], ["BBB", true, "PENDING_ELIGIBILITY_CONTRACT"]]);
  assert.equal(led.inputs.preregSha256, SHA);
  assert.equal(led.inputs.approvedAt, "2026-11-10T20:00:00Z");
  for (const f of ["passYds", "passCmp", "passAtt", "passTd", "passInt"]) assert.equal(led.confirmatory[f].outcome, "INCONCLUSIVE");
});

test("R5 from nflOfficialOfRecord: QB-blind, UNKNOWN, no team inputs or no record ⇒ not allowed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qbp-r5-"));
  put(root, "app/public/data/nfl/forecasts/latest.json", { forecasts: [fc("1", "NO_STARTING_QB_ABSENCE"), fc("2", "BLIND_TO_STARTING_QB_ABSENCE"), fc("3", "UNKNOWN"), fc("4", null)] });
  const { r5At, states } = r5FromRecord(root);
  assert.deepEqual(["1", "2", "3", "4", "5"].map((eventId) => r5At({ eventId })), [true, false, false, false, false]);
  assert.equal(states.get("5"), null, "no forecast of record");
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/sports/nfl/qb-props-inputs.mjs"), "utf8");
  assert.match(src, /import \{ nflOfficialOfRecord \} from "\.\/official-of-record\.mjs"/, "the one selector, no second one");
  assert.doesNotMatch(src, /unionFrozenForecasts|frozen-latest\.json"\)/, "no forecast-file reading of its own");
});

test("approved constants (v1.3) on a synthetic root: the gate passes with the frozen defaults and the window opens at 18:55:07Z", () => {
  const root = synthRoot();
  const sha = APPROVED_PREREG_SHA256[0];
  const r = runGrade({ root, preregSha256: sha });
  assert.equal(r.refused, undefined);
  assert.equal(r.ledger.inputs.approvedAt, PREREG_APPROVED_AT[sha]);
  assert.equal(r.ledger.inputs.approvedAt, "2026-11-10T18:55:07Z");
  assert.equal(r.ledger.counts.qbGames, 2);
  assert.equal(r.ledger.counts.confirmatoryQbGames, 0, "eligibility PENDING on this synthetic root ⇒ nothing confirmatory");
  assert.ok(!fs.existsSync(path.join(root, LEDGER_REL)), "no write without --write");
});

test("the script: --grade refuses with exit 2 under the frozen constants; counts mode never loads the grade-mode inputs module", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qbp-prereg-"));
  const file = path.join(dir, "prereg.md");
  fs.writeFileSync(file, "synthetic pre-registration\n");
  const r = spawnSync(process.execPath, ["scripts/nfl/grade-qb-props.mjs", "--grade", "--prereg", file], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /^REFUSED: no approved pre-registration/);
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/grade-qb-props.mjs"), "utf8");
  assert.doesNotMatch(src, /^import [^\n]*qb-props-inputs/m, "grade-mode inputs are imported only inside the --grade branch");
  assert.match(src, /if \(process\.argv\.includes\("--grade"\)\) \{[\s\S]*?gradeRefusal\(sha\)[\s\S]*?await import\("\.\.\/\.\.\/src\/lib\/sports\/nfl\/qb-props-inputs\.mjs"\)/, "the gate is checked before the inputs module loads");
});

test("history file: per receipt of record, each projected QB's previous games before that kickoff only; the page reads one event", async () => {
  const { buildQbHistoryFile, readQbHistoryFor, HISTORY_REL } = await import("./qb-props-history-file.mjs");
  const root = synthRoot();
  const inp = loadGradeInputs(root);
  const doc = buildQbHistoryFile(inp.entries, inp.games);
  assert.deepEqual(Object.keys(doc.events), ["11", "12"]);
  assert.deepEqual(doc.events["11"]["nfl-athlete-1"], [], "nothing precedes game 11; the game itself is never history");
  assert.deepEqual(doc.events["12"]["nfl-athlete-1"].map((h) => [h.week, h.passYds, h.opponent]), [[11, 240, "BBB"]]);
  put(root, HISTORY_REL, doc);
  assert.deepEqual(readQbHistoryFor(root, "12"), doc.events["12"]);
  assert.deepEqual(readQbHistoryFor(root, "999"), {});
  assert.deepEqual(readQbHistoryFor("/nonexistent", "12"), {}, "unreadable ⇒ no history, never an error");
});
