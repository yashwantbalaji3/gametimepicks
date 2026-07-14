/**
 * Internal soccer projection engine — math invariants + honesty guards. Also asserts the internal artifacts
 * are NOT web-served and never claim to be an independent/validated model.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { projectMatch, poisson, scorelineMatrix, brier1x2, rps1x2 } from "./internal-soccer-projection-engine.ts";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");

test("poisson pmf sums to ~1 over a wide support and matches known values", () => {
  let s = 0;
  for (let k = 0; k < 40; k++) s += poisson(k, 2.6);
  assert.ok(Math.abs(s - 1) < 1e-6, `poisson(·,2.6) sums to ${s}`);
  assert.ok(Math.abs(poisson(0, 1) - Math.exp(-1)) < 1e-9, "P(0;1) = e^-1");
});

test("scoreline matrix rows fold tail mass so the full matrix sums to 1", () => {
  const m = scorelineMatrix(1.4, 1.1, 10);
  let s = 0;
  for (const row of m) for (const p of row) s += p;
  assert.ok(Math.abs(s - 1) < 1e-9, `matrix sums to ${s}`);
});

test("1X2, total pmf, BTTS, double chance are all valid probabilities that reconcile", () => {
  const p = projectMatch({ homeFifaPoints: 1700, awayFifaPoints: 1500 });
  const r = p.matchResult90;
  assert.ok(Math.abs(r.homeWin + r.draw + r.awayWin - 1) < 1e-9, "1X2 sums to 1");
  assert.ok(Math.abs(p.totalGoals.distribution.pmf.reduce((a, b) => a + b, 0) - 1) < 1e-9, "total pmf sums to 1");
  assert.ok(Math.abs(p.btts.yes + p.btts.no - 1) < 1e-9, "BTTS sums to 1");
  // double chance homeOrDraw = homeWin + draw
  assert.ok(Math.abs(p.doubleChance.homeOrDraw - (r.homeWin + r.draw)) < 1e-9);
  assert.ok(p.totalGoals.over >= 0 && p.totalGoals.over <= 1);
});

test("supremacy is monotonic in the rating gap (a stronger side is more likely to win)", () => {
  const even = projectMatch({ homeFifaPoints: 1600, awayFifaPoints: 1600 }).matchResult90;
  const strong = projectMatch({ homeFifaPoints: 1850, awayFifaPoints: 1300 }).matchResult90;
  assert.ok(strong.homeWin > even.homeWin, "bigger rating edge => higher home win prob");
  assert.ok(Math.abs(even.homeWin - even.awayWin) < 1e-6, "equal ratings, neutral site => symmetric");
});

test("market anchoring changes VOLUME (total) but supremacy stays rating-driven; mode flips honestly", () => {
  const pure = projectMatch({ homeFifaPoints: 1800, awayFifaPoints: 1500 });
  const anchored = projectMatch({ homeFifaPoints: 1800, awayFifaPoints: 1500, marketTotalLine: 3.5 });
  assert.equal(pure.modelMode, "internal_soccer_projection_v1");
  assert.equal(anchored.modelMode, "market_anchored_soccer_v1");
  assert.ok(anchored.totalGoals.expected > pure.totalGoals.expected, "higher market total => higher expected goals");
});

test("brier & rps reward correct confident predictions and are bounded", () => {
  assert.ok(brier1x2({ homeWin: 0.9, draw: 0.05, awayWin: 0.05 }, "home") < brier1x2({ homeWin: 0.34, draw: 0.33, awayWin: 0.33 }, "home"));
  assert.ok(rps1x2({ homeWin: 0.9, draw: 0.05, awayWin: 0.05 }, "home") >= 0);
});

test("HONESTY: internal soccer artifact exists, is public:false and NOT web-served", () => {
  const internalPath = path.join(REPO, "data/internal/world-cup/projection-engine/2026-07-14.json");
  assert.ok(fs.existsSync(internalPath), "internal artifact written");
  const j = JSON.parse(fs.readFileSync(internalPath, "utf8"));
  assert.equal(j.public, false, "public must be false");
  assert.equal(j.webServed, false, "must not be web-served");
  assert.equal(j.officialMoneyRecordAffected, false, "must not affect money");
  // NOT under app/public
  assert.ok(!fs.existsSync(path.join(APP, "public/data/world-cup/projection-engine")), "no projection-engine dir under app/public");
});

test("HONESTY: never claims independent/validated; modelMode + limitations are honest", () => {
  const j = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/world-cup/projection-engine/2026-07-14.json"), "utf8"));
  assert.match(j.modelMode, /internal_soccer_projection_v1|market_anchored_soccer_v1/);
  const blob = JSON.stringify(j).toLowerCase();
  assert.ok(!/"independent"|validated_soccer|"validated"/.test(blob), "no independent/validated claim");
  assert.equal(j.validation.backtestStatus, "insufficient_sample", "honest about not being validated");
  assert.ok(j.limitations.some((l) => /not validated|internal/i.test(l)), "limitations disclose internal-only");
});

test("backtest artifact: leakage-controlled, small-N disclosed, beats uniform baseline", () => {
  const b = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/world-cup/projection-engine/backtests/2026-07-14.json"), "utf8"));
  assert.equal(b.public, false);
  assert.equal(b.webServed, false);
  assert.match(b.leakageNote, /pre-tournament static|strictly-earlier/i);
  assert.equal(b.backtestStatus, "insufficient_sample", "N<40 => insufficient_sample");
  assert.ok(b.summary.sampleSize < 40 && b.sampleWarning, "small sample disclosed");
  assert.ok(b.summary.beatsUniform, "model beats the uniform baseline (directional)");
});
