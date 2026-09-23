/**
 * TWO STATES THAT MUST NOT BE COLLAPSED AGAIN (v1.8).
 *
 * `UPSTREAM_SOURCE_LAG` and `BROKEN_SWEEP` are both "a card is still pending", and the guard used to say
 * the same sentence for both — one that denied the first could happen at all. The numbers below are the
 * REAL ones from 2026-09-19: the sweep ran, logged `6/8 cards decided`, and two EPL cards stayed pending
 * because their results had not arrived. Every state is characterized, both directions are controlled, and
 * the real call path is exercised rather than a helper standing in for it.
 *
 * Run: cd app && npx tsx --test src/lib/results/pending-sweep-state.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  BENIGN_STATES, classifyPendingDate, isDefect, parseDecidability, PENDING_SWEEP_STATES as S,
} from "./pending-sweep-state.mjs";
import { settlerDecidability, tsxCommand } from "./pending-sweep-probe.mjs";

const APP = process.cwd();
const WORKFLOW = fs.readFileSync(path.join(APP, "..", ".github/workflows/nightly-settle.yml"), "utf8");
/** The exact detector the guard uses. Kept identical so a control here is a control on the guard. */
const SWEEP_WIRED = /complete-pending-days\.mjs[^\n]*--apply/;

/* ── the settler's decidability line ───────────────────────────────────────────────────────────── */

test("parseDecidability reads the settler's own count, and refuses to guess", () => {
  assert.deepEqual(parseDecidability("6/8 cards decided for 2026-09-19", "2026-09-19"), { decided: 6, total: 8 });
  assert.deepEqual(parseDecidability("\nladders...\n8/8 cards decided for 2026-09-19\ndry-run\n", "2026-09-19"), { decided: 8, total: 8 });
  assert.deepEqual(parseDecidability("0/2 cards decided for 2026-09-19", "2026-09-19"), { decided: 0, total: 2 });

  // NEGATIVE CONTROLS: anything it cannot read is null, never an assumption.
  assert.equal(parseDecidability("", "2026-09-19"), null, "empty output");
  assert.equal(parseDecidability("the settler crashed", "2026-09-19"), null, "no count line");
  assert.equal(parseDecidability("6/8 cards decided for 2026-09-20", "2026-09-19"), null, "a DIFFERENT date's count is not this date's");
  assert.equal(parseDecidability("9/8 cards decided for 2026-09-19", "2026-09-19"), null, "decided > total is malformed, not a fact");
});

/* ── the two states, from the real 2026-09-19 numbers ──────────────────────────────────────────── */

test("STATE B · the sweep ran and the source had not answered → UPSTREAM_SOURCE_LAG, not a defect", () => {
  /* The real shape: nightly-settle logged `── 2026-09-19 ── 6/8 cards decided`, two EPL cards pending. */
  const r = classifyPendingDate({ sweepWired: true, pendingCount: 2, decidability: { decided: 6, total: 8 } });
  assert.equal(r.state, S.UPSTREAM_SOURCE_LAG);
  assert.equal(isDefect(r.state), false, "a source that has not answered is not a failed settlement");
  assert.match(r.reason, /cannot decide 2 of 8/, "the reason carries the settler's own numbers");
  assert.doesNotMatch(r.reason, /sweep/i, "…and does not send the reader after a sweep that is working");
});

test("STATE A · nothing is wired to sweep → BROKEN_SWEEP, and it is a defect", () => {
  const r = classifyPendingDate({ sweepWired: false, pendingCount: 2, decidability: { decided: 6, total: 8 } });
  assert.equal(r.state, S.BROKEN_SWEEP);
  assert.equal(isDefect(r.state), true);
  /* Load-bearing: with NO sweep, identical source-lag evidence must NOT be read as benign. Source lag
     only explains a wait when something is scheduled to end it. */
  assert.match(r.reason, /nothing will ever clear these/);
});

test("STATE A · the settler could not be asked → BROKEN_SWEEP, failing CLOSED", () => {
  const r = classifyPendingDate({ sweepWired: true, pendingCount: 2, decidability: null });
  assert.equal(r.state, S.BROKEN_SWEEP, "absence of evidence is not evidence of lag");
  assert.equal(isDefect(r.state), true);
});

