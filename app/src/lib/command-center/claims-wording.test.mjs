/**
 * NO "BEAT" WITHOUT AN INTERVAL (launch audit, 2026-10-13; founder-approved wording fix).
 *
 * The rule: a public sentence may say a model beat a baseline only when its evaluation carries an uncertainty interval
 * that excludes zero. UFC's heads ("each beat their baseline") and the generic VALIDATED meaning ("beat the simpler
 * rules it replaced") had point estimates only; /about said a 2-day, 62-pick sample was "outperforming meaningfully".
 * The EPL match-model claim IS backed by a passing season-bootstrap interval, so it stays — with its numbers stated,
 * pinned here to the frozen evaluation artifact.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { modelStatusFor } from "./model-status.ts";
import { PUBLIC_STATE_MEANING } from "./contract.ts";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("UFC: the model line states the card's own held-out numbers and never says the heads beat their baseline", () => {
  const items = modelStatusFor("ufc", { dataRoot: path.join(APP, "public", "data"), repoRoot: ROOT, nowIso: new Date().toISOString(), ufcVerdicts: { winner: "PASS", method: "PASS", round: "PASS" } });
  const text = items.map((i) => JSON.stringify(i)).join(" ");
  assert.doesNotMatch(text, /beat (their|its) baseline/i);
  const ev = JSON.parse(fs.readFileSync(path.join(APP, "public/data/ufc/card-latest.json"), "utf8")).model?.evidence;
  if (ev?.winner) {
    assert.ok(text.includes(ev.winner.logLoss.toFixed(3)) && text.includes(ev.winner.baselineLogLoss.toFixed(3)), "the winner head's log loss and its baseline are stated");
    assert.match(text, /no uncertainty interval/, "the absence of an interval is said, not implied away");
  }
});

test("VALIDATED means preregistered bars were cleared — not that a model beat anything", () => {
  assert.doesNotMatch(PUBLIC_STATE_MEANING.VALIDATED, /\bbeat\b/i);
  assert.match(PUBLIC_STATE_MEANING.VALIDATED, /bars set in advance/);
});

test("EPL: the 'better than' sentence carries the frozen evaluation's own numbers and interval", () => {
  const evalDoc = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/epl/reports/epl-history-replay-evaluation.json"), "utf8"));
  const r = evalDoc.results, ci = evalDoc.bars.improvementIsNotNoise;
  assert.equal(ci.pass, true, "the claim is only allowed while its interval excludes zero");
  assert.ok(ci.observed.hi95 < 0);
  const f3 = (x) => x.toFixed(3), ci3 = (x) => `−${Math.abs(x).toFixed(3)}`;
  for (const src of [read("src/lib/command-center/model-status.ts"), read("src/lib/command-center/model-lab.ts")]) {
    assert.ok(src.includes(f3(r.eloPoisson.overall.logLoss)) && src.includes(f3(r.elo.overall.logLoss)) && src.includes(f3(r.poissonLive.overall.logLoss)), "log losses match the artifact");
    assert.ok(src.includes(`95% interval ${ci3(ci.observed.lo95)} to ${ci3(ci.observed.hi95)}`), "the interval matches the artifact");
  }
});

test("/about: a two-day sample is not called outperformance", () => {
  const about = read("src/app/about/page.tsx");
  assert.doesNotMatch(about, /outperforming parlays meaningfully|selectivity\s+over volume is working/);
  assert.match(about, /8-4 \(66\.7% on 12\)/, "the original statistics are kept");
  assert.match(about, /6-44 \(12\.0% on 50\)/);
});
