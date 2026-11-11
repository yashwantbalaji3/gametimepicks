#!/usr/bin/env node
/**
 * NFL STARTING-QB FALLBACK · REVISED CHALLENGER — RE-EXAMINED HISTORY + 2026 HOLD-OUT (founder directive 2026-11-11
 * ~18:00Z, item 2). $0, committed data only. The original exploratory report (qb-fallback-categories-exploratory.json)
 * stays FROZEN; nothing here replaces it.
 *
 *   node scripts/research/nfl/evaluate-qb-fallback-challenger.mjs [--write]
 *
 * DIAGNOSIS that motivated the challenger (low-history starts, REG 2018–2025, n=108): the original tier (d) projected
 * 0.84 of actual yards because (i) clubs starting a low-history QB throw ~6% less than their pass-attempt form, (ii) the
 * fixed 2013–2017 prior's yards per completion (11.38) sits above later low-history starts (10.54) — era drift — and
 * (iii) completion rate is ~2% high. Attempt share was right (0.92 vs 0.93).
 *
 * CHALLENGER ADJUSTMENTS — each justified independently of the evaluation games, each estimated WALK-FORWARD from the
 * preceding WINDOW seasons only (no game is projected with anything learned from its own season or later):
 *   rolling prior     completion and yards per completion of the category's starts in the previous WINDOW seasons
 *                     (era drift: league passing efficiency moves season to season; a fixed 2013–2017 prior cannot)
 *   volume context    × the category's mean ratio (club's actual attempts / its pass-attempt form) in those starts (a
 *                     club's form was built with a different QB; clubs protect an inexperienced passer)
 *   playing time      the attempt share is the CATEGORY's own mean share in those seasons — low history, emergency,
 *                     traded, promoted backup — not the universal STARTER_SHARE (rookies and emergency QBs are pulled more)
 *   opponent          kept ONLY IF it lowers mean pinball on the selection seasons (SELECT), decided before any later
 *                     season is summarised; otherwise dropped (founder: evaluated, not forced)
 * Traded starters and promoted backups keep SEPARATE share/volume estimates (tier b′); low-history starts use tier d′.
 *
 * REPORTING: SELECT 2015–2017 (rule decisions only) · RE-EXAMINED 2018–2025 (games already seen in the exploratory
 * report — labelled as such, never validation) · HOLD-OUT 2026 weeks 1–9 (not examined before this rule was fixed;
 * small n, reported as is). Baselines: league-average starter, team context only, and the ORIGINAL frozen tier (b)/(d).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createQbState, clubShare, tierBProjection, tierDProjection, leagueStarterProjection, teamContextProjection, pinball } from "../../../app/src/lib/sports/nfl/qb-starter-projection.mjs";
import { loadRows } from "./backtest-qb-starter-tier-b.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const F = JSON.parse(fs.readFileSync(rel("data/internal/research/nfl/reports/player-props-share-level-preregistration.json"), "utf8")).frozen;
const scaleB = JSON.parse(fs.readFileSync(rel("data/internal/research/nfl/reports/player-props-share-level-second-look.json"), "utf8")).devDispersionScales[`player_pass_yds|${F.candidates[0]}`];
const S = JSON.parse(fs.readFileSync(rel("data/internal/research/nfl/reports/qb-starter-tier-b-backtest.json"), "utf8")).starterShare.value;
const frozenD = JSON.parse(fs.readFileSync(rel("data/internal/research/nfl/reports/qb-fallback-categories-exploratory.json"), "utf8")).tierDPrior;
const OUT = "data/internal/research/nfl/reports/qb-fallback-challenger-reexamined.json";
const WINDOW = 5;            // seasons; the P300 rate model's boundary decay (0.25/season) makes older seasons weigh little
const MIN_WINDOW_STARTS = 10; // a category prior from fewer starts falls back to the pooled low-history / traded prior
const SELECT = [2015, 2017];
const REEXAMINED = [2018, 2025];
const HOLDOUT = 2026;
const FLOOR = 0.75;
const CATS = ["low_history", "rookie_first_start", "emergency_starter", "traded", "promoted_backup"];

function rng(seed) { let x = seed >>> 0; return () => { x = (x + 0x6d2b79f5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function clusterCi(values, clusters, resamples, seed) {
  const by = new Map(); values.forEach((v, i) => { const c = clusters[i]; if (!by.has(c)) by.set(c, []); by.get(c).push(v); });
  const cl = [...by.values()];
  if (cl.length < 2) return { lo: null, hi: null, clusters: cl.length };
  const r = rng(seed); const st = [];
  for (let i = 0; i < resamples; i++) { let s = 0, n = 0; for (let j = 0; j < cl.length; j++) { const c = cl[Math.floor(r() * cl.length)]; for (const v of c) { s += v; n++; } } st.push(s / n); }
  st.sort((a, b) => a - b);
  return { lo: Number(st[Math.floor(0.025 * resamples)].toFixed(3)), hi: Number(st[Math.ceil(0.975 * resamples) - 1].toFixed(3)), clusters: cl.length };
}

/** Per-season accumulators of what each category's starts actually did (added AFTER their day is scored). */
const seasonStats = new Map();
const acc = (cat, season, o) => { const k = `${cat}|${season}`; const a = seasonStats.get(k) ?? { att: 0, cmp: 0, yds: 0, share: 0, ratio: 0, n: 0 }; for (const x of Object.keys(o)) a[x] += o[x]; a.n += 1; seasonStats.set(k, a); };
/** The rolling WINDOW prior for a category as of `season` (seasons season−WINDOW … season−1 only). */
export function windowPrior(cat, season) {
  const t = { att: 0, cmp: 0, yds: 0, share: 0, ratio: 0, n: 0 };
  for (let s = season - WINDOW; s < season; s++) { const a = seasonStats.get(`${cat}|${s}`); if (a) for (const k of Object.keys(t)) t[k] += a[k]; }
  if (t.n < MIN_WINDOW_STARTS || !(t.att > 0) || !(t.cmp > 0)) return null;
  return { comp: t.cmp / t.att, ypcmp: t.yds / t.cmp, share: t.share / t.n, volRatio: t.ratio / t.n, n: t.n };
}

