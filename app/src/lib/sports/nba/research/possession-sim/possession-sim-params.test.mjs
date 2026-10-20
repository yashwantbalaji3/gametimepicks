/**
 * nba-possession-sim-v0 · every FITTED constant traces to the committed 2023-24 fit report, and Stage A is recomputed
 * from the committed box scores (the and-one / three-shot-trip MLE is checked at the reported optimum; the ratio
 * constants are recomputed exactly). NBA RESEARCH PROTOTYPE · PRIVATE_RESEARCH.
 *
 * Run (from app/): npx tsx --test src/lib/sports/nba/research/possession-sim/possession-sim-params.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FITTED, FIT_REPORT, RULES, INHERITED } from "./params.mjs";
import { derivedTeamGame } from "./profile-ext.mjs";
import { V1_PARAMS } from "../../game-sim-v1.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..", "..");
const report = JSON.parse(fs.readFileSync(path.join(ROOT, FIT_REPORT), "utf8"));

test("fit report — PRIVATE_RESEARCH, fit season 2023-24 (corpus 2024) only", () => {
  assert.equal(report.dataClass, "PRIVATE_RESEARCH");
  assert.equal(report.productEligible, false);
  assert.equal(report.fitSeason, 2024);
});

test("every FITTED constant equals the fit report's value", () => {
  for (const [k, v] of Object.entries(FITTED)) {
    assert.ok(k in report.fit, `${k} missing from ${FIT_REPORT}`);
    assert.equal(v, report.fit[k], `${k}: params ${v} ≠ report ${report.fit[k]}`);
  }
  assert.deepEqual(Object.keys(report.fit).sort(), Object.keys(FITTED).sort());
});

test("inherited and rule constants are what they claim", () => {
  assert.equal(INHERITED.MINUTES_POWER, V1_PARAMS.MINUTES_POWER);
  assert.equal(RULES.SHOT_CLOCK_DS, 240);
  assert.equal(RULES.PERSONAL_FOUL_LIMIT, 6);
  assert.deepEqual([...RULES.MANDATORY_TIMEOUT_CLOCKS_DS], [4200, 1800]);
});

test("Stage A recomputed from the committed 2023-24 box scores", () => {
  const dir = path.join(ROOT, "data/internal/research/nba/boxscores");
  const KEYS = ["fgm", "fga", "threePm", "threePa", "ftm", "fta", "oreb", "dreb", "reb", "ast", "tov", "stl", "blk", "pf", "pts", "minutes"];
  const tg = [];
  const cells = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (d.season !== 2024 || !(d.phase === 2 || d.phase === "cup-final") || !d.boxscoreAvailable) continue;
    const sums = new Map(); let complete = true;
    for (const p of d.players) {
      if (p.didNotPlay || !(Number.isInteger(p.minutes) && p.minutes > 0)) continue;
      if (KEYS.some((k) => !Number.isInteger(p[k]))) { complete = false; continue; }
      const key = `${p.fgm}|${p.minutes}`; const c = cells.get(key) ?? { fgm: p.fgm, min: p.minutes, n: 0, odd: 0 }; c.n += 1; if (p.fta % 2) c.odd += 1; cells.set(key, c);
      const t = String(p.providerTeamId); if (!sums.has(t)) sums.set(t, Object.fromEntries(KEYS.map((k) => [k, 0]))); for (const k of KEYS) sums.get(t)[k] += p[k];
    }
    const teams = d.teams.map((x) => String(x.providerTeamId));
    if (!complete || !sums.has(teams[0]) || !sums.has(teams[1])) continue;
    for (let k = 0; k < 2; k += 1) tg.push({ own: sums.get(teams[k]), opp: sums.get(teams[1 - k]) });
  }
  assert.equal(tg.length, report.stageA.teamGames);
  const S = (f) => tg.reduce((s, g) => s + f(g), 0);
  const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: recomputed ${a} vs ${b}`);
  close(S((g) => g.opp.stl) / S((g) => g.own.tov), FITTED.STEAL_SHARE_OF_TOV, 5e-5, "STEAL_SHARE_OF_TOV");
  const ft = { theta: FITTED.AND_ONE_PER_FGM, tau: FITTED.THREE_SHOT_TRIPS_PER_MIN };
  const live = (g) => { const x = derivedTeamGame(g.own, g.opp, ft); return (g.own.fga - g.own.fgm) + (x.trips2 + x.trips3 + x.andOnes) * (g.own.fta > 0 ? 1 - g.own.ftm / g.own.fta : 0); };
  close(S((g) => g.own.oreb + g.opp.dreb) / S(live), FITTED.PLAYER_REBOUND_SHARE, 5e-5, "PLAYER_REBOUND_SHARE");
  // the (θ, τ) optimum: the log-likelihood at the reported point beats its grid neighbours
  const arr = [...cells.values()];
  const ll = (th, ta) => arr.reduce((s, c) => { const po = Math.min(1 - 1e-12, Math.max(1e-12, (1 - (1 - 2 * th) ** c.fgm * Math.exp(-2 * ta * c.min)) / 2)); return s + c.odd * Math.log(po) + (c.n - c.odd) * Math.log(1 - po); }, 0);
  const at = ll(ft.theta, ft.tau);
  for (const [dt, du] of [[0.002, 0], [-0.002, 0], [0, 0.00005], [0, -0.00005]]) assert.ok(at >= ll(ft.theta + dt, Math.max(0, ft.tau + du)), `parity MLE not at an optimum (${dt}, ${du})`);
});
