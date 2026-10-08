#!/usr/bin/env node
/**
 * NFL-004 A — QB PASSING-TOUCHDOWN distributions, DEVELOPMENT LOOK (2022–2025 only).
 * Executes data/internal/research/nfl/reports/nfl-004-passing-td-preregistration.json.
 *
 * WORLD    = nfl-game-worlds-v1 (replay-game-worlds.mjs, inputs unchanged) + the production World Model V2 engine's
 *            touchdown rules (6*off <= points clip; each receiving TD -> receiver with an uncredited catch by
 *            rzTargetShare, then passer by uncredited completions; no qualifier -> rushing TD).
 * BASELINE = shrunk passing-TD rate per attempt x expected starter attempts, Poisson/NB (P300 moments).
 * HYBRID   = 0.5 WORLD pmf + 0.5 BASELINE pmf.
 * Everything up to the game-script fit is copied verbatim from replay-game-worlds.mjs; the only changes there are
 * (a) team-games recorded for 2022–2025 only, (b) the TD walk-forward runs through 2022–2025, (c) a walk-forward
 * per-player passing-TD rate history + previous-season league prior for BASELINE.
 *
 *   node scripts/research/nfl/replay-passing-td.mjs --validate          (plumbing only, 3 games, prints no metric)
 *   node scripts/research/nfl/replay-passing-td.mjs --score --now <ISO> (one look; refuses if the receipt exists)
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { winMarginGate, rowsFromTable, replayWinMarginHeads, WIN_MARGIN_RECEIPT, WIN_MARGIN_PREREG, GAMES_HISTORY_V2 } from "../../../app/src/lib/sports/nfl/win-margin-heads.mjs";
import { totalsV3Gate, gamesFromTable, foldTotalsV3 } from "../../../app/src/lib/sports/nfl/totals-play-efficiency.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const read = (p) => JSON.parse(fs.readFileSync(rel(p), "utf8"));
const GW_PREREG = "data/internal/research/nfl/reports/nfl-005-game-worlds-preregistration.json";
const PREREG_PATH = "data/internal/research/nfl/reports/nfl-004-passing-td-preregistration.json";
const OUT_PATH = "data/internal/research/nfl/reports/nfl-004-passing-td-development.json";
const PTD_PATH = "data/internal/research/nfl/replay/qb-passing-td-v1.json.gz";
const AW_DEV = "data/internal/research/nfl/reports/nfl-005-allocation-worlds-development.json";
const NFL003_PREREG = "data/internal/research/nfl/reports/nfl-003-opportunity-allocation-preregistration.json";
const NFL003_DEV = "data/internal/research/nfl/reports/nfl-003-opportunity-allocation-development.json";
const P300_PREREG = "data/internal/research/nfl/reports/player-props-share-level-preregistration.json";
const TABLE_PATH = "data/internal/research/nfl/replay/player-games-v1.json.gz";

const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };
const MODE = argv.includes("--score") ? "score" : argv.includes("--validate") ? "validate" : null;
if (!MODE) refuse("usage: --validate | --score --now <ISO>");
const NOW = argOf("--now");
let preregCommit = null;
if (MODE === "score") {
  if (!NOW || !Number.isFinite(Date.parse(NOW))) refuse("--now <ISO> required");
  if (fs.existsSync(rel(OUT_PATH))) refuse(`${OUT_PATH} already exists — the look has been taken`);
  const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
  preregCommit = git("log", "-1", "--format=%H %cI", "--", PREREG_PATH);
  if (!preregCommit) refuse("the preregistration is not committed");
  try { git("diff", "--quiet", "HEAD", "--", PREREG_PATH); } catch { refuse("the preregistration has uncommitted changes"); }
}
const H = read(GW_PREREG).frozen;
const P = read(PREREG_PATH).frozen;
if (P.devSeasons[0] !== 2022 || P.devSeasons[1] !== 2025) refuse("window must be 2022-2025");
// ── passing-TD outcome side table + walk-forward baseline state ───────────────────────────────────────
const PTD = JSON.parse(zlib.gunzipSync(fs.readFileSync(rel(PTD_PATH))));
const PC = Object.fromEntries(PTD.columns.map((c, i) => [c, i]));
const ptdOf = new Map(PTD.rows.map((r) => [`${r[PC.gameId]}|${r[PC.playerId]}`, r[PC.passTd]]));
const leagueBySeason = new Map();
for (const r of PTD.rows) { const s0 = Number(r[PC.gameId].slice(0, 4)); const x = leagueBySeason.get(s0) ?? { td: 0, att: 0 }; x.td += r[PC.passTd]; x.att += r[PC.passAtt]; leagueBySeason.set(s0, x); }
const leaguePrior = (season) => { const x = leagueBySeason.get(season - 1); if (!x || !(x.att > 0)) refuse(`no league prior for ${season}`); return x.td / x.att; };
const BR = P.baselineRate;
const ptdHist = new Map(); // playerId → { games, obs: [{ td, att, idx, season }] } — never reset on a team change
function ptdRate(id, season) {
  const h = ptdHist.get(id); const prior = leaguePrior(season);
  let num = 0; let den = 0;
  for (const o of h?.obs ?? []) { const w = 0.5 ** ((h.games - o.idx) / BR.halfLifeGames) * BR.boundaryDecay ** Math.max(0, season - o.season); num += w * o.td; den += w * o.att; }
  return { r: (num + BR.priorTrials * prior) / (den + BR.priorTrials), prior, effAtt: den };
}
const G = read(NFL003_PREREG).frozen;
const F = read(P300_PREREG).frozen;
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(rel(p))).digest("hex");
const DEV3 = read(NFL003_DEV).devFits;
const table = JSON.parse(zlib.gunzipSync(fs.readFileSync(rel(TABLE_PATH))));
const C = Object.fromEntries(table.columns.map((c, i) => [c, i]));
const inSeasons = (s, [a, b]) => s >= a && s <= b;
const FRANCHISE = { STL: "LA", SD: "LAC", OAK: "LV", JAC: "JAX", LAR: "LA" };
const fr = (t) => FRANCHISE[t] ?? t;
const wmGate = winMarginGate(read(WIN_MARGIN_RECEIPT), read(WIN_MARGIN_PREREG));
if (wmGate.margin.state !== "READY") refuse("published margin head not READY");
const marginOf = new Map();
const HIST = rowsFromTable(read(GAMES_HISTORY_V2));
replayWinMarginHeads({ games: HIST, gate: wmGate, onGame: (g, x) => marginOf.set(g.gameId, { home: fr(g.home), m: x.marginMean, homeScore: g.homeScore, awayScore: g.awayScore }) });
const tGate = totalsV3Gate(read("data/internal/research/nfl/reports/matchup-totals-historical-replay-evaluation.json"), read("data/internal/research/nfl/reports/matchup-totals-historical-replay-preregistration.json"));
if (tGate.state !== "READY") refuse("v3 totals gate not READY");
const muTOf = new Map();
foldTotalsV3({ games: gamesFromTable(read("data/internal/research/nfl/replay/games-history-v1.json")), efficiencyRows: read("data/internal/research/nfl/replay/team-game-efficiency-v1.json").rows, frozen: tGate.frozen, fit: tGate.fit, onDay: (day, predict) => { for (const g of day) muTOf.set(g.gameId, predict(g.home, g.away)); } });
const teamMargin = (gameId, team) => { const g = marginOf.get(gameId); if (!g || g.m == null) return 0; return fr(team) === g.home ? g.m : -g.m; };
const poolsByTeamGame = new Map();

// ── exact distributions (P300, verbatim) ───────────────────────────────────────────────────────────
function logGamma(x) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let s = 1.000000000190015;
  for (const c of g) { y += 1; s += c / y; }
  return -t + Math.log(2.5066282746310005 * s / x);
}
function gammaP(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let n = 0; n < 1000; n += 1) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-12) break; }
    return Math.min(1, sum * Math.exp(-x + a * Math.log(x) - logGamma(a)));
  }
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return Math.max(0, 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h);
}
function countDist(mean, variance) {
  if (!(mean > 0)) return { kind: "zero" };
  if (variance <= mean * (1 + 1e-9)) return { kind: "poisson", mean };
  return { kind: "nb", mean, size: (mean * mean) / (variance - mean) };
}
function countPmf(d, k) {
  if (d.kind === "zero") return k === 0 ? 1 : 0;
  if (d.kind === "poisson") return Math.exp(-d.mean + k * Math.log(d.mean) - logGamma(k + 1));
  const p = d.size / (d.size + d.mean);
  return Math.exp(logGamma(k + d.size) - logGamma(d.size) - logGamma(k + 1) + d.size * Math.log(p) + k * Math.log(1 - p));
}
function countCdf(d, k) { if (k < 0) return 0; let s = 0; for (let i = 0; i <= k; i += 1) s += countPmf(d, i); return Math.min(1, s); }
function countQuantile(d, q) { let s = 0; for (let k = 0; k < 2000; k += 1) { s += countPmf(d, k); if (s >= q) return k; } return 2000; }
function zeroGamma(mean, variance, p0) {
  if (!(mean > 0) || p0 >= 1) return { p0: 1, shape: 0, scale: 0 };
  const posMean = mean / (1 - p0);
  const posSecond = (variance + mean * mean) / (1 - p0);
  const posVar = Math.max(posSecond - posMean * posMean, 1e-9);
  return { p0, shape: (posMean * posMean) / posVar, scale: posVar / posMean };
}
const zgCdf = (d, y) => (y < 0 ? 0 : d.p0 + (1 - d.p0) * (d.scale > 0 ? gammaP(d.shape, y / d.scale) : 1));
function zgQuantile(d, q) {
  if (q <= d.p0 || d.scale <= 0) return 0;
  let lo = 0;
  let hi = Math.max(1, d.shape * d.scale * 20);
  while (zgCdf(d, hi) < q) hi *= 2;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (zgCdf(d, mid) < q) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// ── estimators (P300, verbatim) ────────────────────────────────────────────────────────────────────
const FAMILY_OF = { player_receptions: "targets", player_reception_yds: "targets", player_rush_yds: "rushAttempts", player_pass_yds: "passAttempts" };
const MARKETS = Object.keys(FAMILY_OF);
const FAMILIES = ["passAttempts", "rushAttempts", "targets"];
const VOLKEY = { passAttempts: "passAtt", rushAttempts: "carries", targets: "targets" };
const TOTIDX = { passAttempts: 0, rushAttempts: 1, targets: 2 };
const weight = (idxNow, idx, seasonNow, season, hl, bd) => 0.5 ** ((idxNow - idx) / hl) * bd ** Math.max(0, seasonNow - season);
function decayedShare(st, family, season, shrinkK = F.share.shrinkK) {
  let num = 0;
  let den = 0;
  for (const o of st.obs[family]) { const w = weight(st.games, o.idx, season, o.season, F.share.halfLifeGames, F.share.boundaryDecay); num += w * o.share; den += w; }
  return den > 0 ? num / (den + shrinkK) : 0;
}
function shrunkRate(st, key, league, season) {
  let num = 0;
  let den = 0;
  for (const o of st.rates[key] ?? []) { const w = weight(st.games, o.idx, season, o.season, F.rate.halfLifeGames, F.rate.boundaryDecay); num += w * o.num; den += w * o.den; }
  return (num + F.rate.priorTrials * league) / (den + F.rate.priorTrials);
}
const INTERCEPT = { passAtt: F.intercepts.passAttempts, carries: F.intercepts.carries, targets: F.intercepts.passAttempts };
const L = F.league;
const D = F.dispersion;
const perOpp = { player_reception_yds: L.catchRate * L.yardsPerReception, player_receptions: L.catchRate, player_rush_yds: L.yardsPerCarry, player_pass_yds: L.completionRate * L.yardsPerCompletion };
const actualOf = { player_receptions: (r) => r[C.receptions], player_reception_yds: (r) => r[C.recYds], player_rush_yds: (r) => r[C.rushYds], player_pass_yds: (r) => r[C.passYds] };

/** P300's moments with the share and volume passed in (rates are the player's shrunk rates at that moment). */
function momentsFromParts(mkt, share, vol, rates) {
  const opp = (mean, sigma) => ({ mean, variance: mean + share * share * sigma * sigma });
  const thin = (n, rate) => ({ mean: n.mean * rate, variance: n.mean * rate * (1 - rate) + rate * rate * n.variance });
  const yards = (k, perPlay, shape) => ({ mean: k.mean * perPlay, variance: (k.mean * perPlay * perPlay) / shape + k.variance * perPlay * perPlay });
  if (mkt === "player_receptions" || mkt === "player_reception_yds") {
    const rec = thin(opp(share * vol.targets, D.volumeSigmaPass), rates.catch);
    if (mkt === "player_receptions") return { ...rec, count: true };
    return { ...yards(rec, rates.ypr, D.receivingShape), count: false, zeroCount: rec };
  }
  if (mkt === "player_rush_yds") {
    const car = opp(share * vol.carries, D.volumeSigmaRush);
    return { ...yards(car, rates.ypc, D.rushingShape), count: false, zeroCount: car };
  }
  const cmp = thin(opp(share * vol.passAtt, D.volumeSigmaPass), rates.comp);
  return { ...yards(cmp, rates.ypcmp, D.passingShape), count: false, zeroCount: cmp };
}
function evaluateRow(m, s, line) {
  if (m.count) {
    const d = countDist(m.mean, m.mean + s * Math.max(m.variance - m.mean, 0));
    return { p10: countQuantile(d, 0.1), p50: countQuantile(d, 0.5), p90: countQuantile(d, 0.9), pOver: line > 0 ? 1 - countCdf(d, Math.floor(line)) : null };
  }
  const p0 = countPmf(countDist(m.zeroCount.mean, m.zeroCount.variance), 0);
  const d = zeroGamma(m.mean, s * m.variance, p0);
  return { p10: zgQuantile(d, 0.1), p50: zgQuantile(d, 0.5), p90: zgQuantile(d, 0.9), pOver: line > 0 ? 1 - zgCdf(d, line) : null };
}

