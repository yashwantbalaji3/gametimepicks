/**
 * P251-F8 — THE EPL PLAYER LAYER: A PRICE IS NOT A PRECONDITION FOR A PREDICTION.
 *
 * A full season of per-player Premier League data had been captured, a model had been
 * preregistered, and the backtest cleared all five bars — and the site published nothing from it.
 * /epl said "Player predictions · Not available for this slate" for weeks.
 *
 * The cause was one line: the projection builder selected fixtures whose state is
 * CURRENT_PRE_EVENT, which means "a current AUTHORIZED PRICE covers this fixture". A goalscorer
 * probability needs no price — it is the model's own number, graded from the official result. So
 * whenever the odds authorization lapsed, a validated product went dark, and the workflow step
 * that runs it swallowed the refusal into a warning nobody read. The team forecasts already
 * publish on exactly this population and label the rows model-only.
 *
 * What must stay true now that it publishes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const PROJ = read(path.join(APP, "public/data/soccer/epl/player-projections/latest.json"));
const RECEIPT = read(path.join(ROOT, "data/internal/research/epl/reports/player-model-v2-backtest.json"));
const FORECASTS = read(path.join(APP, "public/data/soccer/epl/forecasts/latest.json"));

test("a price is not a precondition for a prediction", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/epl/build-epl-player-projections.mjs"), "utf8");
  assert.match(src, /PROJECTABLE/, "the projectable population is named, not a single hardcoded state");
  assert.match(src, /READY_EXCEPT_ODDS/, "a fixture with a model forecast and no price is still projectable");
  assert.match(src, /CURRENT_PRE_EVENT/, "…and a priced one obviously still is");
  /* And nothing softer: a settled or refused fixture must never be projected. */
  assert.ok(!/PROJECTABLE\.has\(r\.state\) \|\|/.test(src), "the population is a closed set, not a fallback chain");
});

test("LIVE · what is published agrees with what was measured", { skip: !PROJ && "no projections artifact" }, () => {
  /* The producer's own class for a published forecast set — asserted as the producer writes it,
     not as a neighbouring artifact happens to write its own. */
  assert.equal(PROJ.dataClass, "FORECAST_PUBLIC");
  assert.equal(PROJ.public, true, "this artifact is meant for the public surface");
  assert.equal(PROJ.market, "anytime_goalscorer", "one validated market owns this artifact");
  assert.equal(PROJ.validation?.state, "VALIDATED_OUT_OF_SAMPLE");
  if (!RECEIPT) return;
  /*
   * The artifact's claimed holdout numbers must BE the receipt's. A product that quotes its own
   * evaluation has to quote the committed one — this is the only thing standing between a
   * published accuracy and a remembered one.
   */
  const h = PROJ.validation.holdout;
  const r = RECEIPT.model?.holdout ?? null;
  assert.ok(r, "the committed backtest carries its holdout numbers");
  assert.equal(h.n, r.n, "the holdout sample size disagrees with the committed backtest");
  assert.equal(h.logLoss, r.logLoss, "the published log loss disagrees with the committed backtest");
  assert.equal(h.calibrationError, r.ece, "the published calibration error disagrees with the committed backtest");
  /* And the verdict itself: an artifact may not claim validation the receipt did not grant. */
  assert.match(String(RECEIPT.verdict ?? ""), /ACCEPTED/, "the receipt accepted this model");
  assert.ok((RECEIPT.bars ?? []).every((b) => b.pass), "every preregistered bar passed on the run this artifact rests on");
});

test("LIVE · every projected fixture has a model forecast behind it", { skip: !PROJ && "no artifact" }, () => {
  const byslug = new Map((FORECASTS?.rows ?? []).map((r) => [r.slug, r]));
  for (const f of PROJ.fixtures ?? []) {
    const row = byslug.get(f.slug);
    assert.ok(row, `${f.matchup} has projections and no team forecast`);
    assert.ok(row.probs, `${f.matchup} is projected without the score matrix it sits beside`);
    assert.ok(["CURRENT_PRE_EVENT", "READY_EXCEPT_ODDS"].includes(row.state),
      `${f.matchup} is projected from state ${row.state}, which is not a pre-event state`);
  }
});

test("LIVE · a conditional number says what it is conditional on", { skip: !PROJ && "no artifact" }, () => {
  for (const f of PROJ.fixtures ?? []) {
    assert.ok(["PUBLISHED", "AWAITING_LINEUP"].includes(f.lineupState), `${f.matchup}: ${f.lineupState} outside the closed set`);
    for (const p of f.players ?? []) {
      /*
       * Zero is a real answer here and is left as one: a goalkeeper's fitted goals-per-appearance
       * IS zero in this corpus, and 72 of the 606 rows are keepers. Rounding that up to a floor
       * would be inventing a rate the data does not contain; the boards are top-N, so the zeros
       * never surface. What is forbidden is a probability of 1 or a number outside the interval.
       */
      assert.ok(p.probability >= 0 && p.probability < 1, `${p.name}: ${p.probability} is not a probability`);
      /* The model was measured on players who APPEARED. Until a lineup posts, the published
         quantity is P(scores | he starts) — the validated number with its condition attached,
         never a participation claim the model was never tested on. */
      if (f.lineupState === "AWAITING_LINEUP") {
        assert.equal(p.conditional, true, `${p.name} is published unconditionally before the XI is out`);
      }
    }
  }
  const page = fs.readFileSync(path.join(APP, "src/app/epl/match/[slug]/page.tsx"), "utf8");
  assert.match(page, /IF he starts|if he starts/i, "the page carries the condition where the numbers are");
});

test("LIVE · a REJECTED market is absent, not shown with a warning", { skip: !PROJ && "no artifact" }, () => {
  const rejected = (PROJ.rejectedMarkets ?? []).map((r) => r.id);
  assert.ok(rejected.length > 0, "the rejections are recorded, not forgotten");
  const blob = JSON.stringify(PROJ.fixtures ?? []);
  for (const id of rejected) {
    const field = id.replace(/_over_0_5$/, "");
    assert.ok(!blob.includes(`"${field}"`), `${id} was rejected and still appears on a player row`);
  }
});

test("LIVE · both figures on the hub row are labelled", () => {
  /* The row read "81.3% SOG 52.9%": the trailing label attached to the wrong number by eye, and
     the headline probability had no label at all. Two numbers, two labels. */
  const hub = fs.readFileSync(path.join(APP, "src/app/epl/page.tsx"), "utf8");
  assert.match(hub, /`SOG \$\{pct\(p\.shotsOnGoalOver05\)\}`/, "the shot figure is labelled before its number");
  assert.match(hub, /Score <\/span>\{pct\(p\.probability\)\}/, "and the scoring figure carries its own label");
});
