/**
 * Walk-forward anytime-TD calibration (Program 171 · Release C). PRIVATE RESEARCH.
 *
 * The runtime chain, replayed pre-game over held-out 2025: Elo strength at cutoff → committed
 * game-sim score means (the REAL simulator, 2k deterministic runs) → committed P170-B points→TD
 * bridge λ → Poisson team-TD distribution → Release-A walk-forward scorer shares →
 * P(anytime) = 1 − Σ P(K=k)(1−share)^k, scored against actual scorer credit.
 *
 * POPULATION: players with walk-forward scorer share ≥ 0.02 who PLAYED (DNP voids the market,
 * so voids are excluded from calibration exactly as settlement excludes them — stated, not hidden).
 *
 * BASELINES: constant-λ (the bridge's own null, λ = train mean) with the same shares; and the
 * train-population base rate (no-skill floor).
 *
 * This receipt IS the td-engine `calibration` gate evidence.
 *
 * Usage: node scripts/nfl/evaluate-nfl-anytime-td.mjs --now <iso>
 * Writes: data/internal/research/nfl/reports/anytime-td-v1-calibration.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SHARE_FAMILIES, familyNumerator, teamGameTotals, decayedShare } from "../../src/lib/sports/nfl/role-shares.mjs";
import { teamTdDistribution, anytimeTdProbability, loadScoringBridgeMapping, NFL_TD_ENGINE_ID } from "../../src/lib/sports/nfl/td-engine.mjs";
import { simulateNflGame } from "../../src/lib/sports/nfl/game-sim.mjs";
import { strengthStateAt } from "../../src/lib/sports/nfl/model-v1.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const bridgeReceipt = read(path.join(ROOT, "data/internal/research/nfl/reports/scoring-bridge-v1.json"));
const pinned = new Map((bridgeReceipt.corpusAccounting ?? []).map((a) => [a.season, a.contentHash]));
const seasons = [2023, 2024, 2025].map((season) => {
  const part = read(path.join(ROOT, `data/internal/research/nfl/player-events-v1/${season}.json`));
  if (part.contentHash !== pinned.get(season)) { console.error(`REFUSED: ${season} corpus hash mismatch`); process.exit(2); }
  return part;
});
const games = seasons.flatMap((s) => s.games)
  .filter((g) => (g.seasonType ?? 0) !== 1)
  .sort((a, b) => (a.dateUtc < b.dateUtc ? -1 : a.dateUtc > b.dateUtc ? 1 : a.providerEventId < b.providerEventId ? -1 : 1));

const schedule = read(path.join(APP, "public/data/nfl/schedule/latest.json"));
const nameToAbbr = new Map();
for (const r of schedule.rows) { nameToAbbr.set(r.home.name, r.home.abbr); nameToAbbr.set(r.away.name, r.away.abbr); }
if (new Set(nameToAbbr.values()).size < 32) { console.error("REFUSED: name→abbr map covers <32 teams"); process.exit(2); }
const finals = read(path.join(ROOT, "data/internal/research/nfl/corpus-v1.json")).rows;
const modelReceipt = read(path.join(ROOT, "data/internal/research/nfl/reports/model-v1-evaluation.json"));
const gamesimFit = { params: modelReceipt.fitParams };
const mapping = loadScoringBridgeMapping({ fs, path, cwd: APP });
if (!mapping?.receipt) { console.error("REFUSED: no committed scoring-bridge mapping"); process.exit(2); }
const constLambda = bridgeReceipt.metrics?.baselineConstant?.lambda ?? null;
if (!(constLambda > 0)) { console.error("REFUSED: bridge receipt carries no constant-λ baseline"); process.exit(2); }

// Release A's hl/boundary carry over. Two scorerTd-specific knobs get their own selection on
// 2024 walk-forward logLoss (2023 burn-in), tested ONCE on 2025 — never tuned on the held-out
// season: the shrink k, and a POOL-FLATTENING β that blends each candidate share toward the
// pool mean (s' = (1−β)s + β·S/n). Flattening preserves Σ shares (and the residual) exactly,
// so team-compatibility survives — a probability-level recalibration would break it.
const HL = 4;
const BOUNDARY = 0.25;
const TD_SHRINK_GRID = [0.5, 2, 4];
const TD_FLATTEN_GRID = [0, 0.25, 0.5, 0.75];
const MIN_SHARE = 0.02;
const flatten = (shares, beta) => {
  const S = shares.reduce((a, s) => a + s, 0);
  const mean = shares.length ? S / shares.length : 0;
  return shares.map((s) => (1 - beta) * s + beta * mean);
};

// walk-forward scorer-share state (stint-reset, preseason excluded upstream)
const state = new Map(); // playerId → {team, obs:[{share,season}]}
function foldGame(g) {
  for (const abbr of new Set((g.players ?? []).map((p) => p.teamAbbr))) {
    const { totals, rows } = teamGameTotals(g, abbr);
    for (const r of rows) {
      let st = state.get(r.playerId);
      if (!st || st.team !== r.teamAbbr) { st = { team: r.teamAbbr, obs: [] }; state.set(r.playerId, st); }
      if (totals.scorerTd > 0) st.obs.push({ share: familyNumerator(r, "scorerTd") / totals.scorerTd, season: g.season });
    }
  }
}

const train = games.filter((g) => g.season <= 2024);
const test = games.filter((g) => g.season === 2025);

// One pass over train: fold state, collect the train base rate, and score every (k, β) on
// 2024 walk-forward logLoss (each game predicted before it folds; pool assembled per team).
const gridLL = new Map();
for (const k of TD_SHRINK_GRID) for (const b of TD_FLATTEN_GRID) gridLL.set(`${k}|${b}`, { ll: 0, n: 0 });
let trainPos = 0;
let trainN = 0;
const clamp = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
for (const g of train) {
  const homeAbbr = nameToAbbr.get(g.home);
  const awayAbbr = nameToAbbr.get(g.away);
  const scoreSelection = g.season === 2024 && homeAbbr && awayAbbr;
  let sim = null;
  if (scoreSelection) {
    const strength = strengthStateAt({ rows: finals.filter((r) => r.dateUtc < g.dateUtc), cutoffIso: g.dateUtc });
    const abbrToName = new Map([[homeAbbr, g.home], [awayAbbr, g.away]]);
    const wrapped = { ...strength, ratingFor: (t) => strength.ratingFor(abbrToName.get(t) ?? t) };
    sim = simulateNflGame({ fit: gamesimFit, strengthState: wrapped, event: { providerEventId: g.providerEventId, home: { abbr: homeAbbr }, away: { abbr: awayAbbr }, seasonType: g.seasonType }, artifactDate: g.dateUtc.slice(0, 10), runs: 2000 });
  }
  for (const abbr of new Set((g.players ?? []).map((p) => p.teamAbbr))) {
    const rowsByPlayer = new Map((g.players ?? []).filter((p) => p.teamAbbr === abbr).map((p) => [p.playerId, p]));
    const side = abbr === homeAbbr ? "home" : "away";
    const teamTd = sim?.state === "SIMULATED" ? teamTdDistribution({ expectedPoints: sim.scores[side].mean, mapping }) : null;
    // assemble the eligible pool first — flattening is a POOL property
    const pool = [];
    for (const [playerId, st] of state) {
      if (st.team !== abbr || !st.obs.length) continue;
      const row = rowsByPlayer.get(playerId);
      if (!row) continue; // DNP → void, excluded exactly as settlement excludes it
      const gateShare = decayedShare({ observations: st.obs, predictSeason: g.season, halfLifeGames: HL, shrinkK: 0.5, boundaryDecay: BOUNDARY }).share;
      if (gateShare < MIN_SHARE) continue;
      pool.push({ playerId, obs: st.obs, outcome: ((row.rushTd ?? 0) + (row.recTd ?? 0)) >= 1 ? 1 : 0 });
    }
    trainN += pool.length;
    trainPos += pool.reduce((s, c) => s + c.outcome, 0);
    if (teamTd?.state === "OK" && pool.length) {
      for (const k of TD_SHRINK_GRID) {
        const raw = pool.map((c) => decayedShare({ observations: c.obs, predictSeason: g.season, halfLifeGames: HL, shrinkK: k, boundaryDecay: BOUNDARY }).share);
        for (const b of TD_FLATTEN_GRID) {
          const flat = flatten(raw, b);
          const e = gridLL.get(`${k}|${b}`);
          pool.forEach((c, i) => {
            const p = anytimeTdProbability({ teamTd, perTdShare: flat[i] });
            if (p.state !== "OK") return;
            e.ll += c.outcome ? -Math.log(clamp(p.probability)) : -Math.log(1 - clamp(p.probability));
            e.n += 1;
          });
        }
      }
    }
  }
  foldGame(g);
}
const selection = [...gridLL.entries()].map(([key, e]) => {
  const [k, b] = key.split("|").map(Number);
  return { k, beta: b, logLoss: Number((e.ll / e.n).toFixed(4)), n: e.n };
}).sort((a, b) => a.logLoss - b.logLoss);
const TD_SHRINK = selection[0].k;
const TD_FLATTEN = selection[0].beta;
const SHARE_PARAMS = { halfLifeGames: HL, shrinkK: TD_SHRINK, boundaryDecay: BOUNDARY };
const trainBase = { rate: trainPos / trainN, n: trainN };

// held-out 2025
const preds = []; // {p, pConst, outcome, share}
let refusedSims = 0;
for (const g of test) {
  const homeAbbr = nameToAbbr.get(g.home);
  const awayAbbr = nameToAbbr.get(g.away);
  if (homeAbbr && awayAbbr) {
    const strength = strengthStateAt({ rows: finals.filter((r) => r.dateUtc < g.dateUtc), cutoffIso: g.dateUtc });
    const abbrToName = new Map([[homeAbbr, g.home], [awayAbbr, g.away]]);
    const wrapped = { ...strength, ratingFor: (t) => strength.ratingFor(abbrToName.get(t) ?? t) };
    const sim = simulateNflGame({ fit: gamesimFit, strengthState: wrapped, event: { providerEventId: g.providerEventId, home: { abbr: homeAbbr }, away: { abbr: awayAbbr }, seasonType: g.seasonType }, artifactDate: g.dateUtc.slice(0, 10), runs: 2000 });
    if (sim.state !== "SIMULATED") { refusedSims += 1; }
    else {
      for (const [abbr, side] of [[homeAbbr, "home"], [awayAbbr, "away"]]) {
        const teamTd = teamTdDistribution({ expectedPoints: sim.scores[side].mean, mapping });
        const teamTdConst = teamTdDistribution({ expectedPoints: (constLambda - mapping.lambdaIntercept) / mapping.lambdaPerPoint, mapping });
        if (teamTd.state !== "OK" || teamTdConst.state !== "OK") continue;
        const rowsByPlayer = new Map((g.players ?? []).filter((p) => p.teamAbbr === abbr).map((p) => [p.playerId, p]));
        const pool = [];
        for (const [playerId, st] of state) {
          if (st.team !== abbr || !st.obs.length) continue;
          // population gate is a FIXED rule (k=0.5) so selection and test grade the same players
          const gateShare = decayedShare({ observations: st.obs, predictSeason: g.season, halfLifeGames: HL, shrinkK: 0.5, boundaryDecay: BOUNDARY }).share;
          if (gateShare < MIN_SHARE) continue;
          const row = rowsByPlayer.get(playerId);
          if (!row) continue;
          pool.push({ obs: st.obs, outcome: ((row.rushTd ?? 0) + (row.recTd ?? 0)) >= 1 ? 1 : 0 });
        }
        if (!pool.length) continue;
        const raw = pool.map((c) => decayedShare({ observations: c.obs, predictSeason: g.season, ...SHARE_PARAMS }).share);
        const flat = flatten(raw, TD_FLATTEN);
        pool.forEach((c, i) => {
          const p = anytimeTdProbability({ teamTd, perTdShare: flat[i] });
          const pc = anytimeTdProbability({ teamTd: teamTdConst, perTdShare: flat[i] });
          if (p.state !== "OK" || pc.state !== "OK") return;
          preds.push({ p: p.probability, pConst: pc.probability, outcome: c.outcome, share: flat[i] });
        });
      }
    }
  }
  foldGame(g);
}

const score = (get) => {
  let ll = 0; let br = 0;
  for (const d of preds) { const p = clamp(get(d)); ll += d.outcome ? -Math.log(p) : -Math.log(1 - p); br += (p - d.outcome) ** 2; }
  return { logLoss: Number((ll / preds.length).toFixed(4)), brier: Number((br / preds.length).toFixed(4)) };
};
const model = score((d) => d.p);
const constant = score((d) => d.pConst);
const base = score(() => trainBase.rate);

const bins = Array.from({ length: 10 }, () => ({ p: 0, hit: 0, n: 0 }));
for (const d of preds) { const b = bins[Math.min(9, Math.floor(d.p * 10))]; b.p += d.p; b.hit += d.outcome; b.n += 1; }
const usable = bins.map((b, i) => ({ bin: `${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}`, n: b.n, meanPredicted: b.n ? Number((b.p / b.n).toFixed(4)) : null, actualRate: b.n ? Number((b.hit / b.n).toFixed(4)) : null })).filter((b) => b.n >= 50);
const usableN = usable.reduce((s, b) => s + b.n, 0);
const ece = Number(usable.reduce((s, b) => s + (b.n / usableN) * Math.abs(b.meanPredicted - b.actualRate), 0).toFixed(4));

const positives = preds.reduce((s, d) => s + d.outcome, 0);
const receipt = {
  schemaVersion: 1,
  artifact: "nfl-anytime-td-v1-calibration",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  engine: { id: NFL_TD_ENGINE_ID, version: 1 },
  mappingReceipt: mapping.receipt,
  corpusAccounting: seasons.map((s) => ({ season: s.season, games: s.games.length, contentHash: s.contentHash })),
  protocol: {
    chain: "Elo cutoff → committed game-sim score means (2k deterministic runs) → committed bridge λ → Poisson team TD → walk-forward scorer shares → engine P(anytime)",
    population: `walk-forward scorer share ≥ ${MIN_SHARE} at the FIXED k=0.5 gate AND played (DNP voids excluded exactly as settlement voids them)`,
    tdShrinkSelection: "scorerTd shrink selected on 2024 walk-forward logLoss (2023 burn-in) because TD shares regress far harder than opportunity shares; tested ONCE on 2025",
    heldOut: "2025 REG+POST; shares/strength walk-forward; nothing in the chain sees the game being scored",
  },
  shareParams: { halfLifeGames: HL, boundaryDecay: BOUNDARY, tdShrink: TD_SHRINK, poolFlattenBeta: TD_FLATTEN, selectionTop5: selection.slice(0, 5), selectionWorst: selection[selection.length - 1] },
  consumerContract: "board builders must apply the SAME pool flattening to the eligible pool's raw decayed shares (s' = (1−β)s + β·S/n) — Σ shares and the residual are preserved exactly, so validateAllocation still holds",
  heldOut2025: {
    n: preds.length,
    positives,
    classBalance: Number((positives / preds.length).toFixed(4)),
    refusedSims,
    model,
    baselines: { constantLambdaSameShares: constant, trainBaseRate: { ...base, rate: Number(trainBase.rate.toFixed(4)), trainN: trainBase.n } },
    reliability: usable,
    ece,
  },
  honesty: [
    "calibration conditions on having played — it grades the market the way the market settles (DNP = void), and says so",
    "first-TD / last-TD / 2+ TD remain DISABLED research surfaces with no calibration receipt of their own",
    "preseason boards remain MODELLED_NOT_PUBLISHABLE regardless of this receipt: participation and price gates are separate",
  ],
};
fs.writeFileSync(path.join(ROOT, "data/internal/research/nfl/reports/anytime-td-v1-calibration.json"), JSON.stringify(receipt, null, 1));
console.log(`anytime-TD calibration: n=${preds.length} (+${positives}) — model LL ${model.logLoss} / Brier ${model.brier} vs const-λ ${constant.logLoss}/${constant.brier} vs base ${base.logLoss}/${base.brier}; ECE ${ece}; bins ${usable.length}`);