test("the data is here and the card is still pending → DECIDABLE_BUT_PENDING, named without blaming the sweep", () => {
  const r = classifyPendingDate({ sweepWired: true, pendingCount: 2, decidability: { decided: 8, total: 8 } });
  assert.equal(r.state, S.DECIDABLE_BUT_PENDING);
  assert.equal(isDefect(r.state), true, "a settleable card left pending is a real, actionable condition");
  assert.match(r.reason, /either the sweep is not running, or it has not run since the results landed/,
    "it states both possibilities rather than asserting the one that was wrong last time");
});

test("lag that explains only SOME of the pending cards is not full lag", () => {
  const r = classifyPendingDate({ sweepWired: true, pendingCount: 2, decidability: { decided: 7, total: 8 } });
  assert.equal(r.state, S.PARTIALLY_DECIDABLE);
  assert.equal(isDefect(r.state), true, "one undecidable card does not excuse two pending ones");
});

test("no pending cards is its own state, and the vocabulary is closed", () => {
  assert.equal(classifyPendingDate({ sweepWired: true, pendingCount: 0, decidability: null }).state, S.NO_PENDING);
  assert.deepEqual([...BENIGN_STATES].sort(), [S.NO_PENDING, S.UPSTREAM_SOURCE_LAG].sort(),
    "exactly two states are benign — widening this is how the collapse comes back");
  for (const st of [S.BROKEN_SWEEP, S.DECIDABLE_BUT_PENDING, S.PARTIALLY_DECIDABLE]) {
    assert.equal(isDefect(st), true, `${st} must stay a defect`);
  }
});

/* ── the wiring detector, both directions ──────────────────────────────────────────────────────── */

test("POSITIVE + NEGATIVE CONTROL: the sweep-wired detector reads the REAL workflow", () => {
  assert.ok(SWEEP_WIRED.test(WORKFLOW), "nightly-settle really does run the sweep with --apply");
  // …and does not fire on a workflow that only mentions it, or runs it without applying.
  assert.equal(SWEEP_WIRED.test("# we should run complete-pending-days one day\n"), false, "a comment is not a wiring");
  assert.equal(SWEEP_WIRED.test("npx tsx scripts/parlays/complete-pending-days.mjs --window-days 30\n"), false,
    "a dry-run sweep clears nothing and must not count as wired");
});

/* ── the REAL call path ────────────────────────────────────────────────────────────────────────── */

test("REAL CALL PATH: the settler can actually be asked, and answers with a parseable count", () => {
  /*
   * The control that matters most, and the one that would have caught the first draft: it reached for
   * `node_modules/.bin/tsx`, which is absent here, so every probe returned null and every date classified
   * BROKEN_SWEEP. Fail-closed, but for the wrong reason — and invisible to any test that stubbed the spawn.
   *
   * Uses a date that really exists in the committed receipts, so this cannot pass vacuously.
   */
  const dir = path.join(APP, "public/data/parlays/lab-settled");
  const dates = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
  assert.ok(dates.length > 0, "there must be committed receipts, or this control proves nothing");
  const date = dates[dates.length - 1];

  const got = settlerDecidability(APP, date);
  assert.notEqual(got, null, `the settler must be reachable and answer for ${date} — null here means the probe is broken, not that the source is lagging`);
  assert.ok(Number.isInteger(got.total) && got.total > 0, `${date} must have cards to decide (got ${JSON.stringify(got)})`);
  assert.ok(got.decided <= got.total);

  const { cmd } = tsxCommand(APP);
  assert.ok(cmd === "npx" || fs.existsSync(cmd), "the resolved tsx command must exist");
});

test("the probe is READ-ONLY: it never passes --apply", () => {
  /* Comments stripped first. The first draft of this assertion fired on the probe's OWN doc comment,
     which says "No `--apply` is ever passed" — a guard that reads prose as code fires on its footnotes,
     and the same mistake has now been made twice in this repository. */
  const raw = fs.readFileSync(path.join(APP, "src/lib/results/pending-sweep-probe.mjs"), "utf8");
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(raw, /--apply/, "positive control: the phrase IS present in the file, so stripping is what makes this pass");
  assert.doesNotMatch(code, /--apply/, "the guard must never settle a card while checking on one");
  assert.match(code, /timeout: 120_000/, "and an uncapped child must never take the gate with it again");
});
