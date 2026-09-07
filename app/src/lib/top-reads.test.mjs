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

/*
 * ── P243 · A-1: A "TODAY" PANEL HOLDS ONLY TODAY (functional, on the live set) ─────────────────
 *
 * The P241 date-chip fix was defeated by a MIXED day: two MLB reads today kept the "today" title
 * over eight Sep-12 UFC bouts. The split now lives in the ranking owner; these pin it there.
 */
test("topToday returns only timeframe==='today'; topUpcoming only 'upcoming'; no read is lost", async () => {
  const { topToday, topUpcoming, topOverall } = await import("./top-reads.ts");
  const set = loadTopReads();
  if (!set) return; // no reads artifact in this tree state — the panels render nothing
  const today = topToday(set, 1000);
  const upcoming = topUpcoming(set, 1000);
  for (const r of today) assert.equal(r.timeframe, "today", `today panel leaked ${r.sport} ${r.eventEtDate}`);
  for (const r of upcoming) assert.equal(r.timeframe, "upcoming", `upcoming panel leaked ${r.sport} ${r.eventEtDate}`);
  assert.equal(today.length + upcoming.length, topOverall(set, 1e9).length, "the split partitions the ranked set");
});

test("sportPanelReads is timeframe-pure for every sport in the set", async () => {
  const { sportPanelReads, sportsInSet } = await import("./top-reads.ts");
  const set = loadTopReads();
  if (!set) return;
  for (const sport of sportsInSet(set)) {
    const p = sportPanelReads(set, sport, 5);
    if (p.timeframe === null) { assert.equal(p.reads.length, 0); continue; }
    for (const r of p.reads) assert.equal(r.timeframe, p.timeframe, `${sport} panel mixes timeframes`);
  }
});

test("homepage + hubs consume the split selectors, never a mixed population under a today title", () => {
  const home = fs.readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf8");
  assert.match(home, /topToday\(topReads, 10\)/, "homepage today panel uses topToday");
  assert.match(home, /topUpcoming\(topReads, 10\)/, "homepage upcoming panel uses topUpcoming");
  assert.doesNotMatch(home, /topOverall\(topReads/, "homepage no longer ranks a mixed population");
  for (const hub of ["epl", "ufc", "mlb"]) {
    const s = fs.readFileSync(path.join(process.cwd(), `src/app/${hub}/page.tsx`), "utf8");
    assert.match(s, /sportPanelReads\(topReads/, `${hub} hub uses the timeframe-pure selector`);
    assert.doesNotMatch(s, /title="What the model is most confident about today"/,
      `${hub} hub must derive the heading from the panel's timeframe`);
  }
});
