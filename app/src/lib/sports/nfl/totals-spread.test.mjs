import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { totalsSpread } from "./totals-spread.mjs";

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..", "..");

const ours = (pairs) => pairs.map(([id, total]) => ({ providerEventId: id, total }));
const mkt = (pairs) => pairs.map(([id, marketTotal]) => ({ providerEventId: id, marketTotal }));

test("it reports the spread of both columns and which way ours sits", () => {
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
  assert.match(r.sentence, /44–50/);
  assert.match(r.sentence, /40–48/);
  assert.match(r.sentence, /2\.3 points above theirs/);
});

test("an unpriced game never widens or narrows either column", () => {
  /* The comparison must be over the SAME games. A game with our number but no market number would
     otherwise inflate our apparent spread against a market spread it never contributed to. */
  const withExtra = totalsSpread(
    ours([["a", 44], ["b", 48], ["c", 50], ["d", 99]]),
    mkt([["a", 40], ["b", 47], ["c", 48]]),
  );
  assert.equal(withExtra.paired, 3, "the unpriced game is excluded from the pairing");
  assert.equal(withExtra.marketMin, 40);
  assert.equal(withExtra.marketMax, 48);
  assert.equal(withExtra.offset, 2.3, "and it does not move the offset");
  assert.equal(withExtra.n, 4, "though it still counts among our own published totals");
});

test("no market capture → it still says how little ours move, and invents no comparison", () => {
  const r = totalsSpread(ours([["a", 44], ["b", 48], ["c", 50]]), []);
  assert.equal(r.paired, 0);
  assert.equal(r.marketSd, null);
  assert.equal(r.offset, null);
  assert.match(r.sentence, /44–50/);
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
  assert.match(r.sentence, /level with theirs/, "a zero offset says so rather than omitting it");
});

test("THE LIVE SLATE: the published totals really are narrower than the market's", () => {
  /*
   * The measurement this exists for, on the committed artifacts. If this ever inverts — our totals
   * spreading WIDER than the market's — the sentence would be making the opposite claim and should be
   * re-read before it ships, so assert the direction that currently holds rather than a fixed number.
   */
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
  assert.ok(r.ourSd != null && r.marketSd != null);
  assert.ok(
    r.ourSd < r.marketSd,
    `our totals now spread WIDER than the market's (${r.ourSd} vs ${r.marketSd}) — the disclosure sentence asserts the opposite and must be re-read`,
  );
  assert.ok(r.sentence.length > 80, "the slate must produce a real sentence, not a stub");
});
