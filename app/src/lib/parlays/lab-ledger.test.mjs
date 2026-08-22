/**
 * THE RESTART — a reset that is about attribution, not about losing a bad number.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const ledger = JSON.parse(read("public/data/parlays/lab-ledger.json"));

test("the live record counts ONLY cards settled under the current policy", () => {
  const src = code("scripts/parlays/build-lab-ledger.mjs");
  assert.match(src, /if \(date < POLICY\.since\) continue/, "pre-restart days are excluded by date");
  assert.ok(ledger.policy.version >= 2, "the policy is versioned");
  assert.match(ledger.policy.since, /^\d{4}-\d{2}-\d{2}$/, "and dated");
});

test("the prior policy is PRESERVED, not deleted", () => {
  /*
   * The reset is legitimate: the selection rules changed materially, so 48 days of a different
   * policy do not describe this one. Deleting the number is a different act entirely — a −9.4% that
   * vanishes on the day the policy changes is the oldest trick there is, and a reader meeting an
   * empty ledger has no other way to know what the previous version did.
   */
  const p = ledger.priorPolicy;
  assert.ok(p, "the prior policy ships in the artifact");
  assert.ok(p.wins + p.losses > 0, "with its real record");
  assert.ok(p.roi != null, "and its real ROI");
  assert.ok(p.gradedDays > 0, "over its real sample");
  assert.match(p.note, /does not describe what the Lab publishes now/i, "labelled as not attributable");

  const entry = read("src/components/parlays/parlay-lab-entry.tsx");
  assert.match(entry, /priorPolicy/, "and the surface actually renders it");
});

test("an empty live record says so — it never borrows the prior number", () => {
  const entry = read("src/components/parlays/parlay-lab-entry.tsx");
  assert.match(entry, /no settled cards yet/i, "an empty stream states it plainly");
  // The old "every tier is losing money — 48 graded days, −9.4%" line described the PRIOR policy and
  // must not be asserted of a ledger that has settled nothing.
  const board = read("src/components/parlays/risk-ladder-board.tsx");
  assert.doesNotMatch(board, /every tier is <strong[^>]*>losing money on\s*\n?\s*paper/, "the pre-restart claim is gone from the live board");
});

test("every sport is a declared stream — a new sport is data, not a schema change", () => {
  /*
   * Structured for more than MLB from the first line, and deliberately: a sport that has not earned
   * live eligibility must not be able to quietly borrow MLB's numbers, and adding one should not
   * require reshaping the ledger.
   */
  const ids = ledger.streams.map((s) => s.id);
  for (const want of ["mlb", "nfl", "ufc", "epl", "multi"]) {
    assert.ok(ids.includes(want), `${want} is declared`);
  }
  for (const s of ledger.streams) {
    if (s.live) continue;
    assert.ok(s.blocked && s.blocked.length > 8, `${s.id} names WHY it is not live`);
    /*
     * `live` is a claim about TODAY — can this stream publish a card right now — and `record` is a
     * claim about HISTORY. The first version conflated them and asserted that a non-live stream had
     * no record at all, which broke the first morning MLB had both: it settled three cards on the
     * 17th and then read not-live on the 18th, because the 18th's props had not been published yet.
     * That is the ordinary state of every sport for several hours a day.
     *
     * The invariant that was actually wanted is narrower and still closes the hole it was written
     * for: a stream may only carry a record it EARNED, meaning settled days of its own. A sport
     * that has never settled anything cannot show wins or losses, whatever it borrows from.
     */
    const settled = s.settledDays ?? 0;
    if (settled === 0) {
      assert.equal(s.record.wins + s.record.losses, 0,
        `${s.id} has settled nothing but reports ${s.record.wins}-${s.record.losses} — a record it did not earn`);
    } else {
      assert.ok(s.record.wins + s.record.losses > 0,
        `${s.id} reports ${settled} settled day(s) but an empty record — results were graded and then lost`);
    }
  }
  /*
   * THE RULE, NOT THE ANSWER.
   *
   * This asserted `multi.live === false` — "multi-sport stays closed until a second sport is
   * cleared". True on the day it was written, when UFC was the only sport besides MLB with a live
   * stream. A second sport HAS now been cleared: EPL went live, so multi opened, and the guard
   * reported the condition it was waiting for as a regression.
   *
   * The invariant is the one the eligibility gate actually states: a multi-sport card drawn from a
   * single sport is just a card. So multi is live exactly when at least two single-sport streams
   * are — asserted in BOTH directions, because the failure that matters is multi opening on one
   * sport, and a one-directional check would miss it.
   */
  const multi = ledger.streams.find((s) => s.id === "multi");
  const liveSingles = ledger.streams.filter((s) => s.id !== "multi" && s.live).map((s) => s.id);
  assert.equal(
    multi.live, liveSingles.length >= 2,
    `multi is live=${multi.live} with ${liveSingles.length} live single-sport stream(s) [${liveSingles.join(", ") || "none"}]`,
  );
});

test("the ledger is re-derived from receipts, never incremented", () => {
  // A cumulative file rebuilt from one day's view is how the NFL experimental record got wiped.
  const src = code("scripts/parlays/build-lab-ledger.mjs");
  assert.match(src, /readdirSync\(RECEIPTS\)/, "it reads the receipt directory each run");
  assert.doesNotMatch(src, /readJson\(OUT\)/, "and never reads its own previous output");
});

test("settlement is write-once and never grades an unfinished game", () => {
  const src = code("scripts/parlays/settle-lab-cards.mjs");
  assert.match(src, /if \(!box\.final\)/, "a game that is not final leaves its leg pending");
  assert.match(src, /if \(!stats\)/, "a player absent from the box score is pending, not a loss");
  assert.match(src, /A settled day is not rewritten silently/, "a differing re-run refuses");
  assert.match(src, /etYesterday/, "and it defaults to yesterday in ET, not the UTC day");
});
