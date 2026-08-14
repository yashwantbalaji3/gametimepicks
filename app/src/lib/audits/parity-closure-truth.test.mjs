/**
 * THE FALSE-CLOSURE GUARD (Program 178 · Phase 0).
 *
 * Program 177 reported "11 OPEN rows → 0" while its own ledger still carried an ADAPTER_NEEDED row.
 * Both numbers were individually derived and individually true; the HEADLINE built from them was
 * not. "Zero open" is what a reader takes as "this is finished", and a row that still needs an
 * adapter is not finished — it is open work wearing a different label.
 *
 * The defect is a vocabulary one: a per-status breakdown lets unresolved work hide in whichever
 * bucket is not being counted. So this guard defines ONE word — `unresolved` — over every status
 * that means "engineering remains", and refuses any completion language while it is above zero.
 *
 * This guard is deliberately written to be hard to satisfy dishonestly: adding a new status to the
 * ledger without classifying it as resolved or unresolved FAILS, rather than silently defaulting to
 * "fine". A future status invented to dodge the count is therefore caught by construction.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/audits/mlb-nfl-parity-ledger.json"), "utf8"));

/** Statuses that mean the work is DONE. Anything else is unresolved. */
const RESOLVED = new Set(["SHIPPED", "ADOPTED_SHARED", "NOT_APPLICABLE", "PROVEN"]);
/** Statuses that mean engineering remains. Named explicitly so a new one cannot slip in unclassified. */
const UNRESOLVED = new Set(["OPEN", "PARTIAL", "ADAPTER_NEEDED", "BLOCKED_ENGINEERING", "UNKNOWN", "TODO", "FOLLOW_UP"]);

const unresolvedRows = () => ledger.rows.filter((r) => !RESOLVED.has(r.status));

test("every status in the ledger is CLASSIFIED as resolved or unresolved — no unclassified bucket", () => {
  for (const r of ledger.rows) {
    assert.ok(RESOLVED.has(r.status) || UNRESOLVED.has(r.status),
      `"${r.status}" (${r.capability}) is neither in the resolved nor the unresolved set — a status invented to dodge the count fails here by construction`);
  }
});

test("the summary publishes ONE unresolved count over every open-work status", () => {
  assert.ok("unresolved" in ledger.summary,
    "the summary must publish a single `unresolved` number; a per-status breakdown lets open work hide in whichever bucket is not being read");
  assert.equal(ledger.summary.unresolved, unresolvedRows().length,
    `unresolved must equal the rows that are not resolved: ${unresolvedRows().map((r) => `${r.capability} (${r.status})`).join(", ") || "none"}`);
});

test("NO COMPLETION LANGUAGE may coexist with unresolved work — the P177 defect, guarded", () => {
  const unresolved = unresolvedRows();
  // every narrative string the ledger carries, in one place
  const narrative = [
    ledger.summary?.derivedNote,
    ledger.summary?.claim,
    ledger.keyFinding,
    ...(ledger.honesty ?? []),
    ...(ledger.programLog ?? []).map((e) => e.note),
  ].filter(Boolean).join("  ");

  // A closure phrase QUOTED INSIDE ITS OWN WITHDRAWAL is the opposite of a claim, and a guard that
  // forbade it would push the next author to delete the correction rather than publish it — the same
  // trap the "beat the market" guard already solves by checking the words immediately before.
  const isWithdrawal = (before) =>
    /\b(false|withdrawn|withdraw|over-?claim(?:ed)?|incorrect|was not|not true|reported|corrected|correction|defect|proved the point)\b/i.test(before);

  if (unresolved.length > 0) {
    // "0 open", "zero open", "11 OPEN → 0" and friends
    for (const m of narrative.matchAll(/\b(?:0|zero)\s+(?:rows?\s+)?(?:are\s+)?open\b/gi)) {
      const before = narrative.slice(Math.max(0, m.index - 160), m.index);
      assert.ok(isWithdrawal(before),
        `"${m[0]}" claims zero open while ${unresolved.length} row(s) remain unresolved: ${unresolved.map((r) => r.status).join(", ")}`);
    }
    for (const m of narrative.matchAll(/→\s*0\b|->\s*0\b/g)) {
      const before = narrative.slice(Math.max(0, m.index - 160), m.index);
      assert.ok(isWithdrawal(before),
        `"${m[0]}" reads as a closure claim while ${unresolved.length} row(s) remain unresolved`);
    }
    for (const banned of ["parity complete", "NFL_PARITY_COMPLETE", "fully closed", "nothing remains"]) {
      assert.ok(!new RegExp(banned, "i").test(narrative),
        `"${banned}" cannot appear while ${unresolved.length} row(s) remain unresolved`);
    }
  }
});

test("the ledger states its OWN classification, and it matches the evidence", () => {
  const unresolved = unresolvedRows();
  assert.ok(ledger.summary?.claim, "the ledger must classify itself rather than leaving a reader to add the buckets up");
  if (unresolved.length === 0) {
    assert.match(ledger.summary.claim, /COMPLETE/);
  } else {
    assert.match(ledger.summary.claim, /MATERIAL_PROGRESS|IN_PROGRESS/,
      `${unresolved.length} unresolved row(s) — the classification may not say COMPLETE`);
    // and the remaining work is NAMED, not merely counted
    for (const r of unresolved) {
      assert.ok(ledger.summary.claim.includes(r.capability) || (r.note ?? "").length > 40,
        `${r.capability}: an unresolved row must carry a substantive note saying what remains`);
    }
  }
});

test("the P177 execution log is corrected, not left standing with the false headline", () => {
  const log = fs.readFileSync(path.join(ROOT, "docs/execution/PROGRAM_177_EXECUTION_LOG.md"), "utf8");
  const unresolved = unresolvedRows();
  if (unresolved.length > 0) {
    assert.match(log, /CORRECTION/,
      "the P177 log carried the '11 OPEN → 0' headline; while work remains it must carry the correction inline, not only in a later document a reader may never open");
  }
});
