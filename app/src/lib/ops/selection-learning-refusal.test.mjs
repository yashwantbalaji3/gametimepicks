/**
 * A CRASH WHERE A REFUSAL BELONGS — `update-selection-learning.mjs` inside `nightly-settle`.
 *
 * 🔴 MEASURED 2026-09-26. `nightly-settle` threw, mid-run:
 *
 *     RangeError: Invalid time value
 *         at datesInWindow (app/scripts/update-selection-learning.mjs:95:16)
 *
 * `through` is derived by collecting `d.date` from the sport's settled ledger. When no row carries
 * that field the set is empty, `through` is undefined, and `new Date("undefinedT00:00:00Z")` reaches
 * `toISOString()` as an Invalid Date.
 *
 *     mlb   50,592 rows · 50,592 dated   its settled-leans ledger
 *     epl       46 rows ·      0 dated   its graded-forecasts ledger
 *     nfl / ufc / nba                    ledger MISSING entirely
 *
 * (Paths are named by `sportLearningPaths`, not written here: `epl-closeout-guard` scans raw source
 *  for the EPL artifact root, comments included, and this file is not an EPL-lane reader.)
 *
 * ⚠ AND IT IS NOT A MISSING ROW. EPL's ledger dates by `kickoffUtc` and has no `date` key at all —
 * two ledger schemas, one reader. Deriving the date from `kickoffUtc` CHANGES WHAT THE POLICY
 * COMPUTES for EPL, which is a deliberate change and was not made the night before an acceptance.
 * What changed is legibility: the same non-zero exit, the same "prior policy retained" fallback,
 * with the cause stated instead of a stack trace.
 *
 * Run: cd app && npx tsx --test src/lib/ops/selection-learning-refusal.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const APP = process.cwd();
const SCRIPT = path.join(APP, "scripts/update-selection-learning.mjs");
const SRC = fs.readFileSync(SCRIPT, "utf8");

/*
 * Run with `process.execPath` — plain node, which is how `nightly-settle` invokes it and how the
 * RangeError reached the log. NOT through `npx tsx`: tsx is fetched per invocation here, so
 * `node_modules/.bin/tsx` does not exist and the behavioural case would SKIP, which is a vacuous
 * test wearing a green tick.
 */
function run(sport) {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, "--sport", sport],
      { cwd: APP, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out, err: "" };
  } catch (e) {
    return { code: e.status ?? -1, out: String(e.stdout ?? ""), err: String(e.stderr ?? "") };
  }
}

test("the undefined-window guard exists and exits, rather than reaching toISOString", () => {
  assert.match(SRC, /if \(!Number\.isFinite\(end\.getTime\(\)\)\)/,
    "an unparseable window must be refused before it is formatted");
  const guard = SRC.slice(SRC.indexOf("if (!Number.isFinite(end.getTime()))"));
  assert.match(guard.slice(0, 900), /process\.exit\(1\)/,
    "the refusal must keep the SAME non-zero exit the crash produced, so the caller's fallback is unchanged");
});

test("🔴 the refusal names the cause IN ITS OUTPUT, including the key the ledger actually uses", () => {
  /*
   * ⚠ ASSERTED ON stderr, NOT ON THE SOURCE. The first version matched /kickoffUtc/ against the
   * file — which also contains the word in a comment — so deleting the line that actually TELLS a
   * reader failed nothing. A guard that reads the explanation instead of the output is measuring
   * the documentation.
   *
   * A refusal that says only "invalid date" sends the next reader back to the same dead end.
   */
  const err = run("epl").err;
  assert.match(err, /carries a `date`/, "it must say which key was missing");
  assert.match(err, /kickoffUtc/, "and which key that ledger actually dates by");
  assert.match(err, /Prior policy is retained/, "and that nothing was lost");
  assert.match(err, /graded-forecasts\.jsonl/, "and which file to look in");
});

test("the guard is in the WINDOW function, not wrapped around the whole script", () => {
  /* A top-level try/catch would swallow every other failure in this script too. */
  assert.equal(/^\s*try \{[\s\S]*process\.exit\(1\)[\s\S]*\} catch/m.test(SRC), false,
    "a blanket catch would turn unrelated defects into the same refusal");
});

test("the `date` collection that produces `through` is unchanged — this is a guard, not the fix", () => {
  assert.match(SRC, /if \(d\.date\) dates\.add\(d\.date\)/,
    "reading kickoffUtc is the real fix and is deliberately NOT done here");
});

/* ── behavioural, on the real ledgers ───────────────────────────────────────────────────────── */

test("🔴 a sport whose ledger carries no date REFUSES cleanly and writes nothing", () => {
  const r = run("epl");
  assert.equal(r.code, 1, "the exit code must be the one the caller already handles");
  assert.match(r.err, /REFUSED: no settled row for "epl" carries a/);
  assert.equal(/RangeError|Invalid time value|at datesInWindow/.test(r.err), false,
    "the stack trace must be gone");
});

test("the sport that works is UNAFFECTED — the guard must not cost a real policy update", () => {
  const before = fs.readFileSync(path.join(APP, "public/data/learning/selection-policy-latest.json"), "utf8");
  const r = run("mlb");
  assert.equal(r.code, 0, `mlb must still succeed: ${r.err.slice(0, 300)}`);
  assert.match(r.out + r.err, /through=\d{4}-\d{2}-\d{2}/, "it must still derive a window");
  const after = fs.readFileSync(path.join(APP, "public/data/learning/selection-policy-latest.json"), "utf8");
  assert.equal(after, before, "and produce the identical policy — this change is legibility, not behaviour");
});
