/**
 * P304 — the live Elo-Poisson module IS the model the blind replay scored: the score matrix delegates to it, fixture
 * names resolve through the alias table, and a dev season re-scored day by day through it reproduces the replay.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fitEloPoissonState, EPL_ELO_POISSON_MODEL_ID } from "./elo-poisson.mjs";
import { scoreMatrix, sparseSplitFlags } from "./strength-state.mjs";
import { league } from "../soccer/leagues.mjs";

const REPO = path.join(process.cwd(), "..");
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const prereg = readJson("data/internal/research/epl/reports/epl-history-replay-preregistration.json");
const evaluation = readJson("data/internal/research/epl/reports/epl-history-replay-evaluation.json");
const history = readJson("data/internal/research/soccer/epl/history-openfootball-v1.json");

test("the score matrix delegates to a state's own λ rule and publishes the same shapes", () => {
  const fake = { modelId: "fake", lambdasFor: () => ({ lamHome: 1.6, lamAway: 1.1, coldStart: { home: false, away: true } }), stats: new Map() };
  const m = scoreMatrix(fake, "A", "B");
  assert.deepEqual(m.lambdas, { home: 1.6, away: 1.1 });
  assert.equal(m.coldStart.away, true);
  assert.ok(Math.abs(m.oneXTwo.home + m.oneXTwo.draw + m.oneXTwo.away - 1) < 1e-5);
  assert.equal(m.modelId, "fake");
});

test("fixture names resolve through the alias table; an unrated club is a stated cold start; no sparse-split flag", () => {
  const state = fitEloPoissonState({ rows: history.rows, cutoffIso: "2026-09-14T00:00:00Z", frozen: prereg.frozen, aliases: league("epl").aliases });
  assert.equal(state.modelId, EPL_ELO_POISSON_MODEL_ID);
  assert.ok(Math.abs(state.supremacySlope - evaluation.supremacySlope) < 1e-4, "the warm-up slope reproduces the receipt");
  const viaAlias = state.lambdasFor("Manchester United", "Arsenal");
  const direct = state.lambdasFor("Man United", "Arsenal");
  assert.deepEqual(viaAlias, direct);
  assert.equal(viaAlias.coldStart.home, false);
  assert.ok(state.knownClubs.has("manchester united") && state.knownClubs.has("man united"));
  assert.equal(state.lambdasFor("Nowhere Town", "Arsenal").coldStart.home, true);
  assert.equal(sparseSplitFlags(state, "Manchester United", "Arsenal"), null, "a rating model has no split to be sparse");
});

test("LIVE parity: dev season 2023-24 re-scored day by day through this module reproduces the replay's log loss", () => {
  const season = history.rows.filter((r) => r.season === "2023-24");
  const days = [...new Set(season.map((r) => r.dateUtc.slice(0, 10)))].sort();
  let ll = 0;
  let n = 0;
  for (const day of days) {
    const state = fitEloPoissonState({ rows: history.rows, cutoffIso: `${day}T00:00:00Z`, frozen: prereg.frozen });
    for (const m of season.filter((r) => r.dateUtc.slice(0, 10) === day)) {
      const p = scoreMatrix(state, m.home, m.away).oneXTwo;
      ll -= Math.log(m.result === "H" ? p.home : m.result === "D" ? p.draw : p.away);
      n += 1;
    }
  }
  assert.equal(n, 380);
  assert.ok(Math.abs(ll / n - 0.9267) < 5e-4, `module log loss ${(ll / n).toFixed(5)} vs the replay's 0.9267`);
});
