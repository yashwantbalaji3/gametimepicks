#!/usr/bin/env node
/**
 * NFL STARTING-QB FALLBACK · PER-CATEGORY HISTORICAL EVALUATION — EXPLORATORY (founder P0 2026-11-11 ~17:40Z, item 5).
 * $0, committed data only. EXPLORATORY: no bar decides anything here; the decision-bearing test is the preregistered
 * forward validation (docs/NFL_QB_FALLBACK_FORWARD_PREREG_DRAFT.md, founder approval pending).
 *
 *   node scripts/research/nfl/evaluate-qb-fallback-categories.mjs [--write]
 *
 * Walk-forward exactly as backtest-qb-starter-tier-b.mjs (same tables, same 2026 cut at week 9, same P300 constants).
 * Each REG team-game 2018–2026 is scored on the state BEFORE its date. The starter is the game's leading passer (the
 * committed history has no depth charts; in production the starter comes from the chart + injury report). Every
 * classifying fact is known before kickoff except where marked [in-game]:
 *   rookie_first_start        his first season in the table and his first game as a club's leading passer
 *   injury_promoted_backup    the club's previous leading passer has no row in this game, and the starter's pre-game
 *                             club share is below the 0.75 floor
 *   traded                    his previous club in the table differs from this one, within his first 8 games there
 *   under_25_prior_attempts   career attempts before the game < F.rate.priorTrials (25)
 *   emergency_starter         under 25 prior attempts and NOT a rookie, or a non-QB leading passer
 *   multi_qb_game [in-game]   two or more quarterbacks threw ≥ 5 passes for the club
 * Methods (passing yards): leagueStarter (league rates), teamContext (the club's own recent efficiency, no QB history),
 * tierB (his own all-club shrunk rates), clubShare (the existing model). All use STARTER_SHARE × the club's pass-attempt
 * form except clubShare. Metrics per category × method: n, mean pinball (lower is better), bias (mean actual − mean
 * median), 80% coverage, level (Σ actual / Σ mean), and paired pinball diff vs leagueStarter with a cluster bootstrap
 * (season-week) 95% CI. Small-n categories are reported, never summarised as a direction.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createQbState, clubShare, tierBProjection, tierDProjection, leagueStarterProjection, clubShareProjection, teamContextProjection, pinball } from "../../../app/src/lib/sports/nfl/qb-starter-projection.mjs";
import { loadRows } from "./backtest-qb-starter-tier-b.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const F = JSON.parse(fs.readFileSync(rel("data/internal/research/nfl/reports/player-props-share-level-preregistration.json"), "utf8")).frozen;
const scale = JSON.parse(fs.readFileSync(rel("data/internal/research/nfl/reports/player-props-share-level-second-look.json"), "utf8")).devDispersionScales[`player_pass_yds|${F.candidates[0]}`];
const S = JSON.parse(fs.readFileSync(rel("data/internal/research/nfl/reports/qb-starter-tier-b-backtest.json"), "utf8")).starterShare.value;
const OUT = "data/internal/research/nfl/reports/qb-fallback-categories-exploratory.json";
const FLOOR = 0.75;
const EVAL_FROM = 2018;
const CATEGORIES = ["rookie_first_start", "injury_promoted_backup", "traded", "under_25_prior_attempts", "emergency_starter", "multi_qb_game"];
const METHODS = ["leagueStarter", "teamContext", "tierB", "tierD", "tierD_noOpponent", "clubShare"];
const PRIOR_SEASONS = [2013, 2017];

/**
 * The LOW-HISTORY PRIOR for tier (d), from REG PRIOR_SEASONS only (never scored): every club-game whose leading passer
 * had fewer than F.rate.priorTrials prior career attempts — pooled completion rate, yards per completion, and mean share
 * of the club's attempts. Pure counting over committed rows.
 */
export function lowHistoryPrior(rows, totals) {
  const career = new Map();
  let att = 0, cmp = 0, yds = 0, shareSum = 0, n = 0;
  let i = 0;
  while (i < rows.length) {
    const date = rows[i].date;
    let j = i;
    while (j < rows.length && rows[j].date === date) j += 1;
    const byGame = new Map();
    for (const r of rows.slice(i, j)) { if (r.participation === "UNKNOWN") continue; const k = `${r.gameId}|${r.team}`; if (!byGame.has(k)) byGame.set(k, []); byGame.get(k).push(r); }
    for (const [k, list] of byGame) {
      const L = list.filter((r) => r.passAtt > 0).sort((a, b) => b.passAtt - a.passAtt || (a.id < b.id ? -1 : 1))[0];
      if (!L || L.type !== "REG" || L.season < PRIOR_SEASONS[0] || L.season > PRIOR_SEASONS[1]) continue;
      if ((career.get(L.id) ?? 0) >= F.rate.priorTrials) continue;
      const T = totals.get(k)?.[0] ?? 0;
      if (!(T > 0)) continue;
      att += L.passAtt; cmp += L.passCmp; yds += L.passYds; shareSum += L.passAtt / T; n += 1;
    }
    for (const r of rows.slice(i, j)) if (r.participation !== "UNKNOWN") career.set(r.id, (career.get(r.id) ?? 0) + r.passAtt);
    i = j;
  }
  return { comp: Number((cmp / att).toFixed(5)), ypcmp: Number((yds / cmp).toFixed(4)), share: Number((shareSum / n).toFixed(4)), games: n, seasons: PRIOR_SEASONS };
}

