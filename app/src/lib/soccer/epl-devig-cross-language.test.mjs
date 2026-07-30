/**
 * The TypeScript three-way de-vig and the Python one must agree.
 *
 * `devig_three_way` has lived only in `pipeline/world_cup/soccer_odds_parser.py`. This lane needs it
 * in TypeScript because the preview surface renders at build time, so the formula now exists twice.
 * Two implementations of one formula are worth having only while they agree: each otherwise passes
 * its own tests, and the disagreement surfaces as a probability the pipeline and the page each
 * consider correct.
 *
 * The Python side is the reference and is not modified — the legacy soccer pipeline is frozen.
 *
 * Run: npx tsx --test src/lib/soccer/epl-devig-cross-language.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { devigThreeWay, readMatchResult1x2 } from "./epl-markets.ts";

const REPO = path.resolve(process.cwd(), "..");
const VENV = path.join(REPO, "pipeline", ".venv", "bin", "python");
/** The pipeline venv when present; the module is pure stdlib, so a plain interpreter also serves. */
const PYTHON = fs.existsSync(VENV) ? VENV : "python3";

const TOLERANCE = 1e-9;

function python(snippet) {
  const out = execFileSync(PYTHON, ["-c", snippet], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: REPO },
  });
  return JSON.parse(out);
}

/** Deterministic case generation — a seeded LCG, so a divergence is reproducible by case index. */
function* lcg(seed) {
  let s = seed >>> 0;
  for (;;) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    yield s / 2 ** 32;
  }
}

const PROB_CASES = (() => {
  const rng = lcg(20260730);
  const cases = [
    [0.5, 0.3, 0.35],
    [0.4347826086956522, 0.2608695652173913, 0.30434782608695654],
    [1 / 3, 1 / 3, 1 / 3],
    [0.9, 0.05, 0.05],
    [1e-9, 0.5, 0.5],
  ];
  for (let i = 0; i < 250; i += 1) {
    cases.push([rng.next().value, rng.next().value, rng.next().value].map((v) => v * 1.2 + 1e-6));
  }
  return cases;
})();

const ODDS_CASES = (() => {
  const rng = lcg(946);
  const cases = [
    [-125, 260, 340],
    [150, 240, 175],
    [-400, 480, 900],
    [100, 100, 100],
    [-10000, 5000, 12000],
  ];
  for (let i = 0; i < 250; i += 1) {
    const draw = (v) => {
      const magnitude = Math.round(100 + rng.next().value * 1500);
      return rng.next().value < 0.45 ? -magnitude : magnitude;
    };
    cases.push([draw(), draw(), draw()]);
  }
  return cases;
})();

test("devigThreeWay agrees with the Python reference on every probability triple", () => {
  const expected = python(
    `import json
from pipeline.world_cup.soccer_odds_parser import devig_three_way
cases = json.loads(${JSON.stringify(JSON.stringify(PROB_CASES))})
print(json.dumps([devig_three_way(*c) for c in cases]))`,
  );

  assert.equal(expected.length, PROB_CASES.length);
  PROB_CASES.forEach((c, i) => {
    const ours = devigThreeWay(c[0], c[1], c[2]);
    assert.ok(ours, `case ${i} produced no reading`);
    const [h, d, a] = expected[i];
    assert.ok(Math.abs(ours.home - h) < TOLERANCE, `case ${i} home: ${ours.home} vs ${h}`);
    assert.ok(Math.abs(ours.draw - d) < TOLERANCE, `case ${i} draw: ${ours.draw} vs ${d}`);
    assert.ok(Math.abs(ours.away - a) < TOLERANCE, `case ${i} away: ${ours.away} vs ${a}`);
  });
});

test("the full American-price path agrees end to end", () => {
  const expected = python(
    `import json
from pipeline.world_cup.soccer_odds_parser import american_to_prob, devig_three_way
cases = json.loads(${JSON.stringify(JSON.stringify(ODDS_CASES))})
out = []
for home, draw, away in cases:
    ph, pd, pa = american_to_prob(home), american_to_prob(draw), american_to_prob(away)
    out.append({"raw": [ph, pd, pa], "devig": devig_three_way(ph, pd, pa)})
print(json.dumps(out))`,
  );

  assert.equal(expected.length, ODDS_CASES.length);
  ODDS_CASES.forEach(([HOME, DRAW, AWAY], i) => {
    const ours = readMatchResult1x2({ HOME, DRAW, AWAY });
    assert.equal(ours.status, "OK", `case ${i} (${HOME}/${DRAW}/${AWAY})`);
    const { raw, devig } = expected[i];
    assert.ok(Math.abs(ours.rawImplied.HOME - raw[0]) < TOLERANCE, `case ${i} raw home`);
    assert.ok(Math.abs(ours.rawImplied.DRAW - raw[1]) < TOLERANCE, `case ${i} raw draw`);
    assert.ok(Math.abs(ours.rawImplied.AWAY - raw[2]) < TOLERANCE, `case ${i} raw away`);
    assert.ok(Math.abs(ours.noVig.HOME - devig[0]) < TOLERANCE, `case ${i} no-vig home`);
    assert.ok(Math.abs(ours.noVig.DRAW - devig[1]) < TOLERANCE, `case ${i} no-vig draw`);
    assert.ok(Math.abs(ours.noVig.AWAY - devig[2]) < TOLERANCE, `case ${i} no-vig away`);
    assert.ok(Math.abs(ours.overround - (raw[0] + raw[1] + raw[2])) < TOLERANCE, `case ${i} overround`);
  });
});

test("the generated cases actually exercise both price signs and a real overround", () => {
  assert.ok(ODDS_CASES.some(([h]) => h < 0) && ODDS_CASES.some(([h]) => h > 0), "both signs present");
  const overrounds = ODDS_CASES.map((c) => readMatchResult1x2({ HOME: c[0], DRAW: c[1], AWAY: c[2] }).overround);
  assert.ok(overrounds.some((o) => o > 1.05), "some case carries a real book margin, or agreement is trivial");
});

test("the two implementations diverge ONLY where TypeScript is stricter, and that is documented", () => {
  // Python's guard is `total <= 0`; NaN fails it and propagates. TypeScript refuses non-finite input
  // outright, because JSON reaches it through a parser that has not already rejected non-numerics.
  const pythonNaN = python(
    `import json, math
from pipeline.world_cup.soccer_odds_parser import devig_three_way
r = devig_three_way(float("nan"), 0.3, 0.3)
print(json.dumps(r is not None and any(math.isnan(v) for v in r)))`,
  );
  assert.equal(pythonNaN, true, "the reference returns NaNs rather than refusing");
  assert.equal(devigThreeWay(Number.NaN, 0.3, 0.3), null, "ours refuses");
});
