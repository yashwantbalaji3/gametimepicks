/**
 * Level A forward grader (release owner 2026-10-23): pending is never a loss, VOID is never a loss, the record is
 * never rewritten. Run: npx tsx --test src/lib/products/level-a/level-a-grade.test.mjs
 * Entries and finals marked FIXTURE are test inputs; the REAL-DATA test grades committed finals.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { cardResult, gradeLevelALeg, gradeRecord, gradeViolations } from "./grade.mjs";
import { committedFinals, runGrade } from "../../../../scripts/products/grade-level-a-suggestions.mjs";

const REPO = path.resolve(process.cwd(), "..");
/** FIXTURE leg / entry. */
const leg = (sport, eventId, code) => ({ sport, eventId, selection: { code, label: code }, market: sport === "epl" || sport === "ligue-1" ? "1x2" : "winner", startUtc: "2026-10-23T19:00:00Z" });
const entry = (id, legs, o = {}) => ({ schema: "gtp.level-a.suggestion@1", id, productDay: "2026-10-23", policy: "parlay-lab-suggest@1", tier: "high", legs, jointProbability: 0.2, ...o });
/** FIXTURE finals. */
const FINALS = {
  mlb: (l) => ({ m1: { homeRuns: 5, awayRuns: 2, isFinal: true }, m2: { homeRuns: 1, awayRuns: 1, isFinal: false } })[l.eventId] ?? null,
  soccer: (sport, id) => ({ s1: { status: "FULL_TIME", homeGoalsFT: 2, awayGoalsFT: 2 }, s2: { status: "FULL_TIME", homeGoalsFT: null, awayGoalsFT: null } })[id] ?? null,
  nba: () => null,
};

test("LEGS: each sport's existing rule grades; anything not final is pending", () => {
  assert.equal(gradeLevelALeg(leg("mlb", "m1", "home"), FINALS).result, "win");
  assert.equal(gradeLevelALeg(leg("mlb", "m1", "away"), FINALS).result, "loss");
  assert.equal(gradeLevelALeg(leg("mlb", "m2", "home"), FINALS).result, "pending", "not final");
  assert.equal(gradeLevelALeg(leg("mlb", "nope", "home"), FINALS).result, "pending", "no linescore");
  assert.equal(gradeLevelALeg(leg("epl", "s1", "draw"), FINALS).result, "win");
  assert.equal(gradeLevelALeg(leg("ligue-1", "s1", "home"), FINALS).result, "loss");
  assert.equal(gradeLevelALeg(leg("epl", "s2", "home"), FINALS).result, "pending", "a final without integer goals is quarantined");
  assert.equal(gradeLevelALeg(leg("nba", "401900000", "home"), FINALS).result, "pending", "no NBA final");
  assert.equal(gradeLevelALeg(leg("ufc", "x", "home"), FINALS).result, "pending", "no Level A grader");
  assert.equal(gradeLevelALeg({ sport: "mlb", eventId: "m1", selection: null }, FINALS).result, "pending");
  assert.equal(gradeLevelALeg(leg("mlb", "m1", "home"), { mlb: () => { throw new Error("io"); } }).result, "pending", "a reader failure is pending, never a loss");
});

test("CARDS: a lost leg loses; otherwise pending waits; VOID is never a loss and never a win", () => {
  assert.equal(cardResult([{ result: "win" }, { result: "loss" }, { result: "pending" }]), "loss");
  assert.equal(cardResult([{ result: "win" }, { result: "pending" }]), "pending");
  assert.equal(cardResult([{ result: "win" }, { result: "void" }]), "void");
  assert.equal(cardResult([{ result: "void" }, { result: "loss" }]), "loss");
  assert.equal(cardResult([{ result: "win" }, { result: "win" }]), "win");
  assert.equal(cardResult([]), "pending");
});

test("RECORD: grades are written once per FINAL entry; pending waits; a later disagreement is a conflict, never a rewrite", () => {
  const record = [
    entry("e-win", [leg("mlb", "m1", "home"), leg("epl", "s1", "draw")]),
    entry("e-loss", [leg("mlb", "m1", "away"), leg("mlb", "m2", "home")]),
    entry("e-pend", [leg("mlb", "m1", "home"), leg("mlb", "m2", "home")]),
  ];
  const first = gradeRecord({ record, finals: FINALS, gradedAt: "2026-10-24T09:00:00.000Z" });
  assert.deepEqual(first.rows.map((r) => [r.entryId, r.result]), [["e-win", "win"], ["e-loss", "loss"]]);
  assert.equal(first.pending, 1);
  for (const r of first.rows) assert.deepEqual([r.priced, r.payout], [false, null]);
  const again = gradeRecord({ record, graded: first.rows, finals: FINALS, gradedAt: "2026-10-25T09:00:00.000Z" });
  assert.equal(again.rows.length, 0, "already graded entries are not graded again");
  const flipped = { ...FINALS, mlb: (l) => (l.eventId === "m1" ? { homeRuns: 1, awayRuns: 5, isFinal: true } : FINALS.mlb(l)) };
  const later = gradeRecord({ record, graded: first.rows, finals: flipped, gradedAt: "2026-10-25T09:00:00.000Z" });
  assert.deepEqual(later.rows.map((r) => [r.entryId, r.result]), [["e-pend", "loss"]], "only the entry graded for the first time is written");
  assert.deepEqual(later.conflicts.map((c) => [c.entryId, c.recorded, c.now]), [["e-win", "win", "loss"]], "e-loss now reads pending (its other leg is not final): pending is never a conflict");
  const text = first.rows.map((r) => `${JSON.stringify(r)}\n`).join("");
  assert.deepEqual(gradeViolations({ beforeText: "", afterText: text, recordIds: new Set(record.map((e) => e.id)) }), []);
  assert.ok(gradeViolations({ beforeText: text, afterText: text.replace('"result":"win"', '"result":"loss"') }).length > 0, "rewriting a grade breaks the prefix");
  assert.ok(gradeViolations({ beforeText: "", afterText: text.replace('"result":"win"', '"result":"pending"') }).length > 0, "a pending grade is never written");
  assert.ok(gradeViolations({ beforeText: "", afterText: text, recordIds: new Set(["other"]) }).length > 0, "a grade for an entry not in the record");
});

