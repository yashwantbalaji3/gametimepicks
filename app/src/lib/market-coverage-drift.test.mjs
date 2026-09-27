/**
 * THE PUBLIC COVERAGE COPY MUST NOT CONTRADICT THE REGISTRY THAT GOVERNS IT (§10).
 *
 * 🔴 THE DEFECT. `market-coverage.ts` keys on COARSE market names (`player_props`) while
 * `model-calibration-status.ts` keys on FAMILIES (`batter_hits`, `pitcher_strikeouts`,
 * `batter_total_bases`, `batter_hits_runs_rbis`). With no join between them, the MLB player-props
 * row read:
 *
 *     status: "conditional"
 *     "Strikeouts / hits / total bases projected from game logs vs the line; a 10,000-run prop sim
 *      is shown only where the artifact exists. Settled from the official box score."
 *
 * Capable, neutral, and true as far as it went — while ALL FOUR families it covers carry
 * `DEMOTE_TO_MARKET_CONTEXT`: across 18,659 settled leans the model loses to the market on Brier
 * AND log loss. And `conditional` is this registry's own word for "supported once a specific input
 * exists", which is not what is missing. `full_game_sim`, one row below, already discloses its own
 * limitation — so the page disclosed one and not the other.
 *
 * ⚠ THE FIX IS THE JOIN, NOT THE SENTENCE. Rewriting the copy alone leaves the next edit free to
 * drift again. `governedBy` names the families a row covers, and these tests fail if a row whose
 * families are demoted claims a usable status or omits the disclosure.
 *
 * Run: cd app && npx tsx --test src/lib/market-coverage-drift.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

const { MARKET_COVERAGE } = await import("./market-coverage.ts");
const { MLB_MARKET_CALIBRATION, isCalibrationFailed } = await import("./mlb/model-calibration-status.ts");

const rows = Array.isArray(MARKET_COVERAGE) ? MARKET_COVERAGE : Object.values(MARKET_COVERAGE ?? {});

/** A status that tells a reader the market is usable today. */
const USABLE = new Set(["supported", "conditional"]);

test("the registry is populated and every row names its sport and market", () => {
  assert.ok(rows.length >= 20, `expected a populated registry, got ${rows.length}`);
  for (const r of rows) {
    assert.ok(r.sport && r.market, `a row is missing sport/market: ${JSON.stringify(r).slice(0, 80)}`);
    assert.ok(r.publicLabel && r.publicExplanation, `${r.sport}/${r.market} has no public copy`);
  }
});

test("🔴 §10 · a row whose families are DEMOTED may not claim a usable status", () => {
  for (const r of rows) {
    const fams = r.governedBy ?? [];
    if (!fams.length) continue;
    const demoted = fams.filter((f) => isCalibrationFailed(f));
    if (!demoted.length) continue;
    assert.equal(USABLE.has(r.status), false,
      `${r.sport}/${r.market} is "${r.status}" while ${demoted.join(", ")} are demoted — ` +
      `"conditional" means an input is missing, and an input is not what is missing`);
  }
});

test("🔴 §10 · a row whose families are DEMOTED must SAY SO in its public copy", () => {
  for (const r of rows) {
    const demoted = (r.governedBy ?? []).filter((f) => isCalibrationFailed(f));
    if (!demoted.length) continue;
    const t = r.publicExplanation.toLowerCase();
    assert.ok(
      /not market-proven|does not out-?predict|none of these markets' model probabilities out-?predict|research signal/.test(t),
      `${r.sport}/${r.market} covers demoted families and its copy discloses nothing:\n    "${r.publicExplanation}"`,
    );
    /* And it must not claim the opposite. */
    assert.equal(/beats the market|out-?performs the market|proven advantage(?! )/.test(t), false,
      `${r.sport}/${r.market} claims an advantage its own audit refuses`);
  }
});

test("🔴 every family named in `governedBy` exists in the calibration registry", () => {
  /* A join that points at nothing is a join that silently never fires — the vacuous-guard shape. */
  for (const r of rows) {
    for (const f of r.governedBy ?? []) {
      assert.ok(MLB_MARKET_CALIBRATION[f], `${r.sport}/${r.market} names "${f}", which is not a calibrated market`);
    }
  }
});

test("🔴 the guard is not vacuous — the MLB prop row IS joined and IS demoted", () => {
  /*
   * Without this, deleting every `governedBy` would make the two tests above pass trivially. The
   * row that motivated them must stay joined.
   */
  const props = rows.find((r) => r.sport === "mlb" && r.market === "player_props");
  assert.ok(props, "the MLB player-props row is gone");
  assert.ok((props.governedBy ?? []).length >= 3, "the MLB prop row must name the families it covers");
  const demoted = props.governedBy.filter((f) => isCalibrationFailed(f));
  assert.equal(demoted.length, props.governedBy.length,
    "every family this row covers is demoted today — if that changes, this expectation should too");
  assert.equal(props.status, "experimental");
});

test("the sibling row that already disclosed its limitation still does", () => {
  /* `full_game_sim` is the standard the prop row was measured against. */
  const sim = rows.find((r) => r.sport === "mlb" && r.market === "full_game_sim");
  assert.ok(sim);
  assert.match(sim.publicExplanation, /not been validated to out-predict the market/i);
  assert.equal(USABLE.has(sim.status), false);
});

test("§3 · no coverage row claims a market-beating advantage anywhere", () => {
  for (const r of rows) {
    const t = r.publicExplanation.toLowerCase();
    for (const banned of ["beat the market", "beats the market", "beat the book", "edge over the book"]) {
      assert.equal(t.includes(banned), false, `${r.sport}/${r.market}: "${banned}"`);
    }
  }
});
