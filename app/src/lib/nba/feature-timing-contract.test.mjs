/**
 * NBA leakage-safe feature/timing contract tests (Phase 10). Pins the core leakage rule for the NBA player-prop
 * pipeline: feature capture time (board generatedAt) STRICTLY before tip-off, the manual news layer captured before
 * tip-off, and every trailing-form source game STRICTLY earlier than the slate date. NBA is HISTORICAL_ONLY
 * (docs/NBA_ENGINE_FORENSIC_AUDIT.md) — this gate must pass before any re-validated NBA model is exposed.
 * Run: npx tsx --test src/lib/nba/feature-timing-contract.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  nbaFeatureTimingEligible,
  sourceGamesStrictlyPrior,
  NBA_CONTRACT_FLAGS,
} from "./feature-timing-contract.ts";

// Real 2026-06-13 playoff slate: 8:30 PM ET tip-off = 2026-06-14T00:30:00Z (EDT = UTC-4).
const TIPOFF = "2026-06-14T00:30:00Z";
// Real board generatedAt from app/public/data/boards/2026-06-13.json.
const BOARD_GEN = "2026-06-13T15:17:23Z";

test("1 · board captured before tip-off + all source games strictly earlier ⇒ eligible", () => {
  const r = nbaFeatureTimingEligible({
    boardGeneratedAt: BOARD_GEN,
    tipoffTime: TIPOFF,
    slateDate: "2026-06-13",
    sourceGameDates: ["2026-06-11", "2026-06-09", "2026-05-08"],
  });
  assert.equal(r.eligible, true, r.reason);
});

test("2 · board generated at/after tip-off ⇒ ineligible (equality is ineligible too)", () => {
  assert.equal(nbaFeatureTimingEligible({ boardGeneratedAt: "2026-06-14T01:00:00Z", tipoffTime: TIPOFF }).eligible, false);
  assert.equal(
    nbaFeatureTimingEligible({ boardGeneratedAt: TIPOFF, tipoffTime: TIPOFF }).eligible,
    false,
    "capture == tip-off must be ineligible",
  );
});

test("3 · a source game ON/AFTER the slate date ⇒ ineligible (trailing-form leakage)", () => {
  const r = nbaFeatureTimingEligible({
    boardGeneratedAt: BOARD_GEN,
    tipoffTime: TIPOFF,
    slateDate: "2026-06-13",
    sourceGameDates: ["2026-06-13"], // same-day game log = leak
  });
  assert.equal(r.eligible, false);
  assert.match(r.reason, /not strictly earlier/);
});

test("4 · display-only / missing tip-off, missing board time, or undated source ⇒ ineligible (unprovable timing)", () => {
  // The current boards store only a DISPLAY tip-off ("8:30 PM ET") — unprovable ⇒ ineligible until a reactivation
  // records an ISO tip-off instant. This is the documented reactivation gap.
  assert.equal(nbaFeatureTimingEligible({ boardGeneratedAt: BOARD_GEN, tipoffTime: "8:30 PM ET" }).eligible, false);
  assert.equal(nbaFeatureTimingEligible({ boardGeneratedAt: BOARD_GEN, tipoffTime: null }).eligible, false);
  assert.equal(nbaFeatureTimingEligible({ boardGeneratedAt: null, tipoffTime: TIPOFF }).eligible, false);
  assert.equal(
    nbaFeatureTimingEligible({ boardGeneratedAt: BOARD_GEN, tipoffTime: TIPOFF, slateDate: "2026-06-13", sourceGameDates: [null] }).eligible,
    false,
    "an undated source game is ineligible",
  );
});

test("5 · manual news/injury layer captured at/after tip-off ⇒ ineligible; captured before ⇒ eligible", () => {
  const base = { boardGeneratedAt: BOARD_GEN, tipoffTime: TIPOFF, slateDate: "2026-06-13", sourceGameDates: ["2026-06-11"] };
  assert.equal(nbaFeatureTimingEligible({ ...base, newsCapturedAt: "2026-06-14T02:00:00Z" }).eligible, false, "post-tip news must leak");
  assert.equal(nbaFeatureTimingEligible({ ...base, newsCapturedAt: "8:30 PM ET" }).eligible, false, "news without a proven instant is ineligible");
  assert.equal(nbaFeatureTimingEligible({ ...base, newsCapturedAt: "2026-06-13T20:00:00Z" }).eligible, true, "pre-tip news is fine");
});

test("6 · real 2026-06-13 board values (reconstructed ISO tip-off) ⇒ eligible", () => {
  // Grounds the contract in the real artifact: board gen 11:17 AM ET, source games up to 2026-06-11, slate 2026-06-13.
  const r = nbaFeatureTimingEligible({
    boardGeneratedAt: BOARD_GEN,
    tipoffTime: TIPOFF,
    slateDate: "2026-06-13",
    sourceGameDates: ["2026-05-08", "2026-05-10", "2026-05-20", "2026-05-22", "2026-05-24", "2026-05-26", "2026-06-04", "2026-06-06", "2026-06-09", "2026-06-11"],
    newsCapturedAt: null,
  });
  assert.equal(r.eligible, true, r.reason);
});

test("7 · sourceGamesStrictlyPrior helper matches the chronological rule", () => {
  assert.equal(sourceGamesStrictlyPrior(["2026-06-11", "2026-06-09"], "2026-06-13"), true);
  assert.equal(sourceGamesStrictlyPrior(["2026-06-13"], "2026-06-13"), false, "same-day is not strictly prior");
  assert.equal(sourceGamesStrictlyPrior(["2026-06-14"], "2026-06-13"), false, "future is not prior");
  assert.equal(sourceGamesStrictlyPrior([null], "2026-06-13"), false, "undated is not prior");
  assert.equal(sourceGamesStrictlyPrior(["2026-06-11"], null), false, "no slate date ⇒ cannot prove");
});

test("8 · contract is flagged HISTORICAL_ONLY (never public / money-touching)", () => {
  assert.equal(NBA_CONTRACT_FLAGS.public, false);
  assert.equal(NBA_CONTRACT_FLAGS.approvedForProduction, false);
  assert.equal(NBA_CONTRACT_FLAGS.productEligible, false);
});
