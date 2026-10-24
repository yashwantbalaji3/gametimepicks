import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildReport, renderMarkdown, pairedSpread, logLoss, MIN_N_FOR_INTERVAL, REPO_ROOT } from "./report-nba-model-disagreement.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "report-nba-model-disagreement.mjs");

const player = (id, min, p50, mean, playRate) => ({ providerAthleteId: id, name: `P${id}`, expectedMinutes: min, pts: { p50, mean }, ...(playRate == null ? {} : { playRate }) });
const sim = (pHome, h, a) => ({ pHome, pAway: 1 - pHome, home: { p50: h, mean: h }, away: { p50: a, mean: a }, margin: { p50: h - a }, total: { p50: h + a } });
function game(id, tip, eloP, simP, h, a, players) {
  return {
    providerEventId: id, dateUtc: tip,
    home: { abbr: `H${id}`, providerTeamId: `h${id}` }, away: { abbr: `A${id}`, providerTeamId: `a${id}` },
    forecast: { elo: { pHome: eloP }, sim: sim(simP, h, a), publishedSide: eloP > 0.5 ? "HOME" : "AWAY", players },
  };
}
// Game 1 (contradiction): Elo favours HOME 0.60; v0.1 sim favours AWAY 0.40; v0.3 sim favours AWAY 0.45; v1 agrees 0.55.
// Game 2 (agreement): Elo favours AWAY 0.30; every sim favours AWAY.
function fixture() {
  const pl = { home: [player("1", 30, 20, 21), player("2", 0, 0, 0)], away: [player("3", 25, 15, 16)] };
  const v01 = { games: [game("2", "2026-10-24T02:00Z", 0.3, 0.35, 100, 110, pl), game("1", "2026-10-24T00:00Z", 0.6, 0.4, 100, 105, pl)] };
  const v1 = { games: [{ ...game("1", "2026-10-24T00:00Z", 0.62, 0.55, 110, 108, { home: [player("1", 32, 20, 22, 0.5)], away: [] }) }, game("2", "2026-10-24T02:00Z", 0.31, 0.33, 101, 109, pl)] };
  const v03 = { games: [game("1", "2026-10-24T00:00Z", 0.6, 0.45, 108, 110, pl), game("2", "2026-10-24T02:00Z", 0.3, 0.2, 98, 112, pl)] };
  const lane = { games: [{ providerEventId: "1", elo: { favoured: "H1" }, teamScores: { state: "WITHHELD" }, players: { home: [{ medians: { pts: 20 } }], away: [] } }], withheld: { teamScores: "withheld (fixture)" } };
  const finals = [{ providerEventId: "1", ftHome: 101, ftAway: 99, winnerSide: "home", phase: "REGULAR" }];
  return { dates: ["2026-10-24"], byDate: { "2026-10-24": { v01, v1, v03, lane } }, finals };
}

const hasKey = (o, k) => (Array.isArray(o) ? o.some((x) => hasKey(x, k)) : o && typeof o === "object" ? Object.keys(o).some((x) => x === k || hasKey(o[x], k)) : false);

test("synthetic contradiction fixture: side contradictions, gaps, player sums, descriptive scores", () => {
  const rep = buildReport(fixture());
  const s = rep.slates[0];
  assert.equal(s.n.games, 2);
  assert.deepEqual(s.games.map((g) => g.providerEventId), ["1", "2"], "games are ordered by tip, not by file order");
  const g1 = s.games[0];
  assert.equal(g1.official.eloSide, "HOME");
  assert.equal(g1.side.v01Sim.contradictsElo, true);
  assert.equal(g1.side.v01Sim.gapVsElo, -0.2);
  assert.equal(g1.side.v03Sim.contradictsElo, true);
  assert.equal(g1.side.v1Sim.contradictsElo, false);
  assert.equal(g1.official.publicLaneMatchesElo, true);
  assert.equal(s.summary.side.v01Sim.contradictions, 1);
  assert.deepEqual(s.summary.side.v01Sim.contradictionGames.map((c) => c.providerEventId), ["1"]);
  assert.equal(s.summary.side.v03Sim.contradictions, 1);
  assert.equal(s.summary.side.v1Sim.contradictions, 0);
  assert.equal(s.summary.side.v01Sim.meanAbsGapVsElo, 0.125); // (0.20 + 0.05) / 2
  assert.equal(g1.teamScores.v01Sim.medianSideContradictsElo, true); // 100–105 against an Elo HOME side
  // only rows with expectedMinutes > 0 count; v1 means are weighted by playRate
  assert.equal(g1.playerSums.v01.home.rows, 1);
  assert.equal(g1.playerSums.v01.home.sumPtsP50, 20);
  assert.equal(g1.playerSums.v01.home.gapSumP50MinusSimP50, -80);
  assert.equal(g1.playerSums.v1.home.sumPtsMeanXPlayRate, 11);
  assert.equal(g1.v01VsOtherSims.home.minusV1SimP50, -90);
  // descriptive scoring, one final
  assert.equal(s.n.finals, 1);
  assert.equal(g1.result.scores.elo.logLoss, Math.round(-Math.log(0.6) * 1e4) / 1e4);
  assert.equal(g1.result.officialSideCorrect, true);
  assert.equal(s.summary.vsElo.v01Sim.logLoss.n, 1);
  assert.equal(s.summary.vsElo.v01Sim.logLoss.verdict, "not distinguishable at this n");
  assert.equal(s.summary.vsElo.v01Sim.logLoss.interval95, null);
  assert.equal(rep.changesOfficialValues, false);
  assert.equal(rep.productEligible, false);
});

