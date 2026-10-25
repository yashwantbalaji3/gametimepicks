import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
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

const VS = /\svs\.?\s/i;
const rowsOf = (rel) => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")).rows ?? [];
const disagreements = (rows) => rows.map((r) => ({ r, v: matchupAgreesWithRow(r) })).filter((x) => !x.v.ok).map((x) => `${x.r.shortName}: ${x.v.reason}`);

test("⚠ EVERY ROW of the committed schedule capture agrees with its own label", (t) => {
  /*
   * The away-first claim this module rests on, checked against the provider rather than asserted. The capture
   * is a rolling window, so whether it holds a `VS` neutral-site row depends on the calendar (none from the
   * 2026-10-25 window on). The VS positive control therefore lives on the pinned capture in the next test;
   * this one still holds every row of today's capture to the label rule, whichever forms it contains.
   */
  const rows = rowsOf("public/data/nfl/schedule/latest.json");
  assert.ok(rows.length > 0, "the capture must have rows for this to mean anything");
  assert.deepEqual(disagreements(rows), []);
  t.diagnostic(`${rows.length} rows · ${rows.filter((r) => VS.test(r.shortName)).length} VS · ${rows.filter((r) => / @ /.test(r.shortName)).length} @`);
});

/** A real ESPN capture, pinned byte-for-byte: app/public/data/nfl/schedule/latest.json at 7619933c4b (2026-09-25T14:34Z). */
const PINNED = "src/lib/sports/nfl/__fixtures__/schedule-capture-2026-09-25.json";
const PINNED_BLOB = "569e8ced8798404e903f7d452a82597de2ebbb62"; // `git rev-parse 7619933c4b:app/public/data/nfl/schedule/latest.json`

test("⚠ POSITIVE CONTROL · the VS form, on a pinned real capture: every row agrees, and the guard bites on it", () => {
  /*
   * Two of this capture's seventeen rows are `VS` internationals (Maracanã and Tottenham), so the neutral-site
   * form is exercised on provider rows, not only on the synthetic cases above, whatever today's window holds.
   */
  const bytes = fs.readFileSync(path.join(process.cwd(), PINNED));
  const blob = crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
  assert.equal(blob, PINNED_BLOB, "the pinned capture is byte-identical to the committed provider capture it was copied from");

  const rows = rowsOf(PINNED);
  assert.equal(rows.length, 17);
  assert.deepEqual(disagreements(rows), [], "every pinned row agrees with its own label");

  const vs = rows.filter((r) => VS.test(r.shortName));
  assert.deepEqual(vs.map((r) => [r.shortName, r.away.abbr, r.home.abbr, r.venue]), [
    ["BAL VS DAL", "BAL", "DAL", "Maracanã Stadium"],
    ["IND VS WSH", "IND", "WSH", "Tottenham Hotspur Stadium"],
  ], "⚠ POSITIVE CONTROL: the VS rows are present, away-first, at neutral sites");
  assert.ok(rows.some((r) => / @ /.test(r.shortName)), "the @ form is present beside them");

  // the guard is not vacuous on the real form: each VS row, written home-first or against the wrong clubs, fails
  for (const r of vs) {
    const flipped = { ...r, shortName: `${r.home.abbr} VS ${r.away.abbr}` };
    assert.match(matchupAgreesWithRow(flipped).reason ?? "", /HOME-FIRST/, `${r.shortName} written home-first is refused`);
    const wrong = { ...r, home: { ...r.home, abbr: "SF" } };
    assert.equal(matchupAgreesWithRow(wrong).ok, false, `${r.shortName} against the wrong home club is refused`);
  }
});
