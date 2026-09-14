import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { totalsSpread } from "./totals-spread.mjs";

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..", "..");

const ours = (pairs) => pairs.map(([id, total]) => ({ providerEventId: id, total }));
const mkt = (pairs) => pairs.map(([id, marketTotal]) => ({ providerEventId: id, marketTotal }));

test("it reports both columns' ranges and which way ours sit, in plain words", () => {
  const r = totalsSpread(
    ours([["a", 44], ["b", 48], ["c", 50]]),
    mkt([["a", 40], ["b", 47], ["c", 48]]),
  );
  assert.equal(r.n, 3);
  assert.equal(r.paired, 3);
  assert.equal(r.ourMin, 44);
  assert.equal(r.ourMax, 50);
  assert.equal(r.marketMin, 40);
  assert.equal(r.marketMax, 48);
  assert.equal(r.offset, 2.3);                       // (4 + 1 + 2) / 3
  assert.match(r.sentence, /from 44 to 50 points/);
  assert.match(r.sentence, /from 40 to 48/);
  assert.match(r.sentence, /2\.3 points higher than theirs/);
  assert.doesNotMatch(r.sentence, /standard deviation/, "no statistics jargon in a sentence meant for new bettors");
});

test("an unpriced game never widens or narrows either side of the comparison", () => {
  /* The comparison must be over the SAME games. A game with our number but no market number would
     otherwise inflate our apparent range against a market range it never contributed to. */
  const withExtra = totalsSpread(
    ours([["a", 44], ["b", 48], ["c", 50], ["d", 99]]),
    mkt([["a", 40], ["b", 47], ["c", 48]]),
  );
  assert.equal(withExtra.paired, 3, "the unpriced game is excluded from the pairing");
  assert.equal(withExtra.marketMin, 40);
  assert.equal(withExtra.marketMax, 48);
  assert.equal(withExtra.pairedOurMax, 50);
  assert.equal(withExtra.offset, 2.3, "and it does not move the offset");
  assert.equal(withExtra.n, 4, "though it still counts among our own published totals");
  assert.doesNotMatch(withExtra.sentence, /99/, "the comparison sentence speaks only of the priced games");
});

test("no market capture → it still says how much ours move, and invents no comparison", () => {
  const r = totalsSpread(ours([["a", 44], ["b", 48], ["c", 50]]), []);
  assert.equal(r.paired, 0);
  assert.equal(r.marketSd, null);
  assert.equal(r.offset, null);
  assert.match(r.sentence, /from 44 to 50 points/);
  assert.doesNotMatch(r.sentence, /sportsbook/i, "with nothing to compare against, it must not mention one");
});

test("a single game states nothing about spread", () => {
  const r = totalsSpread(ours([["a", 44]]), mkt([["a", 40]]));
  assert.equal(r.sentence, null, "one number has no spread; a sentence about it would be invented");
});

test("it reports, and does not grade", () => {
  const r = totalsSpread(ours([["a", 44], ["b", 48]]), mkt([["a", 44], ["b", 48]]));
  for (const word of ["accurate", "inaccurate", "beat", "edge", "better than", "worse than"]) {
    assert.ok(!r.sentence.toLowerCase().includes(word), `the sentence grades the model with "${word}"`);
  }
  assert.match(r.sentence, /the same as theirs/, "a zero offset says so rather than omitting it");
});

test("the spread clause is chosen BY the numbers — a wider column is never called narrower", () => {
  /* P294 asserted "ours separate games less" whatever the numbers said. A better totals head can make
     that false, and a sentence that outlives its truth is the defect this module exists to remove. */
  const narrow = totalsSpread(ours([["a", 45], ["b", 46], ["c", 47]]), mkt([["a", 38], ["b", 45], ["c", 52]]));
  assert.match(narrow.sentence, /spread games out less/);
  const wide = totalsSpread(ours([["a", 38], ["b", 45], ["c", 52]]), mkt([["a", 45], ["b", 46], ["c", 47]]));
  assert.doesNotMatch(wide.sentence, /spread games out less/);
  assert.match(wide.sentence, /spread games out more/);
});

test("THE LIVE SLATE: the sentence agrees with the committed artifacts it describes", () => {
  const fp = path.join(APP, "app/public/data/nfl/forecasts/latest.json");
  const mp = path.join(APP, "app/public/data/nfl/markets/latest.json");
  if (!fs.existsSync(fp) || !fs.existsSync(mp)) return;
  const f = JSON.parse(fs.readFileSync(fp, "utf8"));
  const m = JSON.parse(fs.readFileSync(mp, "utf8"));
  const r = totalsSpread(
    (f.forecasts ?? []).map((x) => ({ providerEventId: x.providerEventId, total: x.forecastSummary?.total?.median ?? null })),
    (m.rows ?? []).map((x) => ({ providerEventId: x.providerEventId, marketTotal: x.consensus?.total ?? null })),
  );
  if (r.paired < 2) return;                       // no current capture: nothing to compare
  assert.ok(r.pairedOurSd != null && r.marketSd != null);
  if (r.pairedOurSd < r.marketSd) assert.match(r.sentence, /spread games out less/);
  else assert.doesNotMatch(r.sentence, /spread games out less/, `ours spread ${r.pairedOurSd} vs books ${r.marketSd} — the sentence must not call ours narrower`);
  assert.ok(r.sentence.length > 80, "the slate must produce a real sentence, not a stub");
});
