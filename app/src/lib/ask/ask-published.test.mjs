/**
 * THE PUBLISHED ASK ARTIFACTS — guards on the bytes that actually ship.
 *
 * WHY THIS FILE IS SEPARATE FROM ask-projection.test.mjs. Forecasts and parlay candidates are built by
 * `npm run build`, not committed, so a guard on them placed in the unit phase would find nothing and
 * skip — for ever, in CI, while reporting as "skipped" and reading like a deliberate exclusion. These
 * read `out/data/ask/v1`, which puts them in the post-build phase automatically, and which means they
 * judge the exact bytes the endpoint will serve rather than an intermediate nobody deploys.
 *
 * The run-suite refuses the post-build phase when `out/` is absent, so these cannot report that they
 * looked when they could not.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ASK_ASSET_PREFIX, ASK_BUDGET, ASK_EXPECTED_PARLAY_SPORTS } from "./contract.mjs";
import { canEnterPredictionProducts, canShowLiveProjections, capabilityOf } from "../sport-capability-registry.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PUB = path.join(APP, "out", ASK_ASSET_PREFIX.replace(/^\//, ""));
const read = (rel) => JSON.parse(fs.readFileSync(path.join(PUB, rel), "utf8"));

test("the published Ask assets exist in the built export", () => {
  assert.ok(fs.existsSync(PUB), `${ASK_ASSET_PREFIX} is not in out/ — check ALWAYS_PUBLIC_DATA_DIRS and the emit step`);
  for (const f of ["entities.json", "matchups.json", "help.json", "forecasts.json", "parlays.json"]) {
    assert.ok(fs.existsSync(path.join(PUB, f)), `${f} was not published`);
  }
});

/* ───────────────────────────  THE NBA RULE, ON THE REAL ARTIFACT  ─────────────────────────── */

test("no published parlay candidate belongs to a sport barred from prediction products", () => {
  const parlays = read("parlays.json");
  let checked = 0;
  for (const day of Object.values(parlays.byDate ?? {})) {
    for (const [profile, slips] of Object.entries(day.profiles ?? {})) {
      for (const slip of slips) {
        checked += 1;
        assert.ok(
          canEnterPredictionProducts(slip.sport),
          `${slip.slipId} (${profile}): ${slip.sport} may not enter prediction products (${capabilityOf(slip.sport).state})`,
        );
        for (const leg of slip.legs ?? []) {
          assert.ok(canEnterPredictionProducts(leg.sport), `${slip.slipId}: a leg is ${leg.sport}, which may not enter prediction products`);
        }
      }
    }
  }
  assert.ok(checked > 0, "no published candidates were checked — this guard would pass vacuously");
});

test("the published eligible-sport list is exactly what the capability registry permits", () => {
  const parlays = read("parlays.json");
  let days = 0;
  for (const day of Object.values(parlays.byDate ?? {})) {
    days += 1;
    assert.deepEqual(
      [...(day.eligibleSports ?? [])].sort(),
      [...ASK_EXPECTED_PARLAY_SPORTS].sort(),
      `${day.date}: the published eligible sports drifted from the registry`,
    );
  }
  assert.ok(days > 0, "no published days were checked — this guard would pass vacuously");
});

/* ───────────────────────────  FORECASTS AND PAUSES  ─────────────────────────── */

test("no published forecast belongs to a sport that may not show forward-looking output", () => {
  const doc = read("forecasts.json");
  assert.ok((doc.forecasts ?? []).length > 0, "no published forecasts were checked — this guard would pass vacuously");
  for (const f of doc.forecasts) {
    assert.ok(canShowLiveProjections(f.sport), `${f.forecastId}: ${f.sport} may not show forecasts`);
    /*
     * NFL and EPL publish under an experimental banner and may NOT become product picks —
     * nfl/product-eligibility.json currently qualifies 0 of 16 events. The flag travels with the
     * forecast so an answer cannot drop the word.
     */
    if (f.sport !== "MLB") assert.equal(f.experimental, true, `${f.forecastId}: a non-FULL_MODEL forecast must be marked experimental`);
  }
});

test("a published paused market carries its reason and NO pick", () => {
  const doc = read("forecasts.json");
  const paused = doc.forecasts.flatMap((f) => (f.markets ?? []).filter((m) => m.status === "PAUSED").map((m) => ({ f, m })));
  for (const { f, m } of paused) {
    assert.equal(m.pick, null, `${f.forecastId} ${m.market}: a paused market must carry no pick`);
    assert.equal(m.modelProbability, null, `${f.forecastId} ${m.market}: a paused market must carry no model probability`);
    assert.ok(m.pausedReason, `${f.forecastId} ${m.market}: a paused market must state why`);
  }
  // MLB totals are paused today. If that stops being true this guard stops having subjects, and the
  // count says so rather than the file silently guarding nothing.
  assert.ok(paused.length > 0, "no paused market was found — if MLB totals were unpaused, say so deliberately");
});

test("the published artifact states that no EV owner and no staking policy exist", () => {
  const parlays = read("parlays.json");
  /* Stated as DATA so the writer repeats a fact rather than obeying a rule. */
  assert.equal(parlays.evOwner, null, "no approved price-aware EV owner exists in this repository");
  assert.equal(parlays.stakePolicyOwner, null, "no approved staking policy exists in this repository");
});

test("every published asset is inside the loader's own size ceiling", () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const assets = walk(PUB);
  assert.ok(assets.length > 10, `only ${assets.length} assets found — this guard would pass vacuously`);
  for (const a of assets) {
    const bytes = fs.statSync(a).size;
    assert.ok(
      bytes <= ASK_BUDGET.maxAssetBytes,
      `${path.relative(PUB, a)} is ${(bytes / 1024).toFixed(0)} KB, over the loader's ceiling — the endpoint would ` +
      "refuse it in production only. Pack or shard it; do not raise the ceiling.",
    );
  }
});
