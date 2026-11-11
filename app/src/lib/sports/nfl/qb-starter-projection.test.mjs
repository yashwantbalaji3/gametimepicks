/**
 * Starting-QB tier (b) (founder decision 2026-11-11): the derived constant and the committed backtest are recomputed
 * from committed data (methodology rule: a non-model constant needs a committed source and a recompute test).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { passYardsQuantiles, pinball, QUANTILES } from "./qb-starter-projection.mjs";

const ROOT = path.resolve(process.cwd(), "..");
const SCRIPT = path.join(ROOT, "scripts/research/nfl/backtest-qb-starter-tier-b.mjs");
const REPORT = path.join(ROOT, "data/internal/research/nfl/reports/qb-starter-tier-b-backtest.json");
const F = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/reports/player-props-share-level-preregistration.json"), "utf8")).frozen;

test("the committed backtest report recomputes byte-for-byte from committed data (STARTER_SHARE included)", () => {
  const out = execFileSync("node", [SCRIPT], { encoding: "utf8", maxBuffer: 1 << 26 });
  assert.equal(JSON.stringify(JSON.parse(out), null, 2) + "\n", fs.readFileSync(REPORT, "utf8"));
  const r = JSON.parse(out);
  assert.equal(r.inputs.priorTrials, F.rate.priorTrials, "the tier (b) minimum is the preregistration's rate prior");
  assert.deepEqual(r.bars.coverage80.band, F.bars.coverageBand, "bars are the preregistration's");
  assert.ok(r.starterShare.value > 0.9 && r.starterShare.value <= 1);
});

test("the board reads tier (b) only while the report says TIER_B_PASSED", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/build-nfl-player-board.mjs"), "utf8");
  assert.match(src, /passed: report\?\.verdict === "TIER_B_PASSED"/);
  assert.match(src, /if \(!TIER_B\.passed\) return \{ careerAttempts: career, limitation:/);
});

test("passing-yard quantiles are ordered, scale with volume, and pinball is 0 only at a perfect point", () => {
  const a = passYardsQuantiles({ share: 0.97, volume: 33, comp: 0.65, ypcmp: 10.9, F, scale: 1.25 });
  const b = passYardsQuantiles({ share: 0.97, volume: 40, comp: 0.65, ypcmp: 10.9, F, scale: 1.25 });
  for (let i = 1; i < QUANTILES.length; i++) assert.ok(a.q[QUANTILES[i]] >= a.q[QUANTILES[i - 1]]);
  assert.ok(b.q[0.5] > a.q[0.5]);
  assert.ok(Math.abs(a.mean - 0.97 * 33 * 0.65 * 10.9) < 1e-9);
  assert.ok(pinball(a.q, a.q[0.5]) > 0);
});
