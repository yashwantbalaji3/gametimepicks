import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = path.resolve(new URL("../../../..", import.meta.url).pathname);
const REL = "scripts/nfl/probe-nfl-live-odds.mjs";
const src = fs.readFileSync(path.join(APP, REL), "utf8");
const lines = src.split("\n");
const lineOf = (re) => lines.findIndex((l) => re.test(l));

test("🔴 the charge is persisted BEFORE anything that can throw", () => {
  /*
   * On 2026-09-27 the first live probe charged 3 credits, then threw while grading the response,
   * and died before the ledger reached disk. The provider said "charged 3"; the ledger said 481.
   *
   * Both guards that bound this spend read that ledger — "ONE PROBE MEANS ONE" looks for a prior
   * probe entry, and the 90-credit budget sums recorded spend — so a lost record re-arms the probe
   * and the next scheduled run charges again, every fifteen minutes, with the budget reading zero.
   */
  const recorded = lineOf(/ledger = recordRequest\(ledger, \{/);
  const persisted = lineOf(/^fs\.writeFileSync\(ledgerPath/);
  const graded = lineOf(/const providerEvent = /);
  assert.ok(recorded > 0 && persisted > 0 && graded > 0, "all three landmarks must exist");
  assert.ok(persisted > recorded, "the charge must be recorded before it is written");
  assert.ok(persisted < graded,
    `the ledger must reach disk (line ${persisted + 1}) BEFORE the response is graded (line ${graded + 1}) — grading is what threw`);
});

test("🔴 nothing in the probe is used before its declaration (the TDZ class)", () => {
  /*
   * The crash was `ReferenceError: Cannot access 'matchEvent' before initialization`: a `const`
   * arrow declared ~50 lines below its only call. `const` hoists into a temporal dead zone, so the
   * file parses, `node --check` passes, and it dies only on the path that reaches it — which here
   * was the path after the money was spent.
   *
   * This scans for the whole class rather than the one symbol, at module top level.
   */
  const offenders = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/.exec(lines[i]);
    if (!m) continue;
    const name = m[1];
    for (let j = 0; j < i; j++) {
      const before = lines[j];
      /* Skip comments and the declaration line itself; look for a real call or reference. */
      if (/^\s*(\*|\/\/|\/\*)/.test(before)) continue;
      if (new RegExp(`\\b${name}\\s*\\(`).test(before)) { offenders.push(`${name}: used line ${j + 1}, declared line ${i + 1}`); break; }
    }
  }
  assert.deepEqual(offenders, [], "a const used above its declaration throws only at runtime, after the spend");
  /* And the specific repair is a hoisted declaration, so ordering cannot bite again. */
  assert.match(src, /^function matchEvent\(/m, "matchEvent must be a hoisted function declaration");
});

test("the probe still refuses to spend when nothing is live", () => {
  /* The no-spend exit must stay ABOVE the paid call, or the pre-kickoff guarantee is gone. */
  const noLive = lineOf(/NO LIVE NFL GAME at /);
  const call = lineOf(/const res = await |fetch\(/);
  assert.ok(noLive > 0, "the no-live exit must exist");
  if (call > 0) assert.ok(noLive < call, "the refusal must come before the call it prevents");
  assert.match(src, /no credit spent/, "and it must say so");
});
