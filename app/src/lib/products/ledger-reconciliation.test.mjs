/**
 * EVERY LEDGER RECONCILES, AND NOTHING SUMS ACROSS PRODUCTS — Program 230 · F3.
 *
 * Run: npx tsx --test src/lib/products/ledger-reconciliation.test.mjs
 *
 * Two claims, both against the live artifacts rather than fixtures.
 *
 * THE PARTS SUM TO THE WHOLE. Every bucket in the Parlay Lab ledger rounded its own `returned` from
 * its own unrounded accumulation — the tier rows and the record they sit under, independently.
 * Rounding independently is not rounding once: MLB published a record of 22.61 while its four tier
 * rows summed to 22.62. One cent, and precisely the kind of discrepancy that makes a published
 * record impossible to check by hand — which is the only way most readers will ever check it.
 *
 * NOTHING IS SUMMED ACROSS PRODUCTS. Five streams share one artifact and six products share one
 * platform, and none of their records may be added together. A combined total would imply a single
 * bankroll that does not exist, and it would let a losing stream disappear into a winning one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { PRODUCT_REGISTRY, GOVERNED_PRODUCTS } from "./lifecycle-registry.mjs";

const APP = process.cwd();
const read = (rel) => {
  const p = path.join(APP, rel);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
};

/** byTier ships as an OBJECT keyed by tier. Treating it as an array yields [] and passes vacuously. */
const tiersOf = (byTier) => (Array.isArray(byTier) ? byTier : Object.values(byTier ?? {}));

test("LIVE · every Parlay Lab stream's tier rows sum to its record", () => {
  const ledger = read("public/data/parlays/lab-ledger.json");
  if (!ledger) return;

  for (const s of ledger.streams ?? []) {
    const tiers = tiersOf(s.byTier);
    assert.ok(tiers.length > 0, `${s.id}: byTier must be readable — an empty read passes every sum`);
    const r = s.record;

    for (const field of ["wins", "losses", "pushes", "staked"]) {
      const summed = tiers.reduce((n, t) => n + (t[field] ?? 0), 0);
      assert.equal(summed, r[field], `${s.id}.${field}: tiers sum to ${summed}, record says ${r[field]}`);
    }

    /* `returned` is the one that broke: it is the only field the builder rounds. */
    const summedReturned = Number(tiers.reduce((n, t) => n + (t.returned ?? 0), 0).toFixed(2));
    assert.equal(
      summedReturned,
      r.returned,
      `${s.id}.returned: the tier rows sum to ${summedReturned} under a record that says ${r.returned}`,
    );
  }
});

test("LIVE · every settled count is decomposed — no bet is counted twice or lost", () => {
  const ledger = read("public/data/parlays/lab-ledger.json");
  if (!ledger) return;
  for (const s of ledger.streams ?? []) {
    const r = s.record;
    /* staked is one unit per counted card, so it IS the settled denominator. A card that settled
       into no outcome bucket would show up here as a missing unit. */
    assert.equal(
      r.wins + r.losses + r.pushes,
      r.staked,
      `${s.id}: W+L+P (${r.wins + r.losses + r.pushes}) must equal the ${r.staked} cards staked`,
    );
    if (r.hitRate != null) {
      const decisive = r.wins + r.losses;
      assert.ok(decisive > 0, `${s.id}: a hit rate over zero decisive cards is not a rate`);
      assert.ok(Math.abs(r.hitRate - r.wins / decisive) < 5e-5, `${s.id}: hitRate disagrees with W/(W+L)`);
    }
    if (r.roi != null) {
      assert.ok(r.staked > 0, `${s.id}: an ROI over zero stake is not a ratio`);
      assert.ok(
        Math.abs(r.roi - (r.returned - r.staked) / r.staked) < 5e-5,
        `${s.id}: the published ROI disagrees with the published returned/staked`,
      );
    }
  }
});

test("NO COMBINED TOTAL — the artifact never adds the streams together", () => {
  /*
   * Five independent paper streams. A combined figure would imply one bankroll behind them, and it
   * is how a losing stream disappears into a winning one.
   */
  const ledger = read("public/data/parlays/lab-ledger.json");
  if (!ledger) return;
  const top = Object.keys(ledger);
  for (const k of top) {
    assert.ok(
      !/^(total|combined|overall|allStreams)/i.test(k),
      `lab-ledger publishes a top-level "${k}" — the streams must not be summed`,
    );
  }

  /* And the sum is not accidentally published under another name: no top-level scalar equals the
     total staked across streams (5 streams staking 33 must not appear anywhere as 33). */
  const crossTotal = (ledger.streams ?? []).reduce((n, s) => n + (s.record?.staked ?? 0), 0);
  if (crossTotal > 0) {
    for (const [k, v] of Object.entries(ledger)) {
      if (typeof v === "number") assert.notEqual(v, crossTotal, `top-level "${k}" is the cross-stream total`);
    }
  }
});

test("each governed product's ledger is reachable and is its own", () => {
  const seen = new Map();
  for (const id of GOVERNED_PRODUCTS) {
    const p = PRODUCT_REGISTRY.get(id);
    const rel = p.ledger.replace(/^app\//, "");
    const onDisk = fs.existsSync(path.join(APP, rel)) || fs.existsSync(path.join(APP, "..", p.ledger));
    assert.ok(onDisk, `${id}: its declared ledger ${p.ledger} does not exist`);

    const identity = p.ledgerStream ? `${p.ledger}#${p.ledgerStream}` : p.ledger;
    assert.equal(seen.get(identity), undefined, `${id} and ${seen.get(identity)} share the record ${identity}`);
    seen.set(identity, id);
  }
});

test("REFUSAL · a calibration product carries no money fields in its record", () => {
  /*
   * Homer Nukes records gradedPicks, predicted, actual and Brier. A stake or payout appearing there
   * would make it summable with the paper-money products, which is the combined-total failure one
   * artifact down.
   */
  for (const id of GOVERNED_PRODUCTS) {
    const p = PRODUCT_REGISTRY.get(id);
    if (p.ledgerKind !== "calibration") continue;
    const rec = read(p.ledger.replace(/^app\//, ""));
    if (!rec) continue;
    for (const banned of ["stake", "staked", "payout", "returned", "bankroll", "roi", "profit"]) {
      assert.ok(!(banned in rec), `${id}: a calibration ledger must not publish "${banned}"`);
    }
    assert.ok("brier" in rec || "gradedPicks" in rec, `${id}: a calibration ledger states what it measures`);
  }
});
