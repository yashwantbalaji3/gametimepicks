/**
 * Build NFL role shares + walk-forward evaluation (Program 171 · Release A). PRIVATE RESEARCH.
 *
 * PROTOCOL (leakage-safe, mirrors the P170 scoring bridge):
 *   - hyperparameters (half-life, shrink k, season-boundary decay) selected by walk-forward on
 *     2023–24 REG+POST team-games only;
 *   - the chosen setting is applied ONCE to held-out 2025 and compared against four baselines
 *     (last-game, rolling-4, stint-mean, uniform) on the same eval points;
 *   - preseason games update team MEMBERSHIP (stint effective-dating) but never contribute or
 *     receive share observations — coach scripts are not roles.
 *
 * CORPUS PINNING: refuses unless each season partition's contentHash matches the committed
 * accounting inside the P170 scoring-bridge receipt — role shares must derive from the exact
 * bytes the bridge was fit on, or say why not.
 *
 * Usage: node scripts/nfl/build-nfl-role-shares.mjs --now <iso>
 * Writes: data/internal/research/nfl/reports/role-shares-v1.json          (evaluation receipt)
 *         data/internal/research/nfl/role-shares-v1/current.json          (current-team shares)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  NFL_ROLE_SHARES_VERSION, NFL_ROLE_SHARES_ID, SHARE_FAMILIES,
  familyNumerator, teamGameTotals, decayedShare, tvDistance, predictAllocation, realizedAllocation, validateShareBlock,
} from "../../src/lib/sports/nfl/role-shares.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required — this script never reads a live clock"); process.exit(1); }

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// ---------------------------------------------------------------------------------------------
// 1. Load + pin the corpus against the committed bridge receipt.
const bridge = read(path.join(ROOT, "data/internal/research/nfl/reports/scoring-bridge-v1.json"));
const pinned = new Map((bridge.corpusAccounting ?? []).map((a) => [a.season, a.contentHash]));
if (pinned.size !== 3) { console.error("REFUSED: bridge receipt does not pin 3 corpus seasons"); process.exit(2); }
const seasons = [2023, 2024, 2025].map((season) => {
  const part = read(path.join(ROOT, `data/internal/research/nfl/player-events-v1/${season}.json`));
  if (part.contentHash !== pinned.get(season)) {
    console.error(`REFUSED: ${season} corpus contentHash ${part.contentHash} ≠ pinned ${pinned.get(season)} — role shares must derive from the exact bridge corpus`);
    process.exit(2);
  }
  return part;
});
const allGames = seasons.flatMap((s) => s.games).sort((a, b) => (a.dateUtc < b.dateUtc ? -1 : a.dateUtc > b.dateUtc ? 1 : a.providerEventId < b.providerEventId ? -1 : 1));

// ---------------------------------------------------------------------------------------------
// 2. One chronological pass collecting walk-forward eval points (obs snapshots are copies).
//    playerState: playerId → { team, obs: {fam: [[share, season], …]} } — obs reset on team change.
function collectEvalPoints() {
  const playerState = new Map();
  const points = []; // {season, seasonType, week, teamAbbr, family, candidates:[{playerId, obs}], realizedRows}
  for (const game of allGames) {
    const isPre = (game.seasonType ?? 0) === 1;
    for (const teamAbbr of new Set((game.players ?? []).map((p) => p.teamAbbr))) {
      const { totals, rows } = teamGameTotals(game, teamAbbr);
      if (!isPre) {
        for (const family of SHARE_FAMILIES) {
          if (!(totals[family] > 0)) continue;
          const candidates = [];
          for (const [playerId, st] of playerState) {
            if (st.team !== teamAbbr) continue;
            const obs = st.obs[family];
            if (obs && obs.length) candidates.push({ playerId, obs: obs.slice() });
          }
          if (candidates.length) points.push({ season: game.season, seasonType: game.seasonType, week: game.week, teamAbbr, family, candidates, rows });
        }
      }
      // fold membership + observations AFTER prediction (strict pre-game cutoff)
      for (const r of rows) {
        let st = playerState.get(r.playerId);
        if (!st || st.team !== r.teamAbbr) { st = { team: r.teamAbbr, obs: {} }; playerState.set(r.playerId, st); } // stint reset
        if (isPre) continue; // membership only — preseason usage is not a role observation
        for (const family of SHARE_FAMILIES) {
          if (!(totals[family] > 0)) continue;
          const v = familyNumerator(r, family);
          (st.obs[family] ??= []).push([v / totals[family], game.season]);
        }
      }
    }
  }
  return { points, playerState };
}
const { points, playerState } = collectEvalPoints();

// ---------------------------------------------------------------------------------------------
// 3. Score a predictor over eval points → mean TV distance per family (+ overall).
function scorePoints(evalPoints, predictFor) {
  const acc = Object.fromEntries(SHARE_FAMILIES.map((f) => [f, { sum: 0, n: 0 }]));
  for (const pt of evalPoints) {
    const { shares, other } = predictFor(pt);
    const known = new Set(Object.keys(shares));
    const real = realizedAllocation({ rows: pt.rows, family: pt.family, knownPlayerIds: known });
    if (real.empty) continue;
    const tv = tvDistance({ ...shares, OTHER: other }, { ...real.shares, OTHER: real.other });
    acc[pt.family].sum += tv;
    acc[pt.family].n += 1;
  }
  const per = {};
  let sum = 0, n = 0;
  for (const f of SHARE_FAMILIES) { per[f] = acc[f].n ? acc[f].sum / acc[f].n : null; sum += acc[f].sum; n += acc[f].n; }
  return { perFamily: per, overall: n ? sum / n : null, n };
}

const estimatorPredict = (params) => (pt) => predictAllocation({
  history: pt.candidates.map((c) => [c.playerId, c.obs.map(([share, season]) => ({ share, season }))]),
  predictSeason: pt.season,
  params,
});

// Baselines share the renormalize/OTHER treatment via predictAllocation-compatible outputs.
function baselinePredict(kind) {
  return (pt) => {
    const shares = {};
    let sum = 0;
    for (const c of pt.candidates) {
      const s = c.obs.map(([share]) => share);
      let v = 0;
      if (kind === "last-game") v = s[s.length - 1];
      else if (kind === "rolling-4") { const w = s.slice(-4); v = w.reduce((a, b) => a + b, 0) / w.length; }
      else if (kind === "stint-mean") v = s.reduce((a, b) => a + b, 0) / s.length;
      else if (kind === "uniform") v = 1 / pt.candidates.length;
      if (v > 0) { shares[c.playerId] = v; sum += v; }
    }
    if (sum > 1) { for (const k of Object.keys(shares)) shares[k] /= sum; sum = 1; }
    return { shares, other: Math.max(0, 1 - sum) };
  };
}

// ---------------------------------------------------------------------------------------------
// 4. Selection on 2023–24 only; test ONCE on 2025.
const selectionPoints = points.filter((p) => p.season <= 2024);
const testPoints = points.filter((p) => p.season === 2025);
const GRID = [];
for (const halfLifeGames of [2, 4, 8, Infinity]) for (const shrinkK of [0.5, 1, 2]) for (const boundaryDecay of [0.25, 0.5, 1]) GRID.push({ halfLifeGames, shrinkK, boundaryDecay });

const gridResults = GRID.map((params) => ({ params, train: scorePoints(selectionPoints, estimatorPredict(params)) }))
  .sort((a, b) => a.train.overall - b.train.overall);
const chosen = gridResults[0].params;

const test = scorePoints(testPoints, estimatorPredict(chosen));
const baselines = Object.fromEntries(["last-game", "rolling-4", "stint-mean", "uniform"].map((k) => [k, scorePoints(testPoints, baselinePredict(k))]));
const earlySeasonTest = scorePoints(testPoints.filter((p) => p.seasonType === 2 && p.week <= 4), estimatorPredict(chosen));

// ---------------------------------------------------------------------------------------------
// 5. Current-team artifact: corpus stints joined to the CURRENT roster (effective-dated), 2026.
const roster = read(path.join(APP, "public/data/nfl/rosters/latest.json"));
const rosterAbbrs = new Set(roster.teams.map((t) => t.teamAbbr));
const corpusAbbrs = new Set(allGames.flatMap((g) => (g.players ?? []).map((p) => p.teamAbbr)));
if (rosterAbbrs.size !== 32 || [...corpusAbbrs].some((a) => !rosterAbbrs.has(a))) {
  console.error("REFUSED: roster/corpus team-abbr sets disagree — identity is never string-guessed");
  process.exit(3);
}

// team volume context: decayed mean of 2025 REG+POST totals per team (halfLife 8)
const teamVolumes = new Map();
for (const game of allGames) {
  if (game.season !== 2025 || (game.seasonType ?? 0) === 1) continue;
  for (const teamAbbr of new Set((game.players ?? []).map((p) => p.teamAbbr))) {
    const { totals } = teamGameTotals(game, teamAbbr);
    const arr = teamVolumes.get(teamAbbr) ?? [];
    arr.push(totals);
    teamVolumes.set(teamAbbr, arr);
  }
}
const decayedMean = (values) => {
  let num = 0, wsum = 0;
  values.forEach((v, i) => { const w = 0.5 ** ((values.length - 1 - i) / 8); num += w * v; wsum += w; });
  return wsum ? num / wsum : null;
};

const PREDICT_SEASON = 2026;
const MIN_SHARE = 0.005;
const basis = (nEff, games) => `corpus-role 2023-25 stint (nEff ${nEff.toFixed(2)}, g ${games}, hl=${chosen.halfLifeGames}, k=${chosen.shrinkK}, boundary=${chosen.boundaryDecay}) — ${NFL_ROLE_SHARES_ID}`;
const teams = {};
for (const t of roster.teams) {
  const families = {};
  for (const family of SHARE_FAMILIES) {
    const players = [];
    for (const p of t.players) {
      const st = playerState.get(`nfl-athlete-${p.id}`);
      if (!st || st.team !== t.teamAbbr) continue; // team change or rookie: no carryover — mass stays in OTHER
      const obs = (st.obs[family] ?? []).map(([share, season]) => ({ share, season }));
      if (!obs.length) continue;
      const est = decayedShare({ observations: obs, predictSeason: PREDICT_SEASON, halfLifeGames: chosen.halfLifeGames, shrinkK: chosen.shrinkK, boundaryDecay: chosen.boundaryDecay });
      if (est.share >= MIN_SHARE) {
        players.push({ playerId: `nfl-athlete-${p.id}`, name: p.fullName, position: p.position?.abbreviation ?? null, share: Number(est.share.toFixed(8)), nEff: Number(est.nEff.toFixed(3)), games: est.games, shareBasis: basis(est.nEff, est.games) });
      }
    }
    players.sort((a, b) => b.share - a.share || (a.playerId < b.playerId ? -1 : 1));
    let sum = players.reduce((s, p) => s + p.share, 0);
    if (sum > 1) { players.forEach((p) => { p.share = Number((p.share / sum).toFixed(8)); }); sum = players.reduce((s, p) => s + p.share, 0); }
    const block = {
      players,
      residual: { label: "OTHER/UNALLOCATED (rookies, team changes, unlisted, defense/ST)", share: Number((1 - sum).toFixed(8)) },
    };
    const check = validateShareBlock(block);
    if (!check.ok) { console.error(`REFUSED: ${t.teamAbbr}/${family} share block incoherent: ${check.errors.join("; ")}`); process.exit(4); }
    families[family] = block;
  }
  const vols = teamVolumes.get(t.teamAbbr) ?? [];
  families.expectedTeamVolume = {
    passAttempts: vols.length ? Number(decayedMean(vols.map((v) => v.passAttempts)).toFixed(2)) : null,
    rushAttempts: vols.length ? Number(decayedMean(vols.map((v) => v.rushAttempts)).toFixed(2)) : null,
    basis: "decayed mean of 2025 REG+POST team totals (hl=8 games) — context, not a forecast",
  };
  teams[t.teamAbbr] = families;
}

// ---------------------------------------------------------------------------------------------
// 6. Emit receipt + current artifact.
const fmt = (r) => ({ overall: r.overall == null ? null : Number(r.overall.toFixed(4)), n: r.n, perFamily: Object.fromEntries(Object.entries(r.perFamily).map(([k, v]) => [k, v == null ? null : Number(v.toFixed(4))])) });
const receipt = {
  schemaVersion: 1,
  artifact: "nfl-role-shares-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  engine: { id: NFL_ROLE_SHARES_ID, version: NFL_ROLE_SHARES_VERSION },
  corpusAccounting: seasons.map((s) => ({ season: s.season, games: s.games.length, contentHash: s.contentHash })),
  protocol: {
    selection: "walk-forward on 2023–24 REG+POST team-games only (grid below); preseason never fits or evaluates",
    test: "chosen setting applied ONCE to held-out 2025; baselines score the same eval points",
    metric: "mean total-variation distance between predicted allocation (known players + OTHER) and realized allocation — the fraction of team opportunities misallocated",
  },
  grid: { size: GRID.length, top3: gridResults.slice(0, 3).map((g) => ({ params: { ...g.params, halfLifeGames: g.params.halfLifeGames === Infinity ? "inf" : g.params.halfLifeGames }, trainOverall: Number(g.train.overall.toFixed(4)) })) },
  chosen: { ...chosen, halfLifeGames: chosen.halfLifeGames === Infinity ? "inf" : chosen.halfLifeGames },
  heldOut2025: { model: fmt(test), baselines: Object.fromEntries(Object.entries(baselines).map(([k, v]) => [k, fmt(v)])), earlySeasonWeeks1to4: fmt(earlySeasonTest) },
  honesty: [
    "shares shrink toward ZERO, so uncertain mass lands in OTHER/UNALLOCATED — the visible list is never forced to 100%",
    "a team change resets evidence: the new team's usage is unknown until observed (no carryover)",
    "preseason games update membership only; 2026 preseason W2 boards therefore lean on 2023-25 stint evidence with the season boundary decayed",
    "current active status and expected usage stay SEPARATE: these are historical roles; participation states come from participation.mjs",
  ],
};
const reportsDir = path.join(ROOT, "data/internal/research/nfl/reports");
fs.writeFileSync(path.join(reportsDir, "role-shares-v1.json"), JSON.stringify(receipt, null, 1));

const current = {
  schemaVersion: 1,
  artifact: "nfl-role-shares-current",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  rosterAsOf: roster.sourceAsOf ?? roster.generatedAt,
  predictSeason: PREDICT_SEASON,
  engine: { id: NFL_ROLE_SHARES_ID, version: NFL_ROLE_SHARES_VERSION },
  params: { ...chosen, halfLifeGames: chosen.halfLifeGames === Infinity ? "inf" : chosen.halfLifeGames, receipt: "data/internal/research/nfl/reports/role-shares-v1.json" },
  minShare: MIN_SHARE,
  teams,
};
const outDir = path.join(ROOT, "data/internal/research/nfl/role-shares-v1");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "current.json"), JSON.stringify(current, null, 1));

console.log(`role-shares: selection ${selectionPoints.length} pts, test ${testPoints.length} pts`);
console.log(`chosen hl=${chosen.halfLifeGames} k=${chosen.shrinkK} boundary=${chosen.boundaryDecay}`);
console.log(`2025 TV — model ${test.overall?.toFixed(4)} vs last-game ${baselines["last-game"].overall?.toFixed(4)} rolling-4 ${baselines["rolling-4"].overall?.toFixed(4)} stint-mean ${baselines["stint-mean"].overall?.toFixed(4)} uniform ${baselines.uniform.overall?.toFixed(4)}`);
console.log(`teams ${Object.keys(teams).length}; wrote reports/role-shares-v1.json + role-shares-v1/current.json`);
