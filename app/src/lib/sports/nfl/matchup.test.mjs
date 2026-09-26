import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { splitMatchup, opponentIn, matchupAgreesWithRow } from "./matchup.mjs";

test("the @ form splits, and so does the neutral-site VS form", () => {
  assert.deepEqual(splitMatchup("BAL @ DAL"), { away: "BAL", home: "DAL" });
  assert.deepEqual(splitMatchup("BAL VS DAL"), { away: "BAL", home: "DAL" });
  assert.deepEqual(splitMatchup("IND vs WSH"), { away: "IND", home: "WSH" });
  assert.deepEqual(splitMatchup("IND vs. WSH"), { away: "IND", home: "WSH" });
  assert.deepEqual(splitMatchup("IND at WSH"), { away: "IND", home: "WSH" });
});

test("⚠ NEVER A PARTIAL RESULT — a truthy away beside an undefined home is how a whole label became an opponent", () => {
  for (const bad of [null, undefined, "", "BAL", "BAL DAL SFO", "BAL @ BAL"]) {
    assert.deepEqual(splitMatchup(bad), { away: null, home: null }, JSON.stringify(bad));
  }
});

test("opponentIn answers for either club and refuses what it cannot read", () => {
  assert.equal(opponentIn("BAL VS DAL", "BAL"), "DAL");
  assert.equal(opponentIn("BAL VS DAL", "DAL"), "BAL");
  assert.equal(opponentIn("BAL VS DAL", "SF"), null, "a club not in the game gets null, never the other one");
  assert.equal(opponentIn("BAL DAL", "BAL"), null);
});

test("⚠ a HOME-FIRST label is refused, not silently swapped", () => {
  const r = matchupAgreesWithRow({ shortName: "DAL VS BAL", away: { abbr: "BAL" }, home: { abbr: "DAL" } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /HOME-FIRST/);
});

test("an unrecognised separator is refused with the label named", () => {
  const r = matchupAgreesWithRow({ shortName: "BAL/DAL", away: { abbr: "BAL" }, home: { abbr: "DAL" } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /unrecognised separator/);
});

test("⚠ EVERY ROW of the committed schedule capture agrees with its own label", () => {
  /*
   * The away-first claim this module rests on, checked against the provider rather than asserted. Two
   * of the seventeen rows in this capture are `VS` internationals (Maracanã and Tottenham), so the
   * neutral-site form is genuinely exercised here and not only in the synthetic cases above.
   */
  const p = path.join(process.cwd(), "public/data/nfl/schedule/latest.json");
  const rows = JSON.parse(fs.readFileSync(p, "utf8")).rows ?? [];
  assert.ok(rows.length > 0, "the capture must have rows for this to mean anything");

  const failures = rows.map((r) => ({ r, v: matchupAgreesWithRow(r) })).filter((x) => !x.v.ok);
  assert.deepEqual(failures.map((x) => `${x.r.shortName}: ${x.v.reason}`), []);

  const vs = rows.filter((r) => /\svs\.?\s/i.test(r.shortName));
  assert.ok(vs.length > 0, "⚠ POSITIVE CONTROL: if no VS row is present this test proves nothing about the form it exists for");
});
