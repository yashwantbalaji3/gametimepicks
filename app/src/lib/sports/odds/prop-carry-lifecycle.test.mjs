/**
 * THE PROP CARRY-FORWARD LIFECYCLE, END TO END (Phase 1B · 2026-09-25).
 *
 * `carryPropsForward` is unit-tested in capture-merge.test.mjs and `buildPropPriceIndex` is
 * unit-tested in prop-market-join.test.mjs. The defect this guards lived BETWEEN them, which is
 * why both suites were green while the site was one ordinary window away from forgetting every
 * price it had paid for:
 *
 *   a sweep probes props and publishes 775 priced rows
 *   → nine hours later an ordinary NFL market window runs, which buys only the 3-credit bulk
 *     team call and never asks about props
 *   → if that run rebuilds propMarkets from ITS OWN probe, propMarkets.state becomes NOT_PROBED
 *     and propPrices becomes null
 *   → every board, game report and Vault row reverts to "Not checked"
 *
 * Green job, valid artifact, site forgets. So this test walks the REAL committed capture through
 * the real merge and the real reader, and asserts the reader still answers with prices.
 *
 * It uses the committed artifact deliberately: a fixture cannot go stale, and a fixture is also
 * exactly what stopped the isolated unit tests from noticing. If the committed capture ever stops
 * carrying probed props, this test says so out loud instead of passing vacuously.
 *
 * Run: npx tsx --test src/lib/sports/odds/prop-carry-lifecycle.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { carryPropsForward } from "./capture-merge.mjs";
import { buildPropPriceIndex } from "../nfl/prop-price-lookup.mjs";

const app = process.cwd();
const capturePath = path.join(app, "public/data/nfl/markets/latest.json");
const committed = () => (fs.existsSync(capturePath) ? JSON.parse(fs.readFileSync(capturePath, "utf8")) : null);

/** The run that DID ask: the committed capture, only if it actually holds probed props. */
function sweptCapture() {
  const c = committed();
  if (c?.propMarkets?.state !== "PROBED") return null;
  if (!c?.propPrices?.rows?.length) return null;
  return c;
}

test("PREMISE: the committed capture really does carry a probed sweep with prices", () => {
  const c = committed();
  assert.ok(c, "no committed NFL market capture — every assertion below would be vacuous");
  assert.equal(c.propMarkets?.state, "PROBED",
    `committed capture is ${c.propMarkets?.state} — the lifecycle guarded here starts from a SWEEP, so this test is currently proving nothing. Re-point it at a swept capture rather than deleting it.`);
  assert.ok((c.propPrices?.rows?.length ?? 0) > 0, "a probed sweep with no priced rows cannot demonstrate a carry");
});

test("an ordinary window that never asked about props keeps every price the sweep paid for", () => {
  const swept = sweptCapture();
  if (!swept) return; // the PREMISE test above is the one that fails loudly

  /* The ordinary window: it captured team markets and did NOT probe props (propProbe null is
     exactly what the capture passes when no --probe-props flag was given). */
  const carried = carryPropsForward(swept, null);
  assert.ok(carried, "an ordinary window after a sweep must carry the sweep's props forward");

  const afterOrdinaryWindow = { ...swept, capturedAt: "2026-09-25T23:59:59Z", propMarkets: carried.propMarkets, propPrices: carried.propPrices };

  const before = buildPropPriceIndex(swept);
  const after = buildPropPriceIndex(afterOrdinaryWindow);

  assert.equal(after.rowCount, before.rowCount, "the ordinary window must not drop a single priced row");
  assert.equal(after.probedEventCount, before.probedEventCount, "every event the sweep probed is still a probed event");
  assert.ok(after.rowCount > 0 && after.probedEventCount > 0, "guard would be vacuous on an empty index");

  /* Every single priced row must survive AS A PRICE — same book, same instant, same numbers. */
  let checked = 0;
  for (const r of swept.propPrices.rows) {
    const providerEventId = String(r.canonicalEventId).replace(/^nfl-/, "");
    const m = after.marketFor(providerEventId, r.playerId, r.family);
    assert.ok(m, `${r.playerId} ${r.family} lost its price to a window that never asked about props`);
    assert.equal(m.sportsbook, r.sportsbook, "a carried price keeps the book that posted it");
    assert.equal(m.capturedAt, r.capturedAt, "a carried price keeps the instant it was captured, never the carrying run's clock");
    assert.equal(after.pricingStateFor(providerEventId, r.playerId, r.family), null,
      `${r.playerId} ${r.family} holds a price AND an absence state — the one thing that must never both be true`);
    checked += 1;
  }
  assert.ok(checked >= 100, `only ${checked} priced rows checked — too few to call this lifecycle proven`);
});

test("a FRESH probe always beats a carried one, including a fresh 'not offered'", () => {
  const swept = sweptCapture();
  if (!swept) return;

  /* The whole point of carrying is that it is a FALLBACK. A run that did ask owns the answer —
     even when the answer is that the books no longer post the market. Carrying over a fresh
     negative would be the mirror-image defect: the site remembering a price that is gone. */
  for (const state of ["PROBED"]) {
    assert.equal(carryPropsForward(swept, { state, events: [] }), null,
      `a run whose own probe returned ${state} must publish ITS OWN result, never the previous sweep's`);
  }

  const freshEmpty = { ...swept, propMarkets: { state: "PROBED", probedEventIds: ["nfl-401872953"], perEvent: [{ canonicalEventId: "nfl-401872953", absentMarkets: ["player_rush_yds"], unresolvedIdentities: [] }] }, propPrices: { rows: [] } };
  const idx = buildPropPriceIndex(freshEmpty);
  assert.equal(idx.marketFor("401872953", "nfl-athlete-4379399", "player_rush_yds"), null,
    "a fresh probe that returned no market must not surface a stale price");
  assert.equal(idx.pricingStateFor("401872953", "nfl-athlete-4379399", "player_rush_yds"), "NOT_OFFERED",
    "a fresh measured negative is NOT_OFFERED — we asked, and were told no");
});
