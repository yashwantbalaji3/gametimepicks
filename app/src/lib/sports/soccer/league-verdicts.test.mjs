/**
 * A league's stage follows its committed backtest verdict — never the other way round (P257).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SOCCER_LEAGUES } from "./leagues.mjs";

const REPO = path.join(process.cwd(), "..");
const report = (k) => JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/soccer", k, "reports/walk-forward-v1.json"), "utf8"));
const scored = SOCCER_LEAGUES.filter((x) => x.stage === "ACCEPTED_V1" || x.stage === "REJECTED_V1");

test("the harness reproduced the EPL control before any verdict counts", () => {
  const epl = report("epl");
  assert.equal(epl.verdict, "CONTROL_PARITY_PASS");
  assert.ok(epl.parity.rows.every((r) => Math.abs(r.diff) <= 0.003));
});

test("every scored league's stage matches its verdict, and every verdict matches its bars", () => {
  assert.ok(scored.length >= 4, "the four wave-1 leagues were scored");
  for (const l of scored) {
    const r = report(l.key);
    const allPass = r.bars.every((b) => b.pass);
    assert.equal(r.verdict, allPass ? "ACCEPTED_FOR_MODEL_ONLY_FORECASTS" : "REJECTED", `${l.key}: verdict follows the bars`);
    assert.equal(l.stage, allPass ? "ACCEPTED_V1" : "REJECTED_V1", `${l.key}: the registry follows the verdict`);
  }
});

test("the market and Elo comparisons are reported and never gate", () => {
  /* Exact ids, not a pattern: /market|elo/ matched "L3_dEVELOpment_consistency" (the loose-regex class of
     vacuous-or-noisy guard). The judged bars are exactly the preregistered L-bars. */
  const prereg = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/soccer/preregistration-league-expansion-v1.json"), "utf8"));
  const expected = prereg.acceptanceBars.bars.map((b) => b.id).filter((id) => id.startsWith("L")).sort();
  assert.deepEqual(expected, ["L1_skill", "L2_calibration", "L3_development_consistency"]);
  for (const l of scored) {
    const r = report(l.key);
    assert.deepEqual(r.bars.map((b) => b.id).sort(), expected, `${l.key}: judged on exactly the preregistered bars`);
    const valueKeys = JSON.stringify(r.bars.map((b) => Object.keys(b.value ?? {})));
    assert.ok(!/"(market|elo)"/.test(valueKeys), `${l.key}: no bar reads the market or Elo`);
    assert.equal(typeof r.reportedNotGating.poissonMinusMarket, "number");
    assert.equal(typeof r.reportedNotGating.poissonMinusElo, "number");
  }
});
