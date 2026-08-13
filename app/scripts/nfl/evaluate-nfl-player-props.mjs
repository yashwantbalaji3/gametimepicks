/**
 * Fit + walk-forward evaluation for the NFL player-prop heads (Program 171 · Release B).
 * PRIVATE RESEARCH.
 *
 * PROTOCOL (the P170 bridge discipline):
 *   FIT on 2023–24 REG+POST only — game-script volume model (attempts ~ margin), league
 *   per-opportunity rates, Gamma dispersion shapes, and the rate-shrink pseudo-count m
 *   (selected by walk-forward MAE inside 2023–24, never on the held-out season).
 *   TEST once on 2025: every prediction is fully pre-game (walk-forward roles/rates, Elo
 *   strength at cutoff, committed game-sim heads) → sampled distributions → scored against
 *   realized stat lines beside four baselines.
 *
 * The receipt this writes is the ONLY parameter source the runtime engine accepts.
 *
 * Usage: node scripts/nfl/evaluate-nfl-player-props.mjs --now <iso> [--runs 1000]
 * Writes: data/internal/research/nfl/reports/player-props-v1-evaluation.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SHARE_FAMILIES, familyNumerator, teamGameTotals, decayedShare } from "../../src/lib/sports/nfl/role-shares.mjs";
import { shrunkRate, simulatePlayerProps, PROP_MARKETS, NFL_PLAYER_PROPS_ID } from "../../src/lib/sports/nfl/player-props-v1.mjs";
import { strengthStateAt } from "../../src/lib/sports/nfl/model-v1.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const RUNS = Number(arg("--runs", "1000"));

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// ------------------------------------------------------------------ corpus (pinned) + joins
const bridge = read(path.join(ROOT, "data/internal/research/nfl/reports/scoring-bridge-v1.json"));
const pinned = new Map((bridge.corpusAccounting ?? []).map((a) => [a.season, a.contentHash]));
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
if (new Set(nameToAbbr.values()).size < 32) { console.error("REFUSED: name→abbr map covers <32 teams (the P170-B join lesson)"); process.exit(2); }

// finals rows for Elo strength (full names, same namespace as game home/away)
const finals = read(path.join(ROOT, "data/internal/research/nfl/corpus-v1.json")).rows;

// ------------------------------------------------------------------ 1. fit on 2023–24
const train = games.filter((g) => g.season <= 2024);
const test = games.filter((g) => g.season === 2025);

// 1a. game-script volume model: OLS attempts = a0 + a1·ownMargin
function fitVolume(rowsOf) {
  const obs = [];
  for (const g of train) {
    const homeAbbr = nameToAbbr.get(g.home);
    const awayAbbr = nameToAbbr.get(g.away);
    if (!homeAbbr || !awayAbbr) continue;
    for (const [abbr, own, opp] of [[homeAbbr, g.ftHome, g.ftAway], [awayAbbr, g.ftAway, g.ftHome]]) {
      const { totals } = teamGameTotals(g, abbr);
      const y = rowsOf(totals);
      if (y > 0) obs.push({ x: own - opp, y });
    }
  }
  const n = obs.length;
  const mx = obs.reduce((s, o) => s + o.x, 0) / n;
  const my = obs.reduce((s, o) => s + o.y, 0) / n;
  let sxy = 0; let sxx = 0;
  for (const o of obs) { sxy += (o.x - mx) * (o.y - my); sxx += (o.x - mx) ** 2; }
  const a1 = sxy / sxx;
  const a0 = my - a1 * mx;
  const sigma = Math.sqrt(obs.reduce((s, o) => s + (o.y - a0 - a1 * o.x) ** 2, 0) / (n - 2));
  return { a0: Number(a0.toFixed(4)), a1: Number(a1.toFixed(5)), sigma: Number(sigma.toFixed(4)), n };
}
const volume = { pass: fitVolume((t) => t.passAttempts), rush: fitVolume((t) => t.rushAttempts) };

// 1b. league per-opportunity rates (train Σ-ratios)
const sums = { rec: 0, targets: 0, recYds: 0, rushYds: 0, rushAtt: 0, passCmp: 0, passAtt: 0, passYds: 0, passInt: 0 };
for (const g of train) for (const p of g.players ?? []) {
  sums.rec += p.rec ?? 0; sums.targets += p.targets ?? 0; sums.recYds += p.recYds ?? 0;
  sums.rushYds += p.rushYds ?? 0; sums.rushAtt += p.rushAtt ?? 0;
  sums.passCmp += p.passCmp ?? 0; sums.passAtt += p.passAtt ?? 0; sums.passYds += p.passYds ?? 0; sums.passInt += p.passInt ?? 0;
}
const league = {
  catchRate: Number((sums.rec / sums.targets).toFixed(5)),
  ypr: Number((sums.recYds / sums.rec).toFixed(4)),
  ypc: Number((sums.rushYds / sums.rushAtt).toFixed(4)),
  compRate: Number((sums.passCmp / sums.passAtt).toFixed(5)),
  ypcmp: Number((sums.passYds / sums.passCmp).toFixed(4)),
  intRate: Number((sums.passInt / sums.passAtt).toFixed(5)),
};

// 1c. Gamma dispersion shapes by method of moments: Var(Y|n) = n·ypo²/κ  ⇒  κ = Σ n·ypo² / Σ (y − n·ypo)²
function fitShape(oppOf, ydsOf) {
  const perPlayer = new Map();
  for (const g of train) for (const p of g.players ?? []) {
    const n = oppOf(p); const y = ydsOf(p);
    if (!(n > 0)) continue;
    const acc = perPlayer.get(p.playerId) ?? { n: 0, y: 0, games: [] };
    acc.n += n; acc.y += y; acc.games.push({ n, y });
    perPlayer.set(p.playerId, acc);
  }
  let num = 0; let den = 0;
  for (const acc of perPlayer.values()) {
    if (acc.n < 30) continue; // stable per-opportunity mean first
    const ypo = acc.y / acc.n;
    for (const gm of acc.games) { num += gm.n * ypo * ypo; den += (gm.y - gm.n * ypo) ** 2; }
  }
  return Number(Math.min(30, Math.max(0.5, num / den)).toFixed(4));
}
// 1d. role-volatility concentration κ per family (Dirichlet-multinomial, MoM on train stints):
// excess of observed per-game share variance beyond binomial ⇒ (κ+1) = (1−1/N̄)·ŝ(1−ŝ)/excess.
function fitAllocKappa(family) {
  const state = new Map(); // playerId → {team, obs: [{share, N}]}
  const kappas = [];
  for (const g of train) {
    for (const abbr of new Set((g.players ?? []).map((p) => p.teamAbbr))) {
      const { totals, rows } = teamGameTotals(g, abbr);
      if (!(totals[family] > 0)) continue;
      for (const r of rows) {
        let st = state.get(r.playerId);
        if (!st || st.team !== r.teamAbbr) { st = { team: r.teamAbbr, obs: [] }; state.set(r.playerId, st); }
        st.obs.push({ share: familyNumerator(r, family) / totals[family], N: totals[family] });
      }
    }
  }
  for (const st of state.values()) {
    if (st.obs.length < 8) continue;
    const s = st.obs.reduce((a, o) => a + o.share, 0) / st.obs.length;
    if (s < 0.03) continue;
    const nBar = st.obs.reduce((a, o) => a + o.N, 0) / st.obs.length;
    const varObs = st.obs.reduce((a, o) => a + (o.share - s) ** 2, 0) / (st.obs.length - 1);
    const excess = varObs - (s * (1 - s)) / nBar;
    if (excess <= 0) continue;
    kappas.push(((1 - 1 / nBar) * s * (1 - s)) / excess - 1);
  }
  kappas.sort((a, b) => a - b);
  const median = kappas.length ? kappas[Math.floor(kappas.length / 2)] : 100;
  return Number(Math.min(500, Math.max(2, median)).toFixed(2));
}

// 1e. per-game efficiency lognormal σ per yardage market (MoM: excess per-game ypo variance
// beyond the Gamma-implied component, pooled as a robust median over qualifying players).
function fitGameSigma(oppOf, ydsOf, shape) {
  const perPlayer = new Map();
  for (const g of train) for (const p of g.players ?? []) {
    const n = oppOf(p);
    if (!(n >= 3)) continue;
    const acc = perPlayer.get(p.playerId) ?? [];
    acc.push({ n, y: ydsOf(p) ?? 0 });
    perPlayer.set(p.playerId, acc);
  }
  const sigmas = [];
  for (const gamesArr of perPlayer.values()) {
    if (gamesArr.length < 8) continue;
    const totOpp = gamesArr.reduce((s, o) => s + o.n, 0);
    const ypo = gamesArr.reduce((s, o) => s + o.y, 0) / totOpp;
    if (!(ypo > 0)) continue;
    const ypoG = gamesArr.map((o) => o.y / o.n);
    const varObs = ypoG.reduce((s, v) => s + (v - ypo) ** 2, 0) / (gamesArr.length - 1);
    const gammaVar = gamesArr.reduce((s, o) => s + (ypo * ypo) / (shape * o.n), 0) / gamesArr.length;
    const excessRatio = Math.max(0, varObs - gammaVar) / (ypo * ypo);
    sigmas.push(Math.sqrt(Math.log(1 + excessRatio)));
  }
  sigmas.sort((a, b) => a - b);
  const median = sigmas.length ? sigmas[Math.floor(sigmas.length / 2)] : 0;
  return Number(Math.min(0.8, Math.max(0, median)).toFixed(4));
}

const recShape = fitShape((p) => p.rec ?? 0, (p) => p.recYds ?? 0);
const rushShape = fitShape((p) => p.rushAtt ?? 0, (p) => p.rushYds ?? 0);
const passShape = fitShape((p) => p.passCmp ?? 0, (p) => p.passYds ?? 0);
const dispersion = {
  recShape, rushShape, passShape,
  allocKappa: {
    passAttempts: fitAllocKappa("passAttempts"),
    rushAttempts: fitAllocKappa("rushAttempts"),
    targets: fitAllocKappa("targets"),
  },
  gameSigma: {
    player_pass_yds: fitGameSigma((p) => p.passCmp ?? 0, (p) => p.passYds, passShape),
    player_rush_yds: fitGameSigma((p) => p.rushAtt ?? 0, (p) => p.rushYds, rushShape),
    player_reception_yds: fitGameSigma((p) => p.rec ?? 0, (p) => p.recYds, recShape),
  },
};

// gamesim heads: copied VERBATIM from the committed model-v1 receipt (never refit here)
const modelReceipt = read(path.join(ROOT, "data/internal/research/nfl/reports/model-v1-evaluation.json"));
const gamesim = {
  marginSlope: modelReceipt.fitParams.marginSlope,
  sigmaMargin: modelReceipt.fitParams.sigmaMargin,
  muTotal: modelReceipt.fitParams.muTotal,
  sigmaTotal: modelReceipt.fitParams.sigmaTotal,
  source: "data/internal/research/nfl/reports/model-v1-evaluation.json (committed P167-E fit, copied verbatim)",
};

// ------------------------------------------------------------------ 2. walk-forward state machinery
const RATE_HL = 8;
const BOUNDARY = 0.25; // Release A's walk-forward-selected boundary decay
const RATE_DEFS = {
  catchRate: { s: (p) => p.rec ?? 0, t: (p) => p.targets ?? 0, league: league.catchRate },
  ypr: { s: (p) => p.recYds ?? 0, t: (p) => p.rec ?? 0, league: league.ypr },
  ypc: { s: (p) => p.rushYds ?? 0, t: (p) => p.rushAtt ?? 0, league: league.ypc },
  compRate: { s: (p) => p.passCmp ?? 0, t: (p) => p.passAtt ?? 0, league: league.compRate },
  ypcmp: { s: (p) => p.passYds ?? 0, t: (p) => p.passCmp ?? 0, league: league.ypcmp },
  intRate: { s: (p) => p.passInt ?? 0, t: (p) => p.passAtt ?? 0, league: league.intRate },
};

function newState() { return new Map(); } // playerId → {team, shares:{fam:[{share,season}]}, rates:{key:[{success,trials,season}]}, recent:{market:[values]}}
function foldGame(state, g) {
  for (const abbr of new Set((g.players ?? []).map((p) => p.teamAbbr))) {
    const { totals, rows } = teamGameTotals(g, abbr);
    for (const r of rows) {
      let st = state.get(r.playerId);
      if (!st || st.team !== r.teamAbbr) { st = { team: r.teamAbbr, shares: {}, rates: {}, recent: {} }; state.set(r.playerId, st); }
      for (const fam of SHARE_FAMILIES) {
        if (!(totals[fam] > 0)) continue;
        (st.shares[fam] ??= []).push({ share: familyNumerator(r, fam) / totals[fam], season: g.season });
      }
      for (const [key, def] of Object.entries(RATE_DEFS)) {
        const trials = def.t(r);
        if (trials > 0) (st.rates[key] ??= []).push({ success: def.s(r), trials, season: g.season });
      }
      const actuals = { player_pass_yds: r.passYds, player_rush_yds: r.rushYds, player_reception_yds: r.recYds, player_receptions: r.rec };
      for (const [mkt, v] of Object.entries(actuals)) if (v != null) (st.recent[mkt] ??= []).push(v);
    }
  }
}

// m (rate shrink pseudo-trials) selected by walk-forward inside 2023–24: weighted MAE of
// per-opportunity rate predictions on 2024 (weights = trials).
function selectRateM() {
  const grid = [10, 25, 60];
  const err = new Map(grid.map((m) => [m, { sum: 0, w: 0 }]));
  const state = newState();
  for (const g of train) {
    if (g.season === 2024) {
      for (const p of g.players ?? []) {
        const st = state.get(p.playerId);
        if (!st || st.team !== p.teamAbbr) continue;
        for (const [key, def] of Object.entries(RATE_DEFS)) {
          const trials = def.t(p);
          if (!(trials > 0) || !st.rates[key]?.length) continue;
          const realized = def.s(p) / trials;
          for (const m of grid) {
            const { rate } = shrunkRate({ observations: st.rates[key], predictSeason: g.season, halfLifeGames: RATE_HL, boundaryDecay: BOUNDARY, priorTrials: m, leagueRate: def.league });
            const e = err.get(m);
            e.sum += Math.abs(rate - realized) * trials;
            e.w += trials;
          }
        }
      }
    }
    foldGame(state, g);
  }
  return grid.map((m) => ({ m, mae: err.get(m).sum / err.get(m).w })).sort((a, b) => a.mae - b.mae);
}
const rateSelection = selectRateM();
const RATE_M = rateSelection[0].m;

// ------------------------------------------------------------------ 3. held-out 2025 evaluation
const fit = { gamesim, volume, dispersion, league, rates: { halfLifeGames: RATE_HL, boundaryDecay: BOUNDARY, priorTrials: RATE_M }, receipt: "in-flight" };
const shareParams = { halfLifeGames: 4, shrinkK: 0.5, boundaryDecay: BOUNDARY }; // Release A's committed selection

const THRESH = { qbShare: 0.3, carryShare: 0.05, targetShare: 0.05 };
function candidatesFor(state, abbr, season) {
  const players = [];
  for (const [playerId, st] of state) {
    if (st.team !== abbr) continue;
    const share = (fam) => (st.shares[fam]?.length ? decayedShare({ observations: st.shares[fam], predictSeason: season, ...shareParams }).share : 0);
    const rate = (key) => shrunkRate({ observations: st.rates[key] ?? [], predictSeason: season, halfLifeGames: RATE_HL, boundaryDecay: BOUNDARY, priorTrials: RATE_M, leagueRate: RATE_DEFS[key].league }).rate;
    const qbShare = share("passAttempts");
    const carryShare = share("rushAttempts");
    const targetShare = share("targets");
    const families = new Set();
    if (qbShare >= THRESH.qbShare) families.add("passAttempts");
    if (carryShare >= THRESH.carryShare) families.add("rushAttempts");
    if (targetShare >= THRESH.targetShare) families.add("targets");
    if (!families.size) continue;
    players.push({
      playerId, families, qbShare, carryShare, targetShare,
      share: Math.max(qbShare, carryShare, targetShare),
      compRate: rate("compRate"), ypcmp: rate("ypcmp"), catchRate: rate("catchRate"), ypr: rate("ypr"), ypc: rate("ypc"), intRate: rate("intRate"),
      shareBasis: "walk-forward corpus role", recent: st.recent,
    });
  }
  return players;
}

const MARKET_ACTUAL = {
  player_pass_yds: (p) => ((p.passAtt ?? 0) > 0 ? p.passYds ?? 0 : null),
  player_rush_yds: (p) => ((p.rushAtt ?? 0) > 0 || (p.targets ?? 0) > 0 ? p.rushYds ?? 0 : null),
  player_reception_yds: (p) => ((p.targets ?? 0) > 0 || (p.rushAtt ?? 0) > 0 ? p.recYds ?? 0 : null),
  player_receptions: (p) => ((p.targets ?? 0) > 0 || (p.rushAtt ?? 0) > 0 ? p.rec ?? 0 : null),
};
const MARKET_FAMILY = { player_pass_yds: "passAttempts", player_rush_yds: "rushAttempts", player_reception_yds: "targets", player_receptions: "targets" };

const metrics = {};
for (const mkt of PROP_MARKETS) metrics[mkt] = { n: 0, mae: 0, rmse: 0, pinball: 0, cover80: 0, base: { rolling4: 0, shareVol: 0, trailing8Pinball: 0, trailing8Cover: 0, trailing8N: 0, tierMae: 0 }, cal: [] };
const tierMeans = (() => { // train league means by within-team share rank (naive role-tier baseline)
  const t = { player_pass_yds: [246], player_rush_yds: [55, 25, 10], player_reception_yds: [55, 40, 30, 22, 15], player_receptions: [4.5, 3.5, 2.8, 2.2, 1.6] };
  return (mkt, rank) => t[mkt][Math.min(rank, t[mkt].length - 1)];
})();

const state = newState();
for (const g of train) foldGame(state, g); // full 2023-24 history enters 2025 (boundary-decayed at predict time)
let evaluated = 0;
let realizedVolumeCovered = { covered: 0, total: 0 };
for (const g of test) {
  const homeAbbr = nameToAbbr.get(g.home);
  const awayAbbr = nameToAbbr.get(g.away);
  if (homeAbbr && awayAbbr) {
    const strength = strengthStateAt({ rows: finals.filter((r) => r.dateUtc < g.dateUtc), cutoffIso: g.dateUtc });
    // strength rows use full names — wrap ratingFor so abbr lookups resolve through the map
    const byName = strength.ratingFor;
    const abbrToName = new Map([[homeAbbr, g.home], [awayAbbr, g.away]]);
    const wrapped = { ...strength, ratingFor: (t) => byName(abbrToName.get(t) ?? t) };
    for (const abbr of [homeAbbr, awayAbbr]) {
      const cands = candidatesFor(state, abbr, g.season);
      if (!cands.length) continue;
      const linesProxy = {};
      for (const c of cands) {
        for (const mkt of PROP_MARKETS) {
          const r4 = (c.recent[mkt] ?? []).slice(-4);
          if (r4.length === 4) {
            const proxy = r4.reduce((a, b) => a + b, 0) / 4;
            if (proxy > 0) (linesProxy[c.playerId] ??= {})[mkt] = proxy;
          }
        }
      }
      const sim = simulatePlayerProps({
        event: { providerEventId: g.providerEventId, home: { abbr: homeAbbr }, away: { abbr: awayAbbr }, seasonType: g.seasonType },
        teamAbbr: abbr, fit, strengthState: wrapped,
        roleRates: { players: cands }, artifactDate: g.dateUtc.slice(0, 10), runs: RUNS, lines: linesProxy,
      });
      if (sim.state !== "SIMULATED") continue;
      const rowsByPlayer = new Map((g.players ?? []).filter((p) => p.teamAbbr === abbr).map((p) => [p.playerId, p]));
      for (const simP of sim.players) {
        const cand = cands.find((c) => c.playerId === simP.playerId);
        const actualRow = rowsByPlayer.get(simP.playerId);
        for (const [mkt, dist] of Object.entries(simP.markets)) {
          if (!PROP_MARKETS.includes(mkt)) continue;
          const actual = actualRow ? MARKET_ACTUAL[mkt](actualRow) : (cand.families.has(MARKET_FAMILY[mkt]) ? 0 : null);
          if (actual == null) continue; // DNP without evidence either way — participation's job, not the head's
          const m = metrics[mkt];
          m.n += 1;
          evaluated += 1;
          const err = dist.mean - actual;
          m.mae += Math.abs(err);
          m.rmse += err * err;
          const qs = [[0.10, dist.p10], [0.25, dist.p25], [0.50, dist.median], [0.75, dist.p75], [0.90, dist.p90]];
          m.pinball += qs.reduce((s, [q, v]) => s + (actual >= v ? q * (actual - v) : (1 - q) * (v - actual)), 0) / qs.length;
          m.cover80 += actual >= dist.p10 && actual <= dist.p90 ? 1 : 0;
          const recent = (cand.recent[mkt] ?? []);
          const r4 = recent.slice(-4);
          const rolling4 = r4.length ? r4.reduce((a, b) => a + b, 0) / r4.length : 0;
          m.base.rolling4 += Math.abs(rolling4 - actual);
          const fam = MARKET_FAMILY[mkt];
          const share = fam === "passAttempts" ? cand.qbShare : fam === "rushAttempts" ? cand.carryShare : cand.targetShare;
          const vol = fam === "rushAttempts" ? volume.rush.a0 : volume.pass.a0;
          const perOpp = mkt === "player_pass_yds" ? league.compRate * league.ypcmp : mkt === "player_rush_yds" ? league.ypc : mkt === "player_reception_yds" ? league.catchRate * league.ypr : league.catchRate;
          m.base.shareVol += Math.abs(share * vol * perOpp - actual);
          const t8 = recent.slice(-8).sort((a, b) => a - b);
          if (t8.length >= 4) {
            const tq = (p) => t8[Math.min(t8.length - 1, Math.floor(p * t8.length))];
            m.base.trailing8Pinball += qs.map(([q]) => q).reduce((s, q) => { const v = tq(q); return s + (actual >= v ? q * (actual - v) : (1 - q) * (v - actual)); }, 0) / 5;
            m.base.trailing8Cover += actual >= tq(0.10) && actual <= tq(0.90) ? 1 : 0;
            m.base.trailing8N += 1;
          }
          const rank = cands.filter((c) => c.families.has(fam)).sort((a, b) => b.share - a.share).findIndex((c) => c.playerId === simP.playerId);
          m.base.tierMae += Math.abs(tierMeans(mkt, Math.max(0, rank)) - actual);
          if (typeof dist.line === "number") {
            m.cal.push({ p: dist.probOverLine, hit: actual > dist.line ? 1 : 0 });
          }
        }
      }
      // realized-volume coverage: how much of the team's actual yards the evaluated pool covered
      const teamRows = [...rowsByPlayer.values()];
      const totalYds = teamRows.reduce((s, p) => s + (p.recYds ?? 0) + (p.rushYds ?? 0), 0);
      const coveredYds = teamRows.filter((p) => cands.some((c) => c.playerId === p.playerId)).reduce((s, p) => s + (p.recYds ?? 0) + (p.rushYds ?? 0), 0);
      realizedVolumeCovered.covered += coveredYds;
      realizedVolumeCovered.total += totalYds;
    }
  }
  foldGame(state, g);
}

// finalize metrics + ECE + promotion
const table = {};
for (const mkt of PROP_MARKETS) {
  const m = metrics[mkt];
  const n = m.n || 1;
  const bins = Array.from({ length: 10 }, () => ({ p: 0, hit: 0, n: 0 }));
  for (const c of m.cal) { const b = bins[Math.min(9, Math.floor(c.p * 10))]; b.p += c.p; b.hit += c.hit; b.n += 1; }
  const usable = bins.filter((b) => b.n >= 50);
  const usableN = usable.reduce((s, b) => s + b.n, 0);
  const ece = usableN ? Number(usable.reduce((s, b) => s + (b.n / usableN) * Math.abs(b.p / b.n - b.hit / b.n), 0).toFixed(4)) : null;
  table[mkt] = {
    n: m.n,
    mae: Number((m.mae / n).toFixed(3)),
    rmse: Number(Math.sqrt(m.rmse / n).toFixed(3)),
    pinball: Number((m.pinball / n).toFixed(3)),
    interval80Coverage: Number((m.cover80 / n).toFixed(4)),
    thresholdCalibration: { pairs: m.cal.length, binsUsed: usable.length, ece },
    baselines: {
      rolling4Mae: Number((m.base.rolling4 / n).toFixed(3)),
      shareVolMae: Number((m.base.shareVol / n).toFixed(3)),
      roleTierMae: Number((m.base.tierMae / n).toFixed(3)),
      trailing8Pinball: m.base.trailing8N ? Number((m.base.trailing8Pinball / m.base.trailing8N).toFixed(3)) : null,
      trailing8Cover80: m.base.trailing8N ? Number((m.base.trailing8Cover / m.base.trailing8N).toFixed(4)) : null,
      trailing8N: m.base.trailing8N,
    },
  };
}

// PROMOTION POLICY (written, applied by code): see receipt.promotionPolicy verbatim.
const promotion = {};
for (const mkt of PROP_MARKETS) {
  const t = table[mkt];
  const beatsRolling = t.mae < t.baselines.rolling4Mae;
  const beatsShareVol = t.mae < t.baselines.shareVolMae;
  const coverOk = t.interval80Coverage >= 0.72 && t.interval80Coverage <= 0.88;
  const coverLoose = t.interval80Coverage >= 0.68 && t.interval80Coverage <= 0.92;
  const calOk = t.thresholdCalibration.ece != null && t.thresholdCalibration.ece <= 0.05;
  const enoughN = t.n >= 300;
  let state2 = "RESEARCH_ONLY";
  if (beatsRolling && beatsShareVol && coverOk && calOk && enoughN) state2 = "PUBLIC_ELIGIBLE";
  else if ((beatsRolling || beatsShareVol) && coverLoose && enoughN) state2 = "SHADOW_ELIGIBLE";
  promotion[mkt] = { state: state2, evidence: { beatsRolling, beatsShareVol, coverOk, calOk, n: t.n } };
}
promotion.player_pass_int = { state: "RESEARCH_ONLY", evidence: { note: "simulated component, never separately evaluated — cannot promote" } };

const receipt = {
  schemaVersion: 1,
  artifact: "nfl-player-props-v1-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  engine: { id: NFL_PLAYER_PROPS_ID, version: 1 },
  corpusAccounting: seasons.map((s) => ({ season: s.season, games: s.games.length, contentHash: s.contentHash })),
  protocol: {
    fit: "2023–24 REG+POST only: game-script volume OLS, league Σ-rates, Gamma dispersion (MoM, ≥30-opportunity players), rate shrink m walk-forward-selected inside 2023–24",
    test: "held-out 2025, fully pre-game walk-forward chain (roles, rates, Elo cutoff, committed game-sim heads), sampled distributions, baselines on identical points",
    runs: RUNS,
    thresholds: THRESH,
  },
  fit: { gamesim, volume, dispersion, league, rates: { halfLifeGames: RATE_HL, boundaryDecay: BOUNDARY, priorTrials: RATE_M, selection: rateSelection.map((r) => ({ m: r.m, mae: Number(r.mae.toFixed(5)) })) } },
  heldOut2025: { evaluatedPlayerMarkets: evaluated, realizedYardageCoverage: Number((realizedVolumeCovered.covered / realizedVolumeCovered.total).toFixed(4)), table },
  promotionPolicy: [
    "PUBLIC_ELIGIBLE: beats rolling-4 AND share×volume on MAE; interval80 coverage in [0.72,0.88]; threshold ECE ≤ 0.05; n ≥ 300 — runtime role/line/settlement gates still apply",
    "SHADOW_ELIGIBLE: beats ≥1 point baseline; coverage in [0.68,0.92]; n ≥ 300",
    "RESEARCH_ONLY otherwise; promotion of one market never promotes siblings",
    "preseason events: every player market ABSTAINS regardless (participation contract), evidenceTier REDUCED_PRESEASON",
  ],
  promotion,
  honesty: [
    "distributions are opportunity×efficiency conditioned on the committed game-sim stream — no odds parameter exists anywhere in the engine (source-scan pinned)",
    "multinomial allocation reconciles player opportunities to team volumes per iteration by construction",
    "threshold calibration uses the rolling-4 mean as the line proxy (no historical sportsbook lines exist in this repo); P(over) is read off the true sampled distribution as a post-sampling read-out",
    "rush yards are Gamma (non-negative): true negative rushing games exist and are outside v1 support — a stated limitation",
  ],
};
fs.writeFileSync(path.join(ROOT, "data/internal/research/nfl/reports/player-props-v1-evaluation.json"), JSON.stringify(receipt, null, 1));
console.log(`player-props eval: ${evaluated} player-market points; rate m=${RATE_M}`);
for (const mkt of PROP_MARKETS) console.log(`${mkt}: n=${table[mkt].n} mae=${table[mkt].mae} (r4 ${table[mkt].baselines.rolling4Mae}, sv ${table[mkt].baselines.shareVolMae}, tier ${table[mkt].baselines.roleTierMae}) pin=${table[mkt].pinball} (t8 ${table[mkt].baselines.trailing8Pinball}) cov80=${table[mkt].interval80Coverage} ece=${table[mkt].thresholdCalibration.ece} → ${promotion[mkt].state}`);