/** Active-set reallocation of one share (registered rule): share × (a + rho·v)/a, capped so the named sum ≤ 1 − floor. */
function reallocate(share, a, v, rho, floor = G.otherFloor) {
  if (!(a > 0)) return share;
  const named = a + rho * v;
  return share * (named / a) * Math.min(1, (1 - floor) / named);
}

// ── one walk-forward ───────────────────────────────────────────────────────────────────────────────
const rows = [...table.rows].sort((a, b) => (a[C.date] !== b[C.date] ? (a[C.date] < b[C.date] ? -1 : 1) : a[C.gameId] < b[C.gameId] ? -1 : a[C.gameId] > b[C.gameId] ? 1 : 0));

function walk() {
  const players = new Map();
  const byTeam = new Map();
  const teamForm = new Map();
  const oppForm = new Map();
  const ST = (id) => {
    if (!players.has(id)) players.set(id, { team: null, games: 0, obs: { passAttempts: [], rushAttempts: [], targets: [] }, rates: {}, recent: {} });
    return players.get(id);
  };
  const formOf = (store, team, season) => {
    const t = store.get(team);
    if (!t) return { ...INTERCEPT };
    const bd = F.teamForm.boundaryDecay ** Math.max(0, season - t.season);
    return { passAtt: INTERCEPT.passAtt + (t.passAtt - INTERCEPT.passAtt) * bd, carries: INTERCEPT.carries + (t.carries - INTERCEPT.carries) * bd, targets: INTERCEPT.targets + (t.targets - INTERCEPT.targets) * bd };
  };
  const fold = (store, team, season, totals) => {
    const alpha = 1 - 0.5 ** (1 / F.teamForm.halfLifeGames);
    const cur = formOf(store, team, season);
    store.set(team, { passAtt: cur.passAtt + alpha * (totals[0] - cur.passAtt), carries: cur.carries + alpha * (totals[1] - cur.carries), targets: cur.targets + alpha * (totals[2] - cur.targets), season });
  };
  const teamGames = [];
  const scored = [];
  for (let i = 0; i < rows.length;) {
    let j = i;
    while (j < rows.length && rows[i][C.date] === rows[j][C.date]) j += 1;
    const day = rows.slice(i, j);
    const season = day[0][C.season];
    if (season > F.seasons.warmup[1]) {
      const tgs = new Map();
      for (const r of day) {
        const k = `${r[C.gameId]}|${r[C.team]}`;
        if (!tgs.has(k)) tgs.set(k, { gameId: r[C.gameId], team: r[C.team], opponent: r[C.opponent], rows: new Map() });
        tgs.get(k).rows.set(String(r[C.playerId]), r);
      }
      for (const tg of tgs.values()) {
        const tf = formOf(teamForm, tg.team, season);
        const of = formOf(oppForm, tg.opponent, season);
        const m = teamMargin(tg.gameId, tg.team);
        const totals = table.teamTotals[`${tg.gameId}|${tg.team}`] ?? [0, 0, 0];
        teamGames.push({ season, tf, of, m, totals });
        if (inSeasons(season, P.devSeasons)) { // NFL-004 A: dev seasons only
          const members = [];
          for (const id of byTeam.get(tg.team) ?? []) {
            if (!tg.rows.has(id)) continue;
            const st = players.get(id);
            const shares = Object.fromEntries(FAMILIES.map((fam) => [fam, decayedShare(st, fam, season)]));
            if (!FAMILIES.some((fam) => shares[fam] > 0)) continue;
            members.push({ id, name: tg.rows.get(id)[C.name], passAtt: tg.rows.get(id)[C.passAtt], ptd: ptdRate(id, season), shares, rates: { catch: shrunkRate(st, "catch", L.catchRate, season), ypr: shrunkRate(st, "ypr", L.yardsPerReception, season), ypc: shrunkRate(st, "ypc", L.yardsPerCarry, season) } });
          }
          poolsByTeamGame.set(`${tg.gameId}|${tg.team}`, { gameId: tg.gameId, team: tg.team, season, members, pool: null, tf, of, m });
        }
        // pool sums per family over every pool member with a positive no-pull share
        const pool = {};
        for (const fam of FAMILIES) pool[fam] = { a: 0, v: 0 };
        for (const id of byTeam.get(tg.team) ?? []) {
          const st = players.get(id);
          const active = tg.rows.has(id);
          for (const fam of FAMILIES) {
            const s = decayedShare(st, fam, season);
            if (!(s > 0)) continue;
            if (active) pool[fam].a += s; else pool[fam].v += s;
          }
        }
        const tgRec = poolsByTeamGame.get(`${tg.gameId}|${tg.team}`);
        if (tgRec) tgRec.pool = pool;
        for (const id of byTeam.get(tg.team) ?? []) {
          const st = players.get(id);
          const row = tg.rows.get(id) ?? null;
          for (const mkt of MARKETS) {
            const fam = FAMILY_OF[mkt];
            const share = decayedShare(st, fam, season);
            if (share < F.thresholds[fam]) continue;
            if (!row || row[C.participation] === "UNKNOWN") continue;
            const recent = (st.recent[mkt] ?? []).slice(-4);
            const rolling4 = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
            const volKey = mkt === "player_rush_yds" ? "carries" : mkt === "player_pass_yds" ? "passAtt" : "targets";
            const baselineShare = decayedShare(st, fam, season, F.share.baselineShrinkK);
            const rates = {
              catch: shrunkRate(st, "catch", L.catchRate, season), ypr: shrunkRate(st, "ypr", L.yardsPerReception, season),
              ypc: shrunkRate(st, "ypc", L.yardsPerCarry, season), comp: shrunkRate(st, "comp", L.completionRate, season),
              ypcmp: shrunkRate(st, "ypcmp", L.yardsPerCompletion, season),
            };
            scored.push({
              season, mkt, fam, key: `${tg.gameId}|${tg.team}|${id}|${mkt}`, actual: actualOf[mkt](row), rolling4,
              shareVol: baselineShare * INTERCEPT[volKey] * perOpp[mkt], isCount: mkt === "player_receptions",
              share, pool: pool[fam], rates, tf, of, m, gameId: tg.gameId, team: tg.team, playerId: id,
            });
          }
        }
      }
    }
    const teamsFolded = new Set();
    for (const r of day) {
      if (r[C.participation] === "UNKNOWN") continue;
      const id = String(r[C.playerId]);
      const st = ST(id);
      const totals = table.teamTotals[`${r[C.gameId]}|${r[C.team]}`] ?? [0, 0, 0];
      if (st.team !== r[C.team]) {
        if (st.team) byTeam.get(st.team)?.delete(id);
        st.obs = { passAttempts: [], rushAttempts: [], targets: [] };
        st.team = r[C.team];
        if (!byTeam.has(st.team)) byTeam.set(st.team, new Set());
        byTeam.get(st.team).add(id);
      }
      const idx = st.games + 1;
      st.obs.passAttempts.push({ share: totals[0] > 0 ? r[C.passAtt] / totals[0] : 0, idx, season: r[C.season] });
      st.obs.rushAttempts.push({ share: totals[1] > 0 ? r[C.carries] / totals[1] : 0, idx, season: r[C.season] });
      st.obs.targets.push({ share: totals[2] > 0 ? r[C.targets] / totals[2] : 0, idx, season: r[C.season] });
      const addRate = (key, num, den) => { if (den > 0) (st.rates[key] ??= []).push({ num, den, idx, season: r[C.season] }); };
      addRate("catch", r[C.receptions], r[C.targets]);
      addRate("ypr", r[C.recYds], r[C.receptions]);
      addRate("ypc", r[C.rushYds], r[C.carries]);
      addRate("comp", r[C.passCmp], r[C.passAtt]);
      addRate("ypcmp", r[C.passYds], r[C.passCmp]);
      for (const mkt of MARKETS) (st.recent[mkt] ??= []).push(actualOf[mkt](r));
      { const h = ptdHist.get(id) ?? ptdHist.set(id, { games: 0, obs: [] }).get(id); h.games += 1; if (r[C.passAtt] > 0) { const td = ptdOf.get(`${r[C.gameId]}|${id}`); if (td == null) refuse(`no passing-TD row for ${r[C.gameId]}|${id}`); h.obs.push({ td, att: r[C.passAtt], idx: h.games, season: r[C.season] }); } }
      st.games = idx;
      const tk = `${r[C.gameId]}|${r[C.team]}`;
      if (!teamsFolded.has(tk)) { teamsFolded.add(tk); fold(teamForm, r[C.team], r[C.season], totals); fold(oppForm, r[C.opponent], r[C.season], totals); }
    }
    i = j;
  }
  return { teamGames, scored };
}


