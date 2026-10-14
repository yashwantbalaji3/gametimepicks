/**
 * UFC GRADER TRUTH (2026-10-14) — the investigation of the "10 bouts from 2026-09-26 awaiting results" line.
 * Nothing was missed: 1 withdrawn bout + 9 bouts from a card not yet fought. These pin the fixes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { classifyUngraded, countByDate } from "./ungraded-status.mjs";
import { loadOfficialUfcResults } from "./official-results.mjs";
import { boutKey, scorePreFightRows } from "./model-vs-market.mjs";

test("an ungraded bout is NOT_STARTED, WITHDRAWN or AWAITING — never a lag for a future card or a withdrawn bout", () => {
  const rows = [
    { boutId: "2026-09-26:mickey gall|sedriques dumas" },
    { boutId: "2026-10-17:joaquin buckley|mike malott" },
    { boutId: "2026-10-17:cody chovancek|suyoung you" },
    { boutId: "2026-10-10:a|b" },
    { boutId: "2026-10-03:graded|already" },
  ];
  const startByBout = new Map([
    ["2026-09-26:mickey gall|sedriques dumas", "2026-09-26T21:00:00Z"],
    ["2026-10-17:joaquin buckley|mike malott", "2026-10-17T21:00Z"],
    ["2026-10-17:cody chovancek|suyoung you", "2026-10-17T21:00Z"],
    ["2026-10-10:a|b", "2026-10-10T21:00:00Z"],
  ]);
  const out = classifyUngraded({
    rows, startByBout, nowIso: "2026-10-14T13:25:00Z",
    withdrawnIds: new Set(["2026-09-26:mickey gall|sedriques dumas"]),
    resultsByBout: new Map([["2026-10-03:graded|already", { winner: "x" }]]),
  });
  assert.deepEqual(out.withdrawn, ["2026-09-26:mickey gall|sedriques dumas"]);
  assert.deepEqual(out.notStarted, ["2026-10-17:joaquin buckley|mike malott", "2026-10-17:cody chovancek|suyoung you"]);
  assert.deepEqual(out.awaiting, ["2026-10-10:a|b"], "only a fought, non-withdrawn bout without a result is awaiting");
  assert.equal(countByDate(out.notStarted), "2 on 2026-10-17");
});

test("the grader reports the three buckets and never prints a negative lag", () => {
  const src = fs.readFileSync("scripts/ufc/grade-ufc-model-vs-market.mjs", "utf8");
  assert.match(src, /classifyUngraded\(\{ rows: pending, resultsByBout, withdrawnIds, startByBout, nowIso: NOW \}\)/);
  assert.match(src, /lagDays != null && lagDays > 0/);
  assert.doesNotMatch(src, /\$\{uncovered\.length\} bout\(s\) from \$\{oldest\}/, "the old single-bucket line is gone");
});

test("corpus rows join the folded snapshot key, whatever spelling the corpus's own boutId uses", () => {
  const corpus = { results: [
    { eventDate: "2026-09-26", boutId: "2026-09-26:raul rosas jr.|rob font", fighterA: "Raul Rosas Jr.", fighterB: "Rob Font", winner: "Raul Rosas Jr.", loser: "Rob Font" },
    { eventDate: "2026-09-19", boutId: "2026-09-19:casey o'neill|x y", fighterA: "Casey O'Neill", fighterB: "X Y", winner: "X Y", loser: "Casey O'Neill" },
    { eventDate: "2026-10-01", boutId: "2026-10-01:abdul-malik|z", fighterA: "Abdul-Malik", fighterB: "Z", winner: "Abdul-Malik", loser: "Z" },
  ] };
  const { byBout } = loadOfficialUfcResults({ corpus });
  for (const [d, a, b] of [["2026-09-26", "Raul Rosas Jr.", "Rob Font"], ["2026-09-19", "Casey O'Neill", "X Y"], ["2026-10-01", "Abdul-Malik", "Z"]]) {
    assert.ok(byBout.has(boutKey(d, a, b)), `${a} joins the snapshot key ${boutKey(d, a, b)}`);
  }
});

test("a corpus/ESPN winner disagreement on a punctuated name is refused as a CONFLICT, not resolved", () => {
  const corpus = { results: [{ eventDate: "2026-09-26", boutId: "x", fighterA: "Raul Rosas Jr.", fighterB: "Rob Font", winner: "Raul Rosas Jr.", loser: "Rob Font" }] };
  // The ESPN capture's real row shape (official-results.mjs fromEspn): red/blue objects, *Winner flags, statusRaw.
  const espn = { rows: [{ eventDateUtc: "2026-09-26T21:00Z", red: { name: "Raul Rosas Jr." }, blue: { name: "Rob Font" }, redWinner: false, blueWinner: true, statusRaw: "STATUS_FINAL" }] };
  const { byBout, conflicts } = loadOfficialUfcResults({ corpus, espn });
  assert.equal(conflicts.length, 1, "before the fix the corpus row keyed differently, so this disagreement was never even compared");
  assert.equal(byBout.has(boutKey("2026-09-26", "Raul Rosas Jr.", "Rob Font")), false, "a conflicting bout is refused, not resolved");
});

test("new graded rows record which official source supplied the outcome", () => {
  const rows = [{ boutId: boutKey("2026-09-26", "A B", "C D"), pick: "A B", opponent: "C D", modelProbability: 0.6, marketProbability: 0.55 }];
  const res = new Map([[rows[0].boutId, { winner: "A B", loser: "C D", source: "corpus" }]]);
  const out = scorePreFightRows(rows, res);
  assert.equal(out.graded[0].resultSource, "corpus");
});

test("lane status carries `withdrawn` through, so a card with a withdrawn bout still reconciles in public", () => {
  assert.match(fs.readFileSync("scripts/ufc/build-ufc-lane-status.mjs", "utf8"), /withdrawn: r\.withdrawn \?\? 0/);
});