test("determinism: same inputs → byte-identical JSON and markdown, no wall-clock fields", () => {
  const a = buildReport(fixture()), b = buildReport(fixture());
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(renderMarkdown(a), renderMarkdown(b));
  assert.equal(hasKey(a, "generatedAt"), false);
  assert.equal(hasKey(a, "now"), false);
});

test("pairedSpread: no interval and no claim below the minimum n; seeded and repeatable at or above it", () => {
  const small = pairedSpread([-0.5, -0.4, -0.3]);
  assert.equal(small.interval95, null);
  assert.equal(small.verdict, "not distinguishable at this n");
  const diffs = Array.from({ length: MIN_N_FOR_INTERVAL }, (_, i) => -0.1 - (i % 3) * 0.01);
  const big1 = pairedSpread(diffs), big2 = pairedSpread(diffs);
  assert.deepEqual(big1, big2);
  assert.ok(big1.interval95[1] < 0);
  const mixed = pairedSpread(Array.from({ length: MIN_N_FOR_INTERVAL }, (_, i) => (i % 2 ? 0.3 : -0.3)));
  assert.equal(mixed.verdict, "not distinguishable at this n");
  assert.ok(logLoss(0, 1) < 14, "p is clipped, never infinite");
});

test("CLI: fixture root → identical stdout and --json across runs; --json inside the repo is refused", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nba-disagreement-"));
  try {
    const fx = fixture();
    const write = (rel, doc) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), JSON.stringify(doc)); };
    const d = "2026-10-24";
    write(`data/internal/research/nba/experimental-v0.1/forecasts/${d}.json`, fx.byDate[d].v01);
    write(`data/internal/research/nba/experimental-v1/forecasts/${d}.json`, fx.byDate[d].v1);
    write(`app/public/data/nba/experimental-public/${d}.json`, fx.byDate[d].lane);
    write("app/public/data/nba/results/finals-2026-27.json", { finals: fx.finals });
    const run = (out) => spawnSync(process.execPath, [SCRIPT, "--dates", d, "--root", tmp, "--json", out], { encoding: "utf8" });
    const r1 = run(path.join(tmp, "out", "a.json")), r2 = run(path.join(tmp, "out", "b.json"));
    assert.equal(r1.status, 0, r1.stderr);
    assert.equal(r1.stdout, r2.stdout);
    assert.equal(fs.readFileSync(path.join(tmp, "out", "a.json"), "utf8"), fs.readFileSync(path.join(tmp, "out", "b.json"), "utf8"));
    assert.match(r1.stdout, /v0\.3 sim \| 0 \|/, "an absent v0.3 file is n=0, not a crash");
    const inside = path.join(REPO_ROOT, "app", "scripts", "nba", "research", "__should_not_exist__.json");
    const bad = run(inside);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /REFUSED: --json .* is inside the repository/);
    assert.equal(fs.existsSync(inside), false);
    const noOfficial = spawnSync(process.execPath, [SCRIPT, "--dates", "2026-10-25", "--root", tmp], { encoding: "utf8" });
    assert.equal(noOfficial.status, 1);
    assert.match(noOfficial.stderr, /REFUSED: missing .*experimental-v0\.1/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