const { scored } = walk();
const rho = DEV3.rho;
const volCoef = DEV3.volume;
const KAPPA = read(AW_DEV).devFit.kappa;
const allocVolume = (x) => {
  const out = {};
  for (const fam of FAMILIES) { const k = VOLKEY[fam]; const c = volCoef[fam]; out[k] = INTERCEPT[k] + c.bT * (x.tf[k] - INTERCEPT[k]) + c.bO * (x.of[k] - INTERCEPT[k]) + c.g * x.m; }
  return out;
};
const coverOf = (x, e) => (x.isCount && (x.actual === e.p10 || x.actual === e.p90) ? 0.5 : x.actual >= e.p10 && x.actual <= e.p90 ? 1 : 0);
function analytic(x) {
  const sh = reallocate(x.share, x.pool.a, x.pool.v, rho[x.fam]);
  const m = momentsFromParts(x.mkt, sh, allocVolume(x), x.rates);
  const e = evaluateRow(m, DEV3.dispersionScales[`${x.mkt}|allocV1`], x.rolling4);
  return { mean: m.mean, p10: e.p10, p50: e.p50, p90: e.p90, pOverLine: e.pOver };
}

// ── samplers (as replay-allocation-worlds.mjs) ─────────────────────────────────────────────────────
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const seedOf = (s) => parseInt(crypto.createHash("sha256").update(s).digest("hex").slice(0, 8), 16);
function normal(rng) { const u = Math.max(1e-12, rng()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }
function gammaDraw(rng, shape) { if (shape <= 0) return 0; if (shape < 1) return gammaDraw(rng, shape + 1) * rng() ** (1 / shape); const d = shape - 1 / 3; const c = 1 / Math.sqrt(9 * d); for (;;) { let x; let v; do { x = normal(rng); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = rng(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; } }
function dirichlet(rng, alpha) { const g = alpha.map((a) => (a > 0 ? gammaDraw(rng, a) : 0)); const s = g.reduce((a, b) => a + b, 0); return s > 0 ? g.map((x) => x / s) : alpha.map(() => 1 / alpha.length); }
function multinomial(rng, n, p) { const out = new Array(p.length).fill(0); let left = n; let mass = 1; for (let i = 0; i < p.length - 1 && left > 0; i += 1) { const q = mass > 0 ? Math.min(1, Math.max(0, p[i] / mass)) : 0; let k = 0; for (let j = 0; j < left; j += 1) if (rng() < q) k += 1; out[i] = k; left -= k; mass -= p[i]; } out[p.length - 1] += left; return out; }
function binomial(rng, n, p) { let k = 0; for (let j = 0; j < n; j += 1) if (rng() < p) k += 1; return k; }
function pick(rng, w) { const s = w.reduce((a, b) => a + b, 0); if (!(s > 0)) return -1; let u = rng() * s; for (let i = 0; i < w.length; i += 1) { u -= w[i]; if (u <= 0) return i; } return w.length - 1; }

// ── TD walk-forward (P301 estimators + inside-10, as replay-redzone-td.mjs) recording test team-games ─
const FT = read("data/internal/research/nfl/reports/anytime-td-historical-replay-preregistration.json").frozen;
const tdInfo = new Map();   // gameId|team → { lam, rz: Map(playerId → {c, t}) }
const atdRows = [];          // P301-gate rows in test seasons: { gameId, team, playerId, y, p_rz }
{
  const v2 = JSON.parse(zlib.gunzipSync(fs.readFileSync(rel("data/internal/research/nfl/replay/player-games-v2.json.gz"))));
  const T = Object.fromEntries(v2.columns.map((c, i) => [c, i]));
  const rzDoc = JSON.parse(zlib.gunzipSync(fs.readFileSync(rel("data/internal/research/nfl/replay/player-redzone-v1.json.gz"))));
  const RZC = Object.fromEntries(rzDoc.columns.map((c, i) => [c, i]));
  const RZT = Object.fromEntries(rzDoc.teamTotalsColumns.map((c, i) => [c, i]));
  const rzRow = new Map(rzDoc.rows.map((r) => [`${r[0]}|${r[1]}|${r[2]}`, r]));
  const sum = (rs, f) => rs.reduce((a, r) => a + f(r), 0);
  const warm = v2.rows.filter((r) => inSeasons(r[T.season], FT.seasons.warmup) && r[T.participation] !== "UNKNOWN");
  const warmTG = Object.entries(v2.teamTotals).filter(([k]) => Number(k.slice(0, 4)) >= FT.seasons.warmup[0] && Number(k.slice(0, 4)) <= FT.seasons.warmup[1]).map(([, v]) => v);
  const touched = warm.filter((r) => r[T.carries] + r[T.targets] > 0);
  const LG = { teamRushTd: sum(warmTG, (v) => v[3]) / warmTG.length, teamRecTd: sum(warmTG, (v) => v[4]) / warmTG.length, other: sum(touched, (r) => r[T.otherTd]) / touched.length };
  const wt = (idxNow, idx, sNow, s, hl, bd) => 0.5 ** ((idxNow - idx) / hl) * bd ** Math.max(0, sNow - s);
  const pl = new Map(); const bt = new Map(); const tform = new Map();
  const ST = (id) => { if (!pl.has(id)) pl.set(id, { team: null, games: 0, obs: { rush: [], targets: [] }, rz: { c: [], t: [] } }); return pl.get(id); };
  const teamTd = (team, season) => { const t = tform.get(team); if (!t) return { rush: LG.teamRushTd, rec: LG.teamRecTd }; const bd = FT.teamForm.boundaryDecay ** Math.max(0, season - t.season); return { rush: LG.teamRushTd + (t.rush - LG.teamRushTd) * bd, rec: LG.teamRecTd + (t.rec - LG.teamRecTd) * bd }; };
  const share = (st, fam, season) => { let n = 0; let d = 0; for (const o of st.obs[fam]) { const w = wt(st.games, o.idx, season, o.season, FT.share.halfLifeGames, FT.share.boundaryDecay); n += w * o.share; d += w; } return d > 0 ? n / d : 0; };
  const rzShare = (st, kind, overall, season) => { let n = 0; let d = 0; for (const o of st.rz[kind]) { const w = wt(st.games, o.idx, season, o.season, FT.share.halfLifeGames, FT.share.boundaryDecay); n += w * o.num; d += w * o.den; } return (n + H.rzK * overall) / (d + H.rzK); };
  const clip = (p) => Math.min(1 - FT.probabilityClip, Math.max(FT.probabilityClip, p));
  const rws = [...v2.rows].sort((a, b) => (a[T.date] !== b[T.date] ? (a[T.date] < b[T.date] ? -1 : 1) : a[T.gameId] < b[T.gameId] ? -1 : a[T.gameId] > b[T.gameId] ? 1 : 0));
  for (let i = 0; i < rws.length;) {
    let j = i;
    while (j < rws.length && rws[i][T.date] === rws[j][T.date]) j += 1;
    const day = rws.slice(i, j);
    const season = day[0][T.season];
    if (inSeasons(season, P.devSeasons)) { // NFL-004 A: TD form walked through dev seasons
      const tgs = new Map();
      for (const r of day) { const k = `${r[T.gameId]}|${r[T.team]}`; if (!tgs.has(k)) tgs.set(k, { gameId: r[T.gameId], team: r[T.team], rows: new Map() }); tgs.get(k).rows.set(String(r[T.playerId]), r); }
      for (const tg of tgs.values()) {
        const lam = teamTd(tg.team, season);
        const rz = new Map();
        for (const id of bt.get(tg.team) ?? []) {
          const st = pl.get(id);
          const cs = share(st, "rush", season); const ts = share(st, "targets", season);
          const c = rzShare(st, "c", cs, season); const t = rzShare(st, "t", ts, season);
          rz.set(id, { c, t });
          const row = tg.rows.get(id);
          if ((cs >= FT.gate.carryShare || ts >= FT.gate.targetShare) && row && row[T.participation] !== "UNKNOWN") {
            atdRows.push({ gameId: tg.gameId, team: tg.team, playerId: id, y: row[T.rushTd] + row[T.recTd] + row[T.otherTd] > 0 ? 1 : 0, pRz: clip(1 - Math.exp(-(c * lam.rush + t * lam.rec + LG.other))) });
          }
        }
        tdInfo.set(`${tg.gameId}|${tg.team}`, { lam, rz });
      }
    }
    const folded = new Set();
    for (const r of day) {
      if (r[T.participation] === "UNKNOWN") continue;
      const id = String(r[T.playerId]); const st = ST(id);
      const tot = v2.teamTotals[`${r[T.gameId]}|${r[T.team]}`] ?? [0, 0, 0, 0, 0];
      if (st.team !== r[T.team]) { if (st.team) bt.get(st.team)?.delete(id); st.obs = { rush: [], targets: [] }; st.rz = { c: [], t: [] }; st.team = r[T.team]; if (!bt.has(st.team)) bt.set(st.team, new Set()); bt.get(st.team).add(id); }
      const idx = st.games + 1;
      st.obs.rush.push({ share: tot[1] > 0 ? r[T.carries] / tot[1] : 0, idx, season: r[T.season] });
      st.obs.targets.push({ share: tot[2] > 0 ? r[T.targets] / tot[2] : 0, idx, season: r[T.season] });
      const pr = rzRow.get(`${r[T.gameId]}|${r[T.team]}|${id}`); const tt = rzDoc.teamTotals[`${r[T.gameId]}|${r[T.team]}`];
      if (tt && tt[RZT.c10] > 0) st.rz.c.push({ num: pr ? pr[RZC.c10] : 0, den: tt[RZT.c10], idx, season: r[T.season] });
      if (tt && tt[RZT.t10] > 0) st.rz.t.push({ num: pr ? pr[RZC.t10] : 0, den: tt[RZT.t10], idx, season: r[T.season] });
      st.games = idx;
      const tk = `${r[T.gameId]}|${r[T.team]}`;
      if (!folded.has(tk)) { folded.add(tk); const a = 1 - 0.5 ** (1 / FT.teamForm.halfLifeGames); const cur = teamTd(r[T.team], r[T.season]); tform.set(r[T.team], { rush: cur.rush + a * (tot[3] - cur.rush), rec: cur.rec + a * (tot[4] - cur.rec), season: r[T.season] }); }
    }
    i = j;
  }
  var OTHER_TD = LG.other; // eslint-disable-line no-var
}

// ── TD | points table (never the test seasons) ─────────────────────────────────────────────────────
const tg11 = JSON.parse(zlib.gunzipSync(fs.readFileSync(rel("data/internal/research/nfl/sim-v2/team-games-v1.json.gz"))));
const tdByPts = new Map();
for (const t of tg11) if (H.tdTableSeasons.some((w) => inSeasons(t.s, w))) { const k = t.pts; (tdByPts.get(k) ?? tdByPts.set(k, []).get(k)).push(t.passTd + t.rushTd); }
const tdPool = (pts) => { let pool = tdByPts.get(pts) ?? []; for (let w = 1; pool.length < H.tdTableMinObs && w <= 3; w += 1) pool = [...pool, ...(tdByPts.get(pts - w) ?? []), ...(tdByPts.get(pts + w) ?? [])]; return pool.length ? pool : [Math.floor(pts / 7)]; };

// ── game-script fit on dev team-games (realised margin vs pregame expected) ────────────────────────
const devTG = [...poolsByTeamGame.values()].filter((t) => t.pool && inSeasons(t.season, H.devSeasons));
const script = {};
for (const [k, idx] of [["passAtt", 0], ["carries", 1]]) {
  let sxy = 0; let sxx = 0; const pts = [];
  for (const t of devTG) {
    const g = marginOf.get(t.gameId); if (!g || g.homeScore == null) continue;
    const realised = (fr(t.team) === g.home ? 1 : -1) * (g.homeScore - g.awayScore);
    const x = realised - t.m; const y = (table.teamTotals[`${t.gameId}|${t.team}`] ?? [0, 0, 0])[idx] - allocVolume(t)[k];
    sxy += x * y; sxx += x * x; pts.push([x, y]);
  }
  const beta = sxy / sxx;
  const resid = pts.map(([x, y]) => y - beta * x);
  script[k] = { beta, sigma: Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / (resid.length - 1)), n: pts.length };
}
console.log("game script (dev):", JSON.stringify(script));

// ══ NFL-004 A: coupled worlds with production passer credit, dev 2022–2025 ══════════════════════════════
const T0 = Date.now();
const SIGMA_M = wmGate.margin.sigma;
const SIGMA_T = tGate.fit.sigma;
const snap = (x) => { const s = Math.max(0, Math.round(x)); return s === 1 ? 0 : s; };
const RUNS = MODE === "validate" ? 200 : P.runs;
const V2TT = JSON.parse(zlib.gunzipSync(fs.readFileSync(rel("data/internal/research/nfl/replay/player-games-v2.json.gz")))).teamTotals;
const devGames = [...new Set([...poolsByTeamGame.values()].filter((t) => t.pool && inSeasons(t.season, P.devSeasons)).map((t) => t.gameId))].sort();
const sidesOf = new Map();
for (const t of poolsByTeamGame.values()) if (t.pool && inSeasons(t.season, P.devSeasons)) (sidesOf.get(t.gameId) ?? sidesOf.set(t.gameId, []).get(t.gameId)).push(t);
const excl = { gamesConsidered: 0, gamesNoHeads: 0, gamesNotTwoSides: 0, teamGamesSimulated: 0, teamGamesNoStarter: 0, startersZeroAttempts: 0 };
const diagW = { teamWorlds: 0, recTdDrawn: 0, recTdConvertedToRushing: 0, tdCountClipped: 0, otherPasserTds: 0 };
const ROWS = [];
const sumA = (a) => a.reduce((x, y) => x + y, 0);
let gamesDone = 0;
for (const gameId of MODE === "validate" ? devGames.slice(0, 3) : devGames) {
  excl.gamesConsidered += 1;
  const g = marginOf.get(gameId); const muT = muTOf.get(gameId);
  if (!g || g.m == null || muT == null) { excl.gamesNoHeads += 1; continue; }
  const sides = sidesOf.get(gameId) ?? [];
  if (sides.length !== 2) { excl.gamesNotTwoSides += 1; continue; }
  const rng = mulberry32(seedOf(`${P.seed}|${gameId}`));
  const prep = sides.map((t) => {
    excl.teamGamesSimulated += 1;
    const mem = t.members; const n = mem.length;
    const sh = (fam) => { const s = mem.map((mb) => reallocate(mb.shares[fam], t.pool[fam].a, t.pool[fam].v, rho[fam])); return [...s, Math.max(0, 1 - s.reduce((a, b) => a + b, 0))]; };
    const info = tdInfo.get(`${gameId}|${t.team}`);
    const rzc = mem.map((mb) => info?.rz.get(mb.id)?.c ?? 0); const rzt = mem.map((mb) => info?.rz.get(mb.id)?.t ?? 0);
    // starter: highest decayed passAttempts share among active members (> 0), ties → lower playerId
    let st = -1;
    for (let i = 0; i < n; i += 1) { const x = mem[i].shares.passAttempts; if (!(x > 0)) continue; if (st < 0 || x > mem[st].shares.passAttempts || (x === mem[st].shares.passAttempts && mem[i].id < mem[st].id)) st = i; }
    if (st < 0) excl.teamGamesNoStarter += 1;
    if (MODE === "validate") console.log(`  ${gameId} ${t.team}: starter ${st >= 0 ? `${mem[st].name} share ${mem[st].shares.passAttempts.toFixed(3)} att ${mem[st].passAtt}` : "none"}; QB-share members ${mem.filter((x) => x.shares.passAttempts > 0).map((x) => x.name).join(", ")}`);
    if (st >= 0 && !(mem[st].passAtt >= 1)) { excl.startersZeroAttempts += 1; st = -1; }
    return { t, mem, n, V: allocVolume(t), tS: sh("targets"), cS: sh("rushAttempts"), pS: sh("passAttempts"), rzc: [...rzc, Math.max(0, 1 - rzc.reduce((a, b) => a + b, 0))], rzt: [...rzt, Math.max(0, 1 - rzt.reduce((a, b) => a + b, 0))], lam: info?.lam ?? { rush: 0.8, rec: 1.5 }, hasInfo: !!info, sign: fr(t.team) === g.home ? 1 : -1, st, hist: new Float64Array(6), sum: 0, teamRec: 0, teamOff: 0, attShare: 0, attN: 0 };
  });
  for (let r = 0; r < RUNS; r += 1) {
    const M = g.m + SIGMA_M * normal(rng); const Tt = Math.max(2, muT + SIGMA_T * normal(rng));
    const home = snap((Tt + M) / 2); const away = snap((Tt - M) / 2);
    for (const s of prep) {
      const pts = s.sign === 1 ? home : away; const real = s.sign * (home - away);
      const tdPoolHere = tdPool(pts); let off = pts >= 6 ? tdPoolHere[Math.floor(rng() * tdPoolHere.length)] : 0;
      if (6 * off > pts) { off = Math.floor(pts / 6); diagW.tdCountClipped += 1; } // production engine step 3 clip
      let rushTD = binomial(rng, off, s.lam.rush / (s.lam.rush + s.lam.rec)); let recTD = off - rushTD;
      const mTeam = s.sign * g.m;
      const A = Math.max(0, Math.round(s.V.passAtt + script.passAtt.beta * (real - mTeam) + script.passAtt.sigma * normal(rng)));
      const K = Math.max(0, Math.round(s.V.carries + script.carries.beta * (real - mTeam) + script.carries.sigma * normal(rng)));
      const Tg = s.V.passAtt > 0 ? Math.round(A * s.V.targets / s.V.passAtt) : 0;
      const tgt = multinomial(rng, Tg, dirichlet(rng, s.tS.map((x) => x * KAPPA.t)));
      const rec = new Array(s.n + 1).fill(0); let teamRec = 0;
      for (let i = 0; i <= s.n; i += 1) {
        rec[i] = binomial(rng, tgt[i], i < s.n ? s.mem[i].rates.catch : L.catchRate);
        if (rec[i] > 0) gammaDraw(rng, rec[i] * D.receivingShape); // receiving yards: same RNG stream as nfl-game-worlds-v1
        teamRec += rec[i];
      }
      const att = multinomial(rng, A, dirichlet(rng, s.pS.map((x) => x * KAPPA.p)));
      const cmp = A > 0 ? multinomial(rng, teamRec, att.map((x) => x / A)) : att.map(() => 0);
      if (A === 0 && teamRec > 0) cmp[cmp.length - 1] = teamRec;
      const car = multinomial(rng, K, dirichlet(rng, s.cS.map((x) => x * KAPPA.c)));
      for (let i = 0; i < s.n; i += 1) if (car[i] > 0) gammaDraw(rng, car[i] * D.rushingShape);
      // production engine step 8: receiving TD → receiver (uncredited catch, rzTarget) → passer (uncredited completions)
      const rushBy = new Array(s.n + 1).fill(0); const recBy = new Array(s.n + 1).fill(0); const passBy = new Array(s.n + 1).fill(0);
      diagW.recTdDrawn += recTD;
      for (let k = 0; k < recTD;) {
        const i = pick(rng, s.rzt.map((w, ix) => (rec[ix] - recBy[ix] > 0 ? w : 0)));
        const j = i < 0 ? -1 : pick(rng, cmp.map((x, ix) => (x - passBy[ix] > 0 ? x - passBy[ix] : 0)));
        if (i < 0 || j < 0) { recTD -= 1; rushTD += 1; diagW.recTdConvertedToRushing += 1; continue; }
        recBy[i] += 1; passBy[j] += 1; k += 1;
        if (j === s.n) diagW.otherPasserTds += 1;
      }
      for (let k = 0; k < rushTD; k += 1) { let i = pick(rng, s.rzc.map((w, ix) => (car[ix] - rushBy[ix] > 0 ? w : 0))); if (i < 0) i = s.n; rushBy[i] += 1; }
      if (sumA(cmp) !== teamRec) refuse("invariant: completions != receptions");
      if (sumA(rushBy) + sumA(recBy) !== off || sumA(passBy) !== sumA(recBy) || sumA(recBy) !== recTD) refuse("invariant: scorer/passer TDs != team TDs");
      for (let i = 0; i <= s.n; i += 1) { if (recBy[i] > rec[i]) refuse("invariant: receiving TDs exceed receptions"); if (passBy[i] > cmp[i]) refuse("invariant: passing TDs exceed completions"); if (i < s.n && rushBy[i] > car[i]) refuse("invariant: rushing TDs exceed carries"); }
      diagW.teamWorlds += 1;
      if (s.st >= 0) {
        const c = passBy[s.st];
        s.hist[Math.min(5, c)] += 1; s.sum += c; s.teamRec += recTD; s.teamOff += off;
        if (A > 0) { s.attShare += att[s.st] / A; s.attN += 1; }
      }
    }
  }
  for (const s of prep) {
    if (s.st < 0) continue;
    const mb = s.mem[s.st];
    const y = ptdOf.get(`${gameId}|${mb.id}`);
    if (y == null) refuse(`no outcome for ${gameId}|${mb.id}`);
    const W = { pmf: Array.from(s.hist, (x) => x / RUNS), mean: s.sum / RUNS };
    const share = s.pS[s.st]; const a = share * s.V.passAtt; const varAtt = a + share * share * D.volumeSigmaPass * D.volumeSigmaPass;
    const rr = mb.ptd.r; const bMean = a * rr; const bVar = a * rr * (1 - rr) + rr * rr * varAtt;
    const dB = countDist(bMean, bVar);
    const bp = [0, 1, 2, 3, 4].map((k) => countPmf(dB, k)); bp.push(Math.max(0, 1 - sumA(bp)));
    const B = { pmf: bp, mean: bMean, dist: dB.kind };
    const Hm = { pmf: W.pmf.map((p, k) => P.hybridWeight * p + (1 - P.hybridWeight) * bp[k]), mean: P.hybridWeight * W.mean + (1 - P.hybridWeight) * bMean };
    const tt1 = table.teamTotals[`${gameId}|${s.t.team}`] ?? [0, 0, 0]; const tt2 = V2TT[`${gameId}|${s.t.team}`] ?? [0, 0, 0, 0, 0];
    ROWS.push({
      gameId, team: s.t.team, season: s.t.season, playerId: mb.id, name: mb.name, y, rate: rr, envPts: (muT + s.sign * g.m) / 2,
      W, B, H: Hm, expAtt: a, share,
      mech: { wTeamRec: s.teamRec / RUNS, wTeamOff: s.teamOff / RUNS, aTeamRec: tt2[4], aTeamOff: tt2[3] + tt2[4], wAttShare: s.attN ? s.attShare / s.attN : 0, aAttShare: tt1[0] > 0 ? mb.passAtt / tt1[0] : 0 },
    });
  }
  gamesDone += 1;
  if (MODE === "score" && gamesDone % 100 === 0) console.log(`  ${gamesDone} games, ${((Date.now() - T0) / 1000).toFixed(0)}s`);
}
if (MODE === "validate") { console.log(`VALIDATE (plumbing only, no metric): ${diagW.teamWorlds} team-worlds over ${gamesDone} games, 0 invariant violations; ${ROWS.length} starter rows; exclusions ${JSON.stringify(excl)}`); process.exit(0); }

// ── metrics (as registered) ───────────────────────────────────────────────────────────────────────────
const MODELS = ["W", "B", "H"];
const NAME = { W: "WORLD", B: "BASELINE", H: "HYBRID" };
const clipP = (p) => Math.min(1 - P.probabilityClip, Math.max(P.probabilityClip, p));
const rpsOf = (pmf, y) => { let F = 0; let s = 0; for (let k = 0; k <= 4; k += 1) { F += pmf[k]; const o = y <= k ? 1 : 0; s += (F - o) ** 2; } return s / 5; };
const lineP = (pmf, L0) => Math.max(0, Math.min(1, 1 - pmf.slice(0, L0).reduce((a, b) => a + b, 0)));
function binMetrics(list) {
  const n = list.length; let ll = 0; let sp = 0; let sy = 0; const bins = Array.from({ length: P.eceBins }, () => ({ n: 0, p: 0, y: 0 }));
  for (const { p, y } of list) { const c = clipP(p); ll -= y ? Math.log(c) : Math.log(1 - c); sp += c; sy += y; const b = bins[Math.min(P.eceBins - 1, Math.floor(c * P.eceBins))]; b.n += 1; b.p += c; b.y += y; }
  return { n, logLoss: ll / n, ece: bins.reduce((a, b) => a + (b.n ? (b.n / n) * Math.abs(b.p / b.n - b.y / b.n) : 0), 0), meanP: sp / n, rate: sy / n, reliability: bins.map((b, i) => ({ bin: `${i / 10}-${(i + 1) / 10}`, n: b.n, meanP: b.n ? b.p / b.n : null, rate: b.n ? b.y / b.n : null })).filter((b) => b.n) };
}
function evalSet(rows) {
  const n = rows.length; if (!n) return null;
  const meanY = rows.reduce((a, x) => a + x.y, 0) / n;
  const out = { n, actualMean: meanY };
  for (const m of MODELS) {
    const lines = {};
    for (const L0 of P.lines) lines[`ge${L0}`] = binMetrics(rows.map((x) => ({ p: lineP(x[m].pmf, L0), y: x.y >= L0 ? 1 : 0 })));
    out[NAME[m]] = { rps: rows.reduce((a, x) => a + rpsOf(x[m].pmf, x.y), 0) / n, predictedMean: rows.reduce((a, x) => a + x[m].mean, 0) / n, level: meanY > 0 ? rows.reduce((a, x) => a + x[m].mean, 0) / n / meanY : null, lines };
  }
  return out;
}
const N_ROWS = ROWS.length;
const main = evalSet(ROWS);
const pmfTable = { categories: ["0", "1", "2", "3", "4", "5+"], actual: [0, 1, 2, 3, 4, 5].map((k) => ROWS.filter((x) => Math.min(5, x.y) === k).length / N_ROWS) };
for (const m of MODELS) pmfTable[NAME[m]] = [0, 1, 2, 3, 4, 5].map((k) => ROWS.reduce((a, x) => a + x[m].pmf[k], 0) / N_ROWS);

// decision
const bars = {}; const outcome = {};
const insufficient = N_ROWS < P.minimumN;
for (const m of ["W", "H"]) {
  const c = main[NAME[m]]; const b = main.BASELINE;
  const bb = {
    rps: { pass: c.rps <= b.rps * P.rpsRatioMax, observed: [c.rps, b.rps], ratio: c.rps / b.rps },
    ece: Object.fromEntries(P.lines.map((L0) => [`ge${L0}`, { pass: c.lines[`ge${L0}`].ece <= P.eceMax, observed: c.lines[`ge${L0}`].ece }])),
    logLoss: Object.fromEntries(P.lines.map((L0) => [`ge${L0}`, { pass: c.lines[`ge${L0}`].logLoss <= b.lines[`ge${L0}`].logLoss + P.logLossSlack, observed: [c.lines[`ge${L0}`].logLoss, b.lines[`ge${L0}`].logLoss] }])),
    level: { pass: c.level >= P.levelBand[0] && c.level <= P.levelBand[1], observed: c.level },
  };
  bars[NAME[m]] = bb;
  const all = [bb.rps.pass, ...Object.values(bb.ece).map((x) => x.pass), ...Object.values(bb.logLoss).map((x) => x.pass), bb.level.pass];
  outcome[NAME[m]] = insufficient ? "INSUFFICIENT_DATA" : all.every(Boolean) ? "PROCEED_TO_FORWARD_SHADOW" : "DO_NOT_PROCEED";
}
bars.BASELINE_informational = { ece: Object.fromEntries(P.lines.map((L0) => [`ge${L0}`, { pass: main.BASELINE.lines[`ge${L0}`].ece <= P.eceMax, observed: main.BASELINE.lines[`ge${L0}`].ece }])), level: { pass: main.BASELINE.level >= P.levelBand[0] && main.BASELINE.level <= P.levelBand[1], observed: main.BASELINE.level } };

// bootstrap (informational, game-clustered)
const byGame = new Map(); ROWS.forEach((x, i) => (byGame.get(x.gameId) ?? byGame.set(x.gameId, []).get(x.gameId)).push(i));
const gameList = [...byGame.keys()].sort();
const rpsRow = ROWS.map((x) => ({ W: rpsOf(x.W.pmf, x.y), B: rpsOf(x.B.pmf, x.y), H: rpsOf(x.H.pmf, x.y) }));
const brng = mulberry32(P.bootstrap.seed);
const ratios = { W: [], H: [] };
for (let b = 0; b < P.bootstrap.resamples; b += 1) {
  const s = { W: 0, B: 0, H: 0 };
  for (let k = 0; k < gameList.length; k += 1) { for (const i of byGame.get(gameList[Math.floor(brng() * gameList.length)])) { s.W += rpsRow[i].W; s.B += rpsRow[i].B; s.H += rpsRow[i].H; } }
  ratios.W.push(s.W / s.B); ratios.H.push(s.H / s.B);
}
const qtl = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
const bootstrap = Object.fromEntries(["W", "H"].map((m) => [`${NAME[m]}_over_BASELINE_rps`, { median: qtl(ratios[m], 0.5), ci95: [qtl(ratios[m], 0.025), qtl(ratios[m], 0.975)], shareAtOrBelow1_01: ratios[m].filter((r) => r <= P.rpsRatioMax).length / ratios[m].length }]));

// diagnostics (pre-specified, always reported)
const brief = (rows) => { const e = evalSet(rows); if (!e) return null; return { n: e.n, actualMean: e.actualMean, ...Object.fromEntries(MODELS.map((m) => [NAME[m], { predictedMean: e[NAME[m]].predictedMean, level: e[NAME[m]].level, rps: e[NAME[m]].rps }])) }; };
const terciles = (key) => { const v = ROWS.map((x) => x[key]).sort((a, b) => a - b); const c1 = v[Math.floor(v.length / 3)]; const c2 = v[Math.floor((2 * v.length) / 3)]; return { cuts: [c1, c2], groups: { low: brief(ROWS.filter((x) => x[key] < c1)), mid: brief(ROWS.filter((x) => x[key] >= c1 && x[key] < c2)), high: brief(ROWS.filter((x) => x[key] >= c2)) } }; };
const sumR = (f) => ROWS.reduce((a, x) => a + f(x), 0);
const mechanism = {
  teamPassingTdLevel: { worldMeanTeamRecTd: sumR((x) => x.mech.wTeamRec) / N_ROWS, actualMeanTeamRecTd: sumR((x) => x.mech.aTeamRec) / N_ROWS, level: sumR((x) => x.mech.wTeamRec) / sumR((x) => x.mech.aTeamRec) },
  teamOffensiveTdLevel: { worldMean: sumR((x) => x.mech.wTeamOff) / N_ROWS, actualMean: sumR((x) => x.mech.aTeamOff) / N_ROWS, level: sumR((x) => x.mech.wTeamOff) / sumR((x) => x.mech.aTeamOff) },
  worldRecShareOfOffTd: sumR((x) => x.mech.wTeamRec) / sumR((x) => x.mech.wTeamOff),
  actualRecShareOfOffTd: sumR((x) => x.mech.aTeamRec) / sumR((x) => x.mech.aTeamOff),
  starterCreditShare: { world: sumR((x) => x.W.mean) / sumR((x) => x.mech.wTeamRec), actual: sumR((x) => x.y) / sumR((x) => x.mech.aTeamRec) },
  starterAttemptShare: { world: sumR((x) => x.mech.wAttShare) / N_ROWS, actual: sumR((x) => x.mech.aAttShare) / N_ROWS, baselineExpectedShare: sumR((x) => x.share) / N_ROWS },
  receivingTdConvertedToRushing: { converted: diagW.recTdConvertedToRushing, drawn: diagW.recTdDrawn, rate: diagW.recTdConvertedToRushing / diagW.recTdDrawn },
  tdCountClippedTeamWorlds: diagW.tdCountClipped, otherPasserTds: diagW.otherPasserTds, teamWorlds: diagW.teamWorlds,
  baselineExpectedAttempts: sumR((x) => x.expAtt) / N_ROWS,
};
const diagnostics = {
  pmfTable,
  byQbTier_baselineRateTerciles: terciles("rate"),
  byTeamTdEnvironment_expectedTeamPointsTerciles: terciles("envPts"),
  bySeason: Object.fromEntries([2022, 2023, 2024, 2025].map((s) => [s, brief(ROWS.filter((x) => x.season === s))])),
  worldMechanism: mechanism,
  baselineDistKinds: { poisson: ROWS.filter((x) => x.B.dist === "poisson").length, nb: ROWS.filter((x) => x.B.dist === "nb").length },
};

const r5 = (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(5)) : v);
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
console.log(`rows ${N_ROWS}; exclusions ${JSON.stringify(excl)}`);
for (const m of MODELS) { const c = main[NAME[m]]; console.log(`${NAME[m].padEnd(9)} RPS ${c.rps.toFixed(5)} level ${c.level.toFixed(4)} | ${P.lines.map((L0) => `>=${L0}: ll ${c.lines[`ge${L0}`].logLoss.toFixed(5)} ece ${c.lines[`ge${L0}`].ece.toFixed(4)}`).join(" | ")}`); }
console.log("outcome", JSON.stringify(outcome));
console.log("mechanism", JSON.stringify(mechanism, r5));
fs.writeFileSync(rel(OUT_PATH), JSON.stringify({
  schemaVersion: 1, artifact: "nfl-004-passing-td-development", dataClass: "PRIVATE_RESEARCH",
  evidenceTier: "DEVELOPMENT — 2022-2025, the WORLD's TD|points table, game script, kappas and (shared with BASELINE) NFL-003 volume/rho were fit on these seasons; not blind. Nothing publishes.",
  generatedAt: NOW,
  preregistration: { path: PREREG_PATH, commit: preregCommit },
  scriptSha256: sha("scripts/research/nfl/replay-passing-td.mjs"),
  scriptCommitAtRun: git("rev-parse", "HEAD"),
  inputs: { qbPassingTd: { path: PTD_PATH, sha256: sha(PTD_PATH), accounting: PTD.accounting }, playerGamesV1Sha256: sha(TABLE_PATH), playerGamesV2Sha256: sha("data/internal/research/nfl/replay/player-games-v2.json.gz"), teamGamesSha256: sha("data/internal/research/nfl/sim-v2/team-games-v1.json.gz") },
  frozen: P,
  devFits: { gameScript: script, kappa: KAPPA, rho, sigmaMargin: SIGMA_M, sigmaTotal: SIGMA_T, leaguePriorBySeason: Object.fromEntries([2022, 2023, 2024, 2025].map((s) => [s, leaguePrior(s)])) },
  population: { starterRows: N_ROWS, games: gameList.length, exclusions: excl },
  results: main, bars, outcome, bootstrapInformational: bootstrap, diagnostics,
  runtime: { runs: RUNS, seed: P.seed, teamWorldsChecked: diagW.teamWorlds, invariantViolations: 0, wallSeconds: Math.round((Date.now() - T0) / 1000), node: process.version },
  consequence: "Nothing publishes on any outcome. Passing-TD marginals stay unpublished until a blind forward (2026) look exists and passes.",
}, r5, 1), { flag: "wx" });
console.log(`wrote ${OUT_PATH}`);
