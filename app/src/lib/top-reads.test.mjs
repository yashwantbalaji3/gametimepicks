/**
 * THE CROSS-SPORT TOP READS — what may be said beside them.
 *
 * Run: npx tsx --test src/lib/top-reads.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadTopReads } from "./top-reads.ts";
import { loadEplGradedRecord } from "./sports/epl/graded-record.ts";

/*
 * ── A COUNT IN A SENTENCE IS DERIVED, NEVER TYPED ──────────────────────────────────────────────
 *
 * The EPL provenance line read "Two matches have been graded in total" — true when written, false
 * by the fifth. It rendered a few sections BELOW a "5 matches graded" headline on the same page, so
 * one page stated two different sizes for one record. This is the fourth time a hand-typed count
 * has drifted on this site, which is why the rule is now the same everywhere: derive it.
 */
test("no provenance sentence hardcodes a graded count", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/top-reads.ts"), "utf8");
  const table = src.match(/const PROVENANCE[\s\S]*?\n\};/)?.[0] ?? "";
  assert.ok(table, "the provenance table must stay in one readable place");
  assert.doesNotMatch(table, /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(match|matches|fights?|games?)\s+(has|have)\b/i,
    "a count of graded events must be read from the ledger, not written into the sentence");
});

test("the derived clause agrees with the ledger the hub reads, and never quotes a rate", () => {
  const set = loadTopReads();
  const epl = set?.provenance.find((p) => p.sport === "epl");
  if (!epl) return;                                  // EPL contributed no read today
  const rec = loadEplGradedRecord();
  if (rec == null) {
    assert.doesNotMatch(epl.state, /\d+\s+match/i, "an unreadable ledger must produce no count at all, not a zero");
    return;
  }
  assert.ok(epl.state.includes(String(rec.team.matches)), `the sentence must state the ledger's own count (${rec.team.matches})`);
  assert.doesNotMatch(epl.state, /\d+(\.\d+)?%|win rate|accuracy of/i,
    "the SIZE of a record may be stated; a rate over a handful of matches is noise with a percent sign on it");
});