function main() {
  const { rows, totals } = loadRows();
  const state = createQbState(F);
  const firstSeason = new Map(), leadCount = new Map(), prevClub = new Map(), gamesAtClub = new Map(), lastLeader = new Map();
  const events = [];
  let i = 0;
  while (i < rows.length) {
    const date = rows[i].date; let j = i; while (j < rows.length && rows[j].date === date) j++;
    const day = rows.slice(i, j);
    const byGame = new Map();
    for (const r of day) { if (r.participation === "UNKNOWN") continue; const k = `${r.gameId}|${r.team}`; if (!byGame.has(k)) byGame.set(k, []); byGame.get(k).push(r); }
    const toAccumulate = [];
    for (const [k, list] of byGame) {
      const L = list.filter((r) => r.passAtt > 0).sort((a, b) => b.passAtt - a.passAtt || (a.id < b.id ? -1 : 1))[0];
      if (!L || L.type !== "REG") continue;
      const st = state.players.get(L.id);
      const career = st?.careerAtt ?? 0;
      const share = st && st.team === L.team ? clubShare(st, L.season, F) : 0;
      const rookie = (firstSeason.get(L.id) ?? L.season) === L.season;
      const prev = lastLeader.get(L.team);
      const traded = Boolean((st && st.team && st.team !== L.team) || (prevClub.has(L.id) && (gamesAtClub.get(L.id) ?? 0) < 8));
      const promoted = Boolean(prev && prev !== L.id && !list.some((r) => r.id === prev) && share < FLOOR && !traded);
      const low = career < F.rate.priorTrials;
      const emergency = (low && !rookie) || L.position !== "QB";
      const cats = [];
      if (low) cats.push("low_history");
      if (rookie && !(leadCount.get(L.id) > 0)) cats.push("rookie_first_start");
      if (emergency) cats.push("emergency_starter");
      if (traded && !low) cats.push("traded");
      if (promoted && !low) cats.push("promoted_backup");
      const T = totals.get(k)?.[0] ?? 0;
      const vol = state.teamVolume(L.team, L.season);
      if (T > 0) for (const c of cats) toAccumulate.push([c, L.season, { att: L.passAtt, cmp: L.passCmp, yds: L.passYds, share: L.passAtt / T, ratio: vol > 0 ? T / vol : 1 }]);
      if (!cats.length || L.season < SELECT[0]) continue;
      const opponent = list[0].opponent;
      const stOr = st ?? { games: 0, rates: { comp: [], ypcmp: [] }, clubObs: [] };
      const base = { st: stOr, team: L.team, season: L.season, state, F, scale: scaleB, starterShare: S };
      const proj = { leagueStarter: leagueStarterProjection(base), teamContext: teamContextProjection(base) };
      /* the ORIGINAL frozen method for the category */
      proj.original = low ? tierDProjection({ st: stOr, team: L.team, opponent, season: L.season, state, F, prior: frozenD }) : tierBProjection(base);
      /* the challenger: the category's own walk-forward prior */
      const wcat = low ? (emergency ? "emergency_starter" : "low_history") : traded ? "traded" : promoted ? "promoted_backup" : null;
      const wp = wcat ? windowPrior(wcat, L.season) ?? windowPrior(low ? "low_history" : "traded", L.season) : null;
      if (wp) {
        const vctx = { ...state, teamVolume: (t, s) => state.teamVolume(t, s) * wp.volRatio };
        if (low) {
          const prior = { comp: wp.comp, ypcmp: wp.ypcmp, share: wp.share, scale: frozenD.scale };
          proj.challenger_opp = tierDProjection({ st: stOr, team: L.team, opponent, season: L.season, state: vctx, F, prior });
          proj.challenger_noOpp = tierDProjection({ st: stOr, team: L.team, opponent, season: L.season, state: vctx, F, prior, useOpponent: false });
        } else {
          proj.challenger_opp = proj.challenger_noOpp = tierBProjection({ ...base, starterShare: wp.share, state: vctx });
        }
      }
      events.push({ cats, season: L.season, cluster: `${L.season}-${L.week}`, y: L.passYds, proj });
    }
    for (const r of day) {
      if (r.participation === "UNKNOWN") continue;
      if (!firstSeason.has(r.id)) firstSeason.set(r.id, r.season);
      const st = state.players.get(r.id);
      if (st?.team && st.team !== r.team) { prevClub.set(r.id, st.team); gamesAtClub.set(r.id, 0); }
      state.fold({ id: r.id, name: r.name, team: r.team, opponent: r.opponent, season: r.season, gameKey: `${r.gameId}|${r.team}`, passAtt: r.passAtt, passCmp: r.passCmp, passYds: r.passYds }, totals.get(`${r.gameId}|${r.team}`)?.[0] ?? 0);
      gamesAtClub.set(r.id, (gamesAtClub.get(r.id) ?? 0) + 1);
    }
    for (const [, list] of byGame) {
      const L = list.filter((r) => r.passAtt > 0).sort((a, b) => b.passAtt - a.passAtt || (a.id < b.id ? -1 : 1))[0];
      if (!L) continue;
      leadCount.set(L.id, (leadCount.get(L.id) ?? 0) + 1);
      lastLeader.set(L.team, L.id);
    }
    for (const [c, s, o] of toAccumulate) acc(c, s, o);
    i = j;
  }

  /* opponent decision on SELECT seasons only (low-history starts), fixed before any later season is summarised */
  const sel = events.filter((e) => e.season >= SELECT[0] && e.season <= SELECT[1] && e.cats.includes("low_history") && e.proj.challenger_opp);
  const selLoss = (m) => sel.reduce((a, e) => a + pinball(e.proj[m].q, e.y), 0) / sel.length;
  const opponentKept = sel.length > 0 && selLoss("challenger_opp") < selLoss("challenger_noOpp");
  const CH = opponentKept ? "challenger_opp" : "challenger_noOpp";

  const vs = (ev, m, b) => {
    const has = ev.filter((e) => e.proj[m] && e.proj[b]);
    if (!has.length) return null;
    const d = has.map((e) => pinball(e.proj[m].q, e.y) - pinball(e.proj[b].q, e.y));
    return { n: has.length, meanDiff: Number((d.reduce((a, x) => a + x, 0) / d.length).toFixed(3)), ci95: clusterCi(d, has.map((e) => e.cluster), F.bootstrap.resamples, F.bootstrap.seed) };
  };
  const stats = (ev, m) => {
    const has = ev.filter((e) => e.proj[m]);
    if (!has.length) return null;
    return {
      n: has.length,
      meanPinball: Number((has.reduce((a, e) => a + pinball(e.proj[m].q, e.y), 0) / has.length).toFixed(3)),
      bias: Number((has.reduce((a, e) => a + (e.y - e.proj[m].q[0.5]), 0) / has.length).toFixed(2)),
      coverage80: Number((has.filter((e) => e.y >= e.proj[m].q[0.1] && e.y <= e.proj[m].q[0.9]).length / has.length).toFixed(3)),
      level: Number((has.reduce((a, e) => a + e.y, 0) / has.reduce((a, e) => a + e.proj[m].mean, 0)).toFixed(4)),
    };
  };
  const block = (filter) => Object.fromEntries(CATS.map((c) => {
    const ev = events.filter((e) => filter(e) && e.cats.includes(c));
    return [c, { n: ev.length, challenger: stats(ev, CH), original: stats(ev, "original"), leagueStarter: stats(ev, "leagueStarter"), teamContext: stats(ev, "teamContext"), challengerVsOriginal: vs(ev, CH, "original"), challengerVsLeagueStarter: vs(ev, CH, "leagueStarter"), challengerVsTeamContext: vs(ev, CH, "teamContext") }];
  }));
  const report = {
    schemaVersion: 1,
    artifact: "nfl-qb-fallback-challenger",
    dataClass: "PRIVATE_RESEARCH",
    label: "RE-EXAMINED HISTORY (2018–2025, games already seen) + HOLD-OUT (2026 wk 1–9) — not a validation",
    rule: "see scripts/research/nfl/evaluate-qb-fallback-challenger.mjs header (fixed before the hold-out was scored)",
    frozenOriginal: "data/internal/research/nfl/reports/qb-fallback-categories-exploratory.json (unchanged)",
    window: WINDOW,
    opponentDecision: { seasons: SELECT, n: sel.length, pinballWith: sel.length ? Number(selLoss("challenger_opp").toFixed(3)) : null, pinballWithout: sel.length ? Number(selLoss("challenger_noOpp").toFixed(3)) : null, kept: opponentKept },
    challengerMethod: CH,
    reexamined: block((e) => e.season >= REEXAMINED[0] && e.season <= REEXAMINED[1]),
    holdout2026: block((e) => e.season === HOLDOUT),
  };
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--write")) fs.writeFileSync(rel(OUT), JSON.stringify(report, null, 2) + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
