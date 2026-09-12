import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { twoWayConsensus, medianOf } from "./consensus.mjs";

const book = (home) => ({ noVigWinProb: { home, away: 1 - home } });

test("two independent medians need not sum to 1 — the normalised pair always does", () => {
  /* The defect, reproduced: with an even number of books the lower median of each side can come
     from different books, and on a lopsided game the miss is largest. */
  const books = [book(0.78), book(0.79), book(0.80), book(0.81)];
  const rawHome = medianOf(books.map((b) => b.noVigWinProb.home));
  const rawAway = medianOf(books.map((b) => b.noVigWinProb.away));
  assert.notEqual(rawHome + rawAway, 1, "the unnormalised pair is what this module exists to fix");

  const c = twoWayConsensus(books);
  assert.equal(c.homeWinProbNoVig + c.awayWinProbNoVig, 1, "the published pair sums to 1 exactly");
  assert.ok(Math.abs(c.homeWinProbNoVig - rawHome / (rawHome + rawAway)) < 1e-6);
  assert.ok(c.preNormalisedSum !== 1, `the size of the correction is kept: ${c.preNormalisedSum}`);
});

test("it sums to 1 at the precision it publishes, not just in theory", () => {
  /* Rounding both sides independently can leave a 1e-6 residue — which is precisely the near-miss
     a tolerance check exists to catch, so the away side is the complement of the rounded home. */
  for (const h of [1 / 3, 0.6666665, 0.123456789, 0.5, 0.9999]) {
    const c = twoWayConsensus([book(h)]);
    assert.equal(c.homeWinProbNoVig + c.awayWinProbNoVig, 1, `pair for ${h} must sum to exactly 1`);
  }
});

test("a single book passes through unchanged, because it was already a distribution", () => {
  const c = twoWayConsensus([book(0.646522)]);
  assert.equal(c.homeWinProbNoVig, 0.646522);
  assert.equal(c.awayWinProbNoVig, 0.353478);
  assert.equal(c.preNormalisedSum, 1);
});

test("corrupt or empty input yields nothing, never an invented even market", () => {
  assert.equal(twoWayConsensus([]).homeWinProbNoVig, null);
  assert.equal(twoWayConsensus(null).awayWinProbNoVig, null);
  const corrupt = twoWayConsensus([{ noVigWinProb: { home: -0.4, away: 0.4 } }]);
  assert.equal(corrupt.homeWinProbNoVig, null, "a non-positive sum is not a market to normalise");
  assert.equal(twoWayConsensus([{ noVigWinProb: { home: 0.5 } }]).homeWinProbNoVig, null, "a missing side is not half a consensus");
});

test("the basis says what was actually done", () => {
  const c = twoWayConsensus([book(0.6), book(0.62)]);
  assert.match(c.basis, /normalised so the pair sums to 1/);
  assert.match(c.basis, /de-vigged/);
});

test("LIVE · every published NFL consensus is a distribution the settlement contract accepts", () => {
  const p = path.join(process.cwd(), "public", "data", "nfl", "markets", "latest.json");
  if (!fs.existsSync(p)) return;
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  const rows = doc.rows ?? [];
  if (!rows.length) return;
  let checked = 0;
  for (const r of rows) {
    const { homeWinProbNoVig: h, awayWinProbNoVig: a } = r.consensus ?? {};
    if (!Number.isFinite(h) || !Number.isFinite(a)) continue;
    checked += 1;
    // The same ±1e-3 the settlement contract applies, which refused 10 of 13 events before this fix.
    assert.ok(Math.abs(h + a - 1) <= 1e-3, `${r.away?.abbr}@${r.home?.abbr}: consensus sums to ${(h + a).toFixed(4)}`);
    // And each side is recoverable from the books on the row, so the number is not asserted from nowhere.
    const recomputed = twoWayConsensus(r.books ?? []);
    if (recomputed.homeWinProbNoVig != null) {
      assert.ok(Math.abs(recomputed.homeWinProbNoVig - h) < 1e-6, `${r.away?.abbr}@${r.home?.abbr}: published consensus does not match its own books`);
    }
  }
  assert.ok(checked > 0, "the live check must actually see priced rows");
});
