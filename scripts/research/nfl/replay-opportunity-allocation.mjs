#!/usr/bin/env node
/**
 * NFL-003 — OPPORTUNITY ALLOCATION, DEVELOPMENT LOOK (third look at 2014–2021, disclosed).
 *
 * Executes data/internal/research/nfl/reports/nfl-003-opportunity-allocation-preregistration.json. The engine is P300's
 * replay-player-props-v2.mjs: walk-forward, gate, share/rate estimators, distributions, dispersion-scale fit and metrics
 * are the same code (copied verbatim; P300's constants are read from P300's own preregistration). The incumbent
 * levelShareTeamForm is recomputed in-run and must reproduce P300's second-look MAE, or the run refuses.
 *
 * allocV1 changes exactly two inputs of the incumbent's moments: the SHARE (active-set reallocation with a conserved
 * OTHER floor) and the VOLUME (team form + opponent allowed + expected margin, fitted on dev team-games). Two passes:
 * pass 1 collects pregame team-volume features to fit the volume on dev; pass 2 is the scored walk-forward.
 *
 *   --validate            DEV seasons only (2022–2025): volume fit, rho selection, dev metrics. No 2014–2021 metric.
 *   --score --now <ISO>   the one development look at 2014–2021. Refuses unless the registration is committed and
 *                         unmodified, and refuses if the output exists.
 * Lives outside app/ on purpose: research runs never trigger an app build.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { winMarginGate, rowsFromTable, replayWinMarginHeads, WIN_MARGIN_RECEIPT, WIN_MARGIN_PREREG, GAMES_HISTORY_V2 } from "../../../app/src/lib/sports/nfl/win-margin-heads.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const PREREG_PATH = "data/internal/research/nfl/reports/nfl-003-opportunity-allocation-preregistration.json";
const OUT_PATH = "data/internal/research/nfl/reports/nfl-003-opportunity-allocation-development.json";
const P300_PREREG = "data/internal/research/nfl/reports/player-props-share-level-preregistration.json";
const P300_RECEIPT = "data/internal/research/nfl/reports/player-props-share-level-second-look.json";
const TABLE_PATH = "data/internal/research/nfl/replay/player-games-v1.json.gz";

const argv = process.argv.slice(2);
const MODE = argv.includes("--score") ? "score" : argv.includes("--validate") ? "validate" : null;
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };
if (!MODE) refuse("usage: --validate | --score --now <ISO>");

const NOW = argOf("--now");
let preregCommit = null;
if (MODE === "score") {
  if (!NOW || !Number.isFinite(Date.parse(NOW))) refuse("--now <ISO> required");
  if (fs.existsSync(rel(OUT_PATH))) refuse(`${OUT_PATH} already exists — the development look has been taken`);
  const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
  preregCommit = git("log", "-1", "--format=%H %cI", "--", PREREG_PATH);
  if (!preregCommit) refuse("the preregistration is not committed");
  try { git("diff", "--quiet", "HEAD", "--", PREREG_PATH); } catch { refuse("the preregistration has uncommitted changes"); }
}

const G = JSON.parse(fs.readFileSync(rel(PREREG_PATH), "utf8")).frozen;
const F = JSON.parse(fs.readFileSync(rel(P300_PREREG), "utf8")).frozen;
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(rel(p))).digest("hex");
if (sha(TABLE_PATH) !== G.inputs.playerGamesSha256) refuse("player-games table does not match the registered hash");
if (sha("scripts/research/nfl/replay-player-props-v2.mjs") !== G.inputs.p300EngineSha256) refuse("the P300 engine changed since registration");

const table = JSON.parse(zlib.gunzipSync(fs.readFileSync(rel(TABLE_PATH))));
const C = Object.fromEntries(table.columns.map((c, i) => [c, i]));
const inSeasons = (s, [a, b]) => s >= a && s <= b;

// ── pregame expected margin from the published margin head (walk-forward) ─────────────────────────
const FRANCHISE = { STL: "LA", SD: "LAC", OAK: "LV", JAC: "JAX", LAR: "LA" };
const fr = (t) => FRANCHISE[t] ?? t;
const wmGate = winMarginGate(JSON.parse(fs.readFileSync(rel(WIN_MARGIN_RECEIPT), "utf8")), JSON.parse(fs.readFileSync(rel(WIN_MARGIN_PREREG), "utf8")));
if (wmGate.margin.state !== "READY") refuse("published margin head not READY");
const marginOf = new Map();
replayWinMarginHeads({ games: rowsFromTable(JSON.parse(fs.readFileSync(rel(GAMES_HISTORY_V2), "utf8"))), gate: wmGate, onGame: (g, x) => marginOf.set(g.gameId, { home: fr(g.home), m: x.marginMean }) });
const teamMargin = (gameId, team) => { const g = marginOf.get(gameId); if (!g || g.m == null) return 0; return fr(team) === g.home ? g.m : -g.m; };

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
              share, pool: pool[fam], rates, tf, of, m,
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
      st.games = idx;
      const tk = `${r[C.gameId]}|${r[C.team]}`;
      if (!teamsFolded.has(tk)) { teamsFolded.add(tk); fold(teamForm, r[C.team], r[C.season], totals); fold(oppForm, r[C.opponent], r[C.season], totals); }
    }
    i = j;
  }
  return { teamGames, scored };
}

const { teamGames, scored } = walk();
const isDev = (s) => inSeasons(s.season, F.seasons.dev);

// ── volume fit on dev team-games (least squares, no intercept; per family) ─────────────────────────
function ols3(X, y) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; const b = [0, 0, 0];
  X.forEach((x, n) => { for (let r = 0; r < 3; r += 1) { b[r] += x[r] * y[n]; for (let c = 0; c < 3; c += 1) A[r][c] += x[r] * x[c]; } });
  for (let col = 0; col < 3; col += 1) {
    let piv = col; for (let r = col + 1; r < 3; r += 1) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]]; [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = 0; r < 3; r += 1) { if (r === col) continue; const f = A[r][col] / A[col][col]; for (let c = col; c < 3; c += 1) A[r][c] -= f * A[col][c]; b[r] -= f * b[col]; }
  }
  return b.map((v, i) => v / A[i][i]);
}
const volCoef = {};
for (const fam of FAMILIES) {
  const k = VOLKEY[fam];
  const dev = teamGames.filter(isDev);
  const X = dev.map((t) => [t.tf[k] - INTERCEPT[k], t.of[k] - INTERCEPT[k], t.m]);
  const y = dev.map((t) => t.totals[TOTIDX[fam]] - INTERCEPT[k]);
  const [bT, bO, g] = ols3(X, y);
  volCoef[fam] = { bT, bO, g, devTeamGames: dev.length };
}
const allocVolume = (x) => {
  const out = {};
  for (const fam of FAMILIES) { const k = VOLKEY[fam]; const c = volCoef[fam]; out[k] = INTERCEPT[k] + c.bT * (x.tf[k] - INTERCEPT[k]) + c.bO * (x.of[k] - INTERCEPT[k]) + c.g * x.m; }
  return out;
};

// ── variants → moments ─────────────────────────────────────────────────────────────────────────────
const variantMoments = (x, variant, rho) => {
  if (variant === "incumbent") return momentsFromParts(x.mkt, x.share, x.tf, x.rates);
  const sh = variant === "allocVolumeOnly" ? x.share : reallocate(x.share, x.pool.a, x.pool.v, rho);
  const vol = variant === "allocRedistributeOnly" ? x.tf : allocVolume(x);
  return momentsFromParts(x.mkt, sh, vol, x.rates);
};
// invariant: the reallocated named pool never exceeds 1 − floor and never grows by more than the vacated mass
for (const x of scored) for (const rho of G.rhoGrid) {
  const named = x.pool.a > 0 ? reallocate(x.pool.a, x.pool.a, x.pool.v, rho) : 0;
  if (named > 1 - G.otherFloor + 1e-9) refuse(`invariant: named pool ${named} above 1 - floor at ${x.key}`);
  if (named - x.pool.a > rho * x.pool.v + 1e-9) refuse(`invariant: reallocated more than the vacated mass at ${x.key}`);
}

const coverOf = (x, e) => (x.isCount && (x.actual === e.p10 || x.actual === e.p90) ? 0.5 : x.actual >= e.p10 && x.actual <= e.p90 ? 1 : 0);
function fitScale(list, variant, rho) {
  const trace = F.dispersionScaleGrid.map((s) => ({ s, devCoverage80: list.reduce((a, x) => a + coverOf(x, evaluateRow(variantMoments(x, variant, rho), s, 0)), 0) / list.length }));
  return [...trace].sort((a, b) => Math.abs(a.devCoverage80 - 0.8) - Math.abs(b.devCoverage80 - 0.8) || a.s - b.s)[0].s;
}
function realize(list, variant, rho, s) {
  return list.map((x) => { const m = variantMoments(x, variant, rho); const e = evaluateRow(m, s, x.rolling4); return { season: x.season, actual: x.actual, rolling4: x.rolling4, shareVol: x.shareVol, isCount: x.isCount, mean: m.mean, p10: e.p10, p50: e.p50, p90: e.p90, pOverLine: e.pOver, line: x.rolling4, key: x.key }; });
}

// rho per family on dev (allocV1), then scales per (market, variant) on dev
const rhoTrace = {};
const rho = {};
const selectMkt = { targets: "player_receptions", rushAttempts: "player_rush_yds", passAttempts: "player_pass_yds" };
for (const fam of FAMILIES) {
  const dev = scored.filter((x) => x.mkt === selectMkt[fam] && isDev(x));
  rhoTrace[fam] = G.rhoGrid.map((r) => { const s = fitScale(dev, "allocV1", r); const out = realize(dev, "allocV1", r, s); return { rho: r, scale: s, devMae: out.reduce((a, x) => a + Math.abs(x.p50 - x.actual), 0) / out.length }; });
  rho[fam] = [...rhoTrace[fam]].sort((a, b) => a.devMae - b.devMae || a.rho - b.rho)[0].rho;
}
const VARIANTS = ["incumbent", "allocV1", "allocRedistributeOnly", "allocVolumeOnly"];
const scale = {};
for (const mkt of MARKETS) for (const v of VARIANTS) scale[`${mkt}|${v}`] = fitScale(scored.filter((x) => x.mkt === mkt && isDev(x)), v, rho[FAMILY_OF[mkt]]);

// ── metrics (P300, verbatim shape) ─────────────────────────────────────────────────────────────────
function metrics(list) {
  if (MODE === "validate" && list.some((x) => !isDev(x))) throw new Error("a non-dev row reached a metric in --validate");
  const n = list.length;
  if (!n) return null;
  const avg = (f) => list.reduce((s, x) => s + f(x), 0) / n;
  const withLine = list.filter((x) => x.pOverLine != null);
  const bins = Array.from({ length: F.bars.eceBins }, () => ({ n: 0, p: 0, y: 0 }));
  for (const x of withLine) { const b = bins[Math.min(F.bars.eceBins - 1, Math.floor(x.pOverLine * F.bars.eceBins))]; b.n += 1; b.p += x.pOverLine; b.y += x.actual > x.line ? 1 : 0; }
  const ece = withLine.length ? bins.reduce((s, b) => s + (b.n ? (b.n / withLine.length) * Math.abs(b.p / b.n - b.y / b.n) : 0), 0) : null;
  const meanForecast = avg((x) => x.mean);
  const meanActual = avg((x) => x.actual);
  return { n, mae: avg((x) => Math.abs(x.p50 - x.actual)), rolling4Mae: avg((x) => Math.abs(x.rolling4 - x.actual)), shareVolMae: avg((x) => Math.abs(x.shareVol - x.actual)), coverage80: avg((x) => coverOf(x, x)), ece, eceN: withLine.length, meanForecast, meanActual, level: meanActual > 0 ? meanForecast / meanActual : null };
}
const r5 = (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(5)) : v);
const fmt = (m) => `n ${m.n} · mae ${m.mae.toFixed(3)} · cov80 ${m.coverage80.toFixed(3)} · ece ${m.ece?.toFixed(3)} · level ${m.level?.toFixed(3)}`;
const rowsFor = (mkt, v, pred) => realize(scored.filter((x) => x.mkt === mkt && pred(x)), v, rho[FAMILY_OF[mkt]], scale[`${mkt}|${v}`]);

if (MODE === "validate") {
  console.log("volume fit (dev):", JSON.stringify(volCoef, r5));
  console.log("rho (dev):", JSON.stringify(rho), JSON.stringify(rhoTrace, r5));
  console.log("dispersion scales (dev):", JSON.stringify(scale));
  for (const mkt of MARKETS) {
    for (const v of VARIANTS) console.log(`DEV ${mkt.padEnd(21)} ${v.padEnd(22)} ${fmt(metrics(rowsFor(mkt, v, isDev)))}`);
    console.log("");
  }
  process.exit(0);
}

// ── --score: the one development look at 2014–2021 ─────────────────────────────────────────────────
const held = (x) => inSeasons(x.season, G.seasons.development);
const p300 = JSON.parse(fs.readFileSync(rel(P300_RECEIPT), "utf8"));
const checks = {};
for (const mkt of MARKETS) {
  const expected = p300.results[mkt].teamFormVolume.overall.mae;
  const observed = metrics(rowsFor(mkt, "incumbent", held)).mae;
  checks[mkt] = { expected, observed, pass: Math.abs(expected - observed) <= 1e-3 };
}
if (Object.values(checks).some((c) => !c.pass)) { console.error(JSON.stringify(checks)); refuse("the recomputed incumbent does not reproduce P300's second-look MAE"); }

function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pairedBootstrap(cand, inc) {
  const incBy = new Map(inc.map((x) => [x.key, x]));
  const agg = new Map();
  for (const x of cand) { const y = incBy.get(x.key); const d = Math.abs(x.p50 - x.actual) - Math.abs(y.p50 - y.actual); const o = agg.get(x.season) ?? { sum: 0, n: 0 }; o.sum += d; o.n += 1; agg.set(x.season, o); }
  const seasons = [...agg.keys()].sort();
  const rand = mulberry32(G.bootstrap.seed);
  const stats = [];
  for (let b = 0; b < G.bootstrap.resamples; b += 1) { let s = 0; let n = 0; for (let k = 0; k < seasons.length; k += 1) { const o = agg.get(seasons[Math.floor(rand() * seasons.length)]); s += o.sum; n += o.n; } stats.push(s / n); }
  stats.sort((a, b) => a - b);
  const tot = [...agg.values()].reduce((a, o) => ({ sum: a.sum + o.sum, n: a.n + o.n }), { sum: 0, n: 0 });
  return { point: tot.sum / tot.n, lo95: stats[Math.floor(0.025 * stats.length)], hi95: stats[Math.ceil(0.975 * stats.length) - 1] };
}
const eraPreds = G.eras.map(([a, b]) => ({ key: `${a}-${b}`, pred: (x) => inSeasons(x.season, [a, b]) }));
const results = {};
const bars = {};
const outcome = {};
for (const mkt of MARKETS) {
  results[mkt] = {};
  for (const v of VARIANTS) {
    results[mkt][v] = {
      dispersionScale: scale[`${mkt}|${v}`],
      overall: metrics(rowsFor(mkt, v, held)),
      eras: Object.fromEntries(eraPreds.map((e) => [e.key, metrics(rowsFor(mkt, v, (x) => held(x) && e.pred(x)))])),
    };
  }
  const R = results[mkt];
  const boot = pairedBootstrap(rowsFor(mkt, "allocV1", held), rowsFor(mkt, "incumbent", held));
  const eras = Object.keys(R.allocV1.eras);
  const b = G.bars;
  const inLevel = (m) => m.level >= b.levelBand[0] && m.level <= b.levelBand[1];
  bars[mkt] = {
    maeBelowIncumbent: { pass: R.allocV1.overall.mae < R.incumbent.overall.mae && eras.every((e) => R.allocV1.eras[e].mae < R.incumbent.eras[e].mae), observed: { overall: [R.allocV1.overall.mae, R.incumbent.overall.mae], eras: Object.fromEntries(eras.map((e) => [e, [R.allocV1.eras[e].mae, R.incumbent.eras[e].mae]])) } },
    notNoise: { pass: boot.hi95 < 0, observed: boot },
    coverage80: { pass: R.allocV1.overall.coverage80 >= b.coverageBand[0] && R.allocV1.overall.coverage80 <= b.coverageBand[1], observed: R.allocV1.overall.coverage80 },
    calibration: { pass: R.allocV1.overall.ece <= b.eceMax && eras.every((e) => R.allocV1.eras[e].ece <= b.eceEraMax) && R.allocV1.overall.ece <= R.incumbent.overall.ece + b.eceSlackVsIncumbent, observed: { overall: R.allocV1.overall.ece, incumbent: R.incumbent.overall.ece, eras: Object.fromEntries(eras.map((e) => [e, R.allocV1.eras[e].ece])) } },
    level: { pass: inLevel(R.allocV1.overall) && eras.every((e) => inLevel(R.allocV1.eras[e])), observed: { overall: R.allocV1.overall.level, eras: Object.fromEntries(eras.map((e) => [e, R.allocV1.eras[e].level])) } },
  };
  outcome[mkt] = Object.values(bars[mkt]).every((x) => x.pass) ? "PROCEED_TO_FORWARD" : "DO_NOT_PROCEED";
}
const receipt = {
  schemaVersion: 1,
  artifact: "nfl-003-opportunity-allocation-development",
  dataClass: "PRIVATE_RESEARCH",
  evidenceTier: "THIRD_LOOK_DEVELOPMENT — 2014-2021 was scored by P299 (blind) and P300 (second look); not a blind result. Only the 2026 forward test can make a family eligible.",
  generatedAt: NOW,
  preregistration: { path: PREREG_PATH, commit: preregCommit },
  scriptSha256: sha("scripts/research/nfl/replay-opportunity-allocation.mjs"),
  implementationChecks: checks,
  devFits: { volume: volCoef, rho, rhoTrace, dispersionScales: scale },
  population: Object.fromEntries(MARKETS.map((m) => [m, scored.filter((x) => x.mkt === m && held(x)).length])),
  results,
  bars,
  outcome,
  consequence: "Nothing publishes from this receipt. A PROCEED_TO_FORWARD family gets a blind 2026 forward capture; only a forward pass supports a founder-approved promotion PR.",
};
fs.writeFileSync(rel(OUT_PATH), JSON.stringify(receipt, r5, 1), { flag: "wx" });
console.log(JSON.stringify(checks));
for (const mkt of MARKETS) {
  for (const v of VARIANTS) console.log(`${mkt.padEnd(21)} ${v.padEnd(22)} ${fmt(results[mkt][v].overall)}`);
  console.log(`  → ${outcome[mkt]} · failed: ${Object.entries(bars[mkt]).filter(([, x]) => !x.pass).map(([k]) => k).join(", ") || "none"}\n`);
}