test("SCRIPT: offline, reads the record without writing it, appends grades once", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "levela-grade-"));
  const recordFile = path.join(dir, "suggestions.jsonl"), gradesFile = path.join(dir, "graded.jsonl");
  const recordText = [entry("e-win", [leg("mlb", "m1", "home")]), entry("e-pend", [leg("mlb", "m2", "home")])].map((e) => `${JSON.stringify(e)}\n`).join("");
  fs.writeFileSync(recordFile, recordText);
  const r1 = runGrade({ now: "2026-10-24T09:00:00Z", write: true, recordFile, gradesFile, finals: FINALS });
  assert.deepEqual([r1.added, r1.pending], [1, 1]);
  assert.equal(runGrade({ now: "2026-10-24T10:00:00Z", write: true, recordFile, gradesFile, finals: FINALS }).added, 0);
  assert.equal(fs.readFileSync(recordFile, "utf8"), recordText, "the record is never written by the grader");
  const src = fs.readFileSync(path.resolve(process.cwd(), "scripts/products/grade-level-a-suggestions.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(src, /\bfetch\(|https?:\/\/|ODDS_API_KEY|writeFileSync\(recordFile|appendFileSync\(recordFile/);
});

test("REAL DATA: committed finals grade exactly one side of a finished game as the win (MLB, Ligue 1, NBA)", () => {
  const finals = committedFinals({ repoRoot: REPO, nowIso: "2026-10-23T12:00:00Z" });
  const both = (l) => ["home", "away"].map((code) => gradeLevelALeg({ ...l, selection: { code, label: code } }, finals).result).sort();
  assert.deepEqual(both({ sport: "mlb", eventId: "849815", productDay: "2026-10-19" }), ["loss", "win"], "TB 7-3 CLE, 2026-10-19 linescore");
  assert.equal(gradeLevelALeg({ sport: "mlb", eventId: "849815", productDay: "2026-10-19", selection: { code: "home" } }, finals).result, "win");
  assert.equal(gradeLevelALeg({ sport: "ligue-1", eventId: "soccer:ligue-1:401876459", selection: { code: "home" } }, finals).result, "win", "Rennes 1-0 Marseille");
  assert.equal(gradeLevelALeg({ sport: "ligue-1", eventId: "soccer:ligue-1:401876459", selection: { code: "draw" } }, finals).result, "loss");
  assert.deepEqual(both({ sport: "nba", eventId: "401909088" }), ["loss", "win"], "BOS @ DET, 2026-10-20 final");
});

test("SCHEDULE: nightly-settle grades after the MLB linescores, isolated from every other step, inside its existing commit", () => {
  const wf = fs.readFileSync(path.resolve(process.cwd(), "../.github/workflows/nightly-settle.yml"), "utf8");
  const steps = wf.split(/\n(?=      - name: )/);
  const i = steps.findIndex((s) => s.startsWith("      - name: Grade Level A suggestions forward (isolated)"));
  const paper = steps.findIndex((s) => s.startsWith("      - name: Settle paper product cards (internal ledgers)"));
  const commit = steps.findIndex((s) => s.startsWith("      - name: Commit and push if results changed"));
  assert.ok(paper > -1 && i > paper && i < commit, "after the linescore fetch, before the commit");
  const step = steps[i].split(/\n      # ----/)[0];
  assert.match(step, /continue-on-error: true/, "a red grader never blocks or alters the rest of settlement");
  assert.match(step, /grade-level-a-suggestions\.mjs --now "\$\(date -u \+%Y-%m-%dT%H:%M:%SZ\)" --write/);
  assert.match(step, /if \[ "\$CODE" = "3" \]; then echo "::error title=Level A grade CONFLICT::/, "a conflict is visible, not silent");
  assert.match(step, /exit \$CODE/);
  assert.doesNotMatch(step, /git (add|commit|push)|suggestions\.jsonl.*>/, "the step itself commits nothing and never writes the record");
  assert.match(steps[commit], /git add data\/internal\/products\/ /, "graded.jsonl rides the existing nightly commit");
  assert.doesNotMatch(fs.readFileSync(path.resolve(process.cwd(), "scripts/vercel-ignore-build.sh"), "utf8"), /data\/internal\/products/, "not a BUILD_INPUT: no Production build of its own");
});