function rng(seed) { let x = seed >>> 0; return () => { x = (x + 0x6d2b79f5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function clusterCi(values, clustersOf, resamples, seed) {
  const by = new Map();
  values.forEach((v, i) => { const c = clustersOf[i]; if (!by.has(c)) by.set(c, []); by.get(c).push(v); });
  const cl = [...by.values()];
  if (cl.length < 2) return { lo: null, hi: null, clusters: cl.length };
  const r = rng(seed);
  const stats = [];
  for (let i = 0; i < resamples; i += 1) { let s = 0, n = 0; for (let j = 0; j < cl.length; j += 1) { const c = cl[Math.floor(r() * cl.length)]; for (const v of c) { s += v; n += 1; } } stats.push(s / n); }
  stats.sort((a, b) => a - b);
  return { lo: Number(stats[Math.floor(0.025 * resamples)].toFixed(3)), hi: Number(stats[Math.ceil(0.975 * resamples) - 1].toFixed(3)), clusters: cl.length };
}

function walk(rows, totals, prior) {
  const state = createQbState(F);
  const training = []; // PRIOR_SEASONS low-history starts, for the dispersion choice
  const grid = F.dispersionScaleGrid.filter((g) => g > scale); // strictly wider than tiers (a)/(b), by construction
  const firstSeason = new Map();
  const leadCount = new Map();
  const prevClub = new Map();       // player → the club he left (set on a club change)
  const gamesAtClub = new Map();    // player → games at his current club
  const lastLeader = new Map();     // team → previous game's leading passer id
  const events = [];
  let i = 0;
  while (i < rows.length) {
    const date = rows[i].date;
    let j = i;
    while (j < rows.length && rows[j].date === date) j += 1;
    const day = rows.slice(i, j);
    const byGame = new Map();
    for (const r of day) { if (r.participation === "UNKNOWN") continue; const k = `${r.gameId}|${r.team}`; if (!byGame.has(k)) byGame.set(k, []); byGame.get(k).push(r); }
    for (const [k, list] of byGame) {
      const passers = list.filter((r) => r.passAtt > 0).sort((a, b) => b.passAtt - a.passAtt || (a.id < b.id ? -1 : 1));
      const L = passers[0];
      if (!L || L.type !== "REG") continue;
      const st = state.players.get(L.id);
      const career = st?.careerAtt ?? 0;
      if (L.season >= PRIOR_SEASONS[0] && L.season <= PRIOR_SEASONS[1] && career < F.rate.priorTrials && prior) {
        const opp = list[0].opponent;
        training.push({ y: L.passYds, q: Object.fromEntries(grid.map((g) => [g, tierDProjection({ st: st ?? { games: 0, rates: { comp: [], ypcmp: [] } }, team: L.team, opponent: opp, season: L.season, state, F, prior: { ...prior, scale: g } }).q])) });
      }
      if (L.season < EVAL_FROM) continue;
      const share = st && st.team === L.team ? clubShare(st, L.season, F) : 0;
      const rookie = (firstSeason.get(L.id) ?? L.season) === L.season;
      const prev = lastLeader.get(L.team);
      const cats = [];
      if (rookie && !(leadCount.get(L.id) > 0)) cats.push("rookie_first_start");
      if (prev && prev !== L.id && !list.some((r) => r.id === prev) && share < FLOOR) cats.push("injury_promoted_backup");
      if (st && st.team && st.team !== L.team) cats.push("traded");
      else if (prevClub.has(L.id) && (gamesAtClub.get(L.id) ?? 0) < 8) cats.push("traded");
      if (career < F.rate.priorTrials) cats.push("under_25_prior_attempts");
      if ((career < F.rate.priorTrials && !rookie) || L.position !== "QB") cats.push("emergency_starter");
      if (list.filter((r) => r.position === "QB" && r.passAtt >= 5).length >= 2) cats.push("multi_qb_game");
      if (!cats.length) continue;
      const args = { st: st ?? { games: 0, rates: { comp: [], ypcmp: [] }, clubObs: [] }, team: L.team, season: L.season, state, F, scale, starterShare: S };
      const dArgs = { st: args.st, team: L.team, opponent: list[0].opponent, season: L.season, state, F, prior };
      const proj = { leagueStarter: leagueStarterProjection(args), teamContext: teamContextProjection(args), tierB: tierBProjection(args), tierD: tierDProjection(dArgs), tierD_noOpponent: tierDProjection({ ...dArgs, useOpponent: false }), clubShare: clubShareProjection({ ...args, st: st && st.team === L.team ? st : { ...args.st, clubObs: [] } }) };
      events.push({ cats, cluster: `${L.season}-${L.week}`, y: L.passYds, proj });
    }
    /* fold the day; update the pre-game facts for later games */
    for (const r of day) {
      if (r.participation === "UNKNOWN") continue;
      if (!firstSeason.has(r.id)) firstSeason.set(r.id, r.season);
      const st = state.players.get(r.id);
      if (st?.team && st.team !== r.team) { prevClub.set(r.id, st.team); gamesAtClub.set(r.id, 0); }
      state.fold({ id: r.id, name: r.name, team: r.team, opponent: r.opponent, season: r.season, gameKey: `${r.gameId}|${r.team}`, passAtt: r.passAtt, passCmp: r.passCmp, passYds: r.passYds }, totals.get(`${r.gameId}|${r.team}`)?.[0] ?? 0);
      gamesAtClub.set(r.id, (gamesAtClub.get(r.id) ?? 0) + 1);
    }
    for (const [k, list] of byGame) {
      const L = list.filter((r) => r.passAtt > 0).sort((a, b) => b.passAtt - a.passAtt || (a.id < b.id ? -1 : 1))[0];
      if (!L) continue;
      leadCount.set(L.id, (leadCount.get(L.id) ?? 0) + 1);
      lastLeader.set(L.team, L.id);
    }
    i = j;
  }
  return { events, training, grid };
}

function main() {
  const { rows, totals } = loadRows();
  const base = lowHistoryPrior(rows, totals);
  /* pass 1: choose the tier (d) dispersion on the PRIOR_SEASONS low-history starts — the grid value (> the P300 scale,
     strictly, so wider by construction) whose 80% coverage is closest to 0.80; ties go to the wider */
  const first = walk(rows, totals, { ...base, scale });
  const coverageOf = (g) => first.training.filter((t) => t.y >= t.q[g][0.1] && t.y <= t.q[g][0.9]).length / first.training.length;
  const chosen = first.grid.map((g) => ({ g, c: coverageOf(g) })).sort((a, b) => Math.abs(a.c - 0.8) - Math.abs(b.c - 0.8) || b.g - a.g)[0];
  const prior = { ...base, scale: chosen.g, scaleChosenOn: { seasons: PRIOR_SEASONS, n: first.training.length, coverage80: Number(chosen.c.toFixed(3)), grid: first.grid } };
  const { events } = walk(rows, totals, prior);
  const report = {
    schemaVersion: 1,
    artifact: "nfl-qb-fallback-categories-exploratory",
    dataClass: "PRIVATE_RESEARCH",
    label: "EXPLORATORY — not a validation; decisions wait for the preregistered forward test",
    rule: "see scripts/research/nfl/evaluate-qb-fallback-categories.mjs header",
    starterShare: S,
    tierDPrior: prior,
    categories: {},
  };
  for (const c of CATEGORIES) {
    const ev = events.filter((e) => e.cats.includes(c));
    const out = { n: ev.length, methods: {} };
    for (const m of METHODS) {
      if (!ev.length) { out.methods[m] = null; continue; }
      const loss = ev.map((e) => pinball(e.proj[m].q, e.y));
      const meanLoss = loss.reduce((a, b) => a + b, 0) / ev.length;
      const bias = ev.reduce((a, e) => a + (e.y - e.proj[m].q[0.5]), 0) / ev.length;
      const cov = ev.filter((e) => e.y >= e.proj[m].q[0.1] && e.y <= e.proj[m].q[0.9]).length / ev.length;
      const level = ev.reduce((a, e) => a + e.y, 0) / ev.reduce((a, e) => a + e.proj[m].mean, 0);
      const row = { meanPinball: Number(meanLoss.toFixed(3)), bias: Number(bias.toFixed(2)), coverage80: Number(cov.toFixed(3)), level: Number(level.toFixed(4)) };
      if (m !== "leagueStarter") {
        const d = ev.map((e) => pinball(e.proj[m].q, e.y) - pinball(e.proj.leagueStarter.q, e.y));
        row.vsLeagueStarter = { meanDiff: Number((d.reduce((a, b) => a + b, 0) / d.length).toFixed(3)), ci95: clusterCi(d, ev.map((e) => e.cluster), F.bootstrap.resamples, F.bootstrap.seed) };
      }
      out.methods[m] = row;
    }
    report.categories[c] = out;
  }
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--write")) fs.writeFileSync(rel(OUT), JSON.stringify(report, null, 2) + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
