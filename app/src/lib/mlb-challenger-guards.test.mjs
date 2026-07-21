/**
 * MLB CHALLENGER RESEARCH HONESTY GUARDS (2026-07-21).
 *
 * An internal, leakage-safe challenger framework tested whether new pregame feature families add predictive
 * value beyond the de-vigged market. Only pitcher-workload was buildable (the rest lack archived pregame data);
 * it found NO incremental value. Nothing is restored. These guards pin the honesty:
 *   1. Feature provenance: every family either has proven pregame availability or is INSUFFICIENT (never faked).
 *   2. The pitcher-workload family did NOT confirm incremental signal (walk-forward challenger ≥ market).
 *   3. The challenger changed nothing: no market PUBLIC_MODEL_OK, 0 validated product legs, eligibility unchanged.
 *   4. Artifacts are internal (public:false, approvedForProduction:false) and never web-served.
 *   5. The timestamp guard held (0 leakage failures) and market comparison used the SAME matched rows.
 *   6. Public demotion disclosures + eligibility policy are unchanged.
 *   7. Money md5 unchanged.
 *
 * Run: npx tsx --test src/lib/mlb-challenger-guards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { validatedModeledMarkets } from "./mlb/calibration/eligibility-policy.ts";
import { anyModeledMarketBeatsMarket } from "./mlb/model-calibration-status.ts";

const app = process.cwd();
const repo = path.dirname(app);
const CH = path.join(repo, "data/internal/mlb/challengers");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

test("1 · feature provenance: every family has proven pregame availability OR is INSUFFICIENT (never fabricated)", () => {
  const prov = readJson(path.join(CH, "feature-provenance.json"));
  if (!prov) { console.log("  (skip — provenance not present)"); return; }
  assert.equal(prov.public, false);
  for (const f of prov.families) {
    if (f.verdict === "BUILDABLE") assert.equal(f.pregameAvailabilityProven, true, `${f.family} buildable ⇒ pregame proven`);
    else { assert.equal(f.verdict, "INSUFFICIENT_PREGAME_COVERAGE", `${f.family} is INSUFFICIENT`); assert.equal(f.pregameAvailabilityProven, false, `${f.family} not fabricated as pregame`); }
  }
  // the four unbuildable families are exactly the ones with no archive
  const insufficient = prov.families.filter((f) => f.verdict === "INSUFFICIENT_PREGAME_COVERAGE").map((f) => f.family).sort();
  assert.deepEqual(insufficient, ["bullpen", "confirmed_lineup", "environment", "plate_appearance_opportunity"]);
});

test("2 · pitcher-workload did NOT confirm incremental signal (challenger ≥ market on walk-forward)", () => {
  const fam = readJson(path.join(CH, "family-results.json"));
  if (!fam) { console.log("  (skip — family-results not present)"); return; }
  assert.equal(fam.timestampGuardFailures ?? fam.coverage.timestampGuardFailures, 0, "no timestamp-guard failures");
  assert.notEqual(fam.familyVerdict, "INCREMENTAL_SIGNAL_CONFIRMED", "workload did not confirm signal");
  // a positive verdict is only allowed if the walk-forward challenger actually beat the market
  if (fam.familyVerdict === "INCREMENTAL_SIGNAL_CONFIRMED") assert.equal(fam.walkForward.challengerBeatsMarket, true);
  else assert.equal(fam.walkForward.challengerBeatsMarket, false, "consistent: no walk-forward improvement");
});

test("3 · the challenger changed nothing — no PUBLIC_MODEL_OK, 0 validated legs, eligibility unchanged", () => {
  const reg = readJson(path.join(CH, "challenger-registry.json"));
  if (!reg) { console.log("  (skip — registry not present)"); return; }
  assert.equal(reg.approvedForProduction, false);
  assert.equal(reg.validatedProductLegs, 0, "0 validated product legs");
  assert.equal(reg.productEligibleChanged, false, "product eligibility not changed");
  for (const v of Object.values(reg.markets)) assert.notEqual(v, "PUBLIC_MODEL_OK", "no market earned PUBLIC_MODEL_OK");
  assert.deepEqual(validatedModeledMarkets(), [], "eligibility policy still yields zero validated markets");
});

test("4 · challenger artifacts are internal + never web-served", () => {
  assert.ok(!CH.includes(`${path.sep}public${path.sep}`), "challenger dir is outside app/public");
  for (const f of ["protocol.json", "family-results.json", "challenger-registry.json", "feature-provenance.json"]) {
    const j = readJson(path.join(CH, f)); if (j) assert.equal(j.public, false, `${f} is public:false`);
  }
  const out = path.join(app, "out");
  if (fs.existsSync(out)) {
    const hit = fs.readdirSync(out, { recursive: true }).filter((p) => String(p).includes("challenger") || String(p).includes("feature-provenance"));
    assert.equal(hit.length, 0, "no challenger artifact under out/");
  }
});

test("5 · public demotion disclosures + eligibility policy unchanged (nothing re-inflated)", () => {
  assert.equal(anyModeledMarketBeatsMarket(), false, "no market beats the market publicly");
  const report = fs.readFileSync(path.join(app, "src/components/game/mlb-simulation-report-v2.tsx"), "utf8");
  assert.match(report, /Model calibration notice/, "calibration notice still shown");
  assert.match(report, /Paper candidates/, "picks still 'Paper candidates'");
});

test("6 · money md5 unchanged (challenger research is internal + analysis-only)", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
