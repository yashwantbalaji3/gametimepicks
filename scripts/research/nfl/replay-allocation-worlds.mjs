#!/usr/bin/env node
/**
 * NFL-005 — ALLOCATION WORLDS, DEVELOPMENT LOOK. Executes data/internal/research/nfl/reports/nfl-005-allocation-worlds-preregistration.json.
 *
 * Jointly coherent team-game worlds generated around NFL-003 allocV1's inputs: team volume, Dirichlet-multinomial
 * allocation over the active players + OTHER, binomial catches, gamma yards per opportunity, passing = Σ receiving by
 * construction. Compared with allocV1's analytic marginals on identical P300 rows (2019–2021). The NFL-003 engine
 * section is copied verbatim from replay-opportunity-allocation.mjs; rho / volume / analytic scales come from the
 * committed NFL-003 development receipt. Kappas are fit on dev (2022–2025) only.
 *
 *   node scripts/research/nfl/replay-allocation-worlds.mjs --validate          (dev fit only; prints)
 *   node scripts/research/nfl/replay-allocation-worlds.mjs --score --now <ISO> (one look; refuses if the output exists)
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
const read = (p) => JSON.parse(fs.readFileSync(rel(p), "utf8"));
const PREREG_PATH = "data/internal/research/nfl/reports/nfl-005-allocation-worlds-preregistration.json";
const OUT_PATH = "data/internal/research/nfl/reports/nfl-005-allocation-worlds-development.json";
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
const H = read(PREREG_PATH).frozen;
const G = read(NFL003_PREREG).frozen;
const F = read(P300_PREREG).frozen;
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(rel(p))).digest("hex");
if (sha(NFL003_DEV) !== H.inputs.nfl003DevelopmentSha256) refuse("NFL-003 development receipt changed");
if (sha(TABLE_PATH) !== H.inputs.playerGamesSha256) refuse("player-games table changed");
const DEV3 = read(NFL003_DEV).devFits;
const table = JSON.parse(zlib.gunzipSync(fs.readFileSync(rel(TABLE_PATH))));
const C = Object.fromEntries(table.columns.map((c, i) => [c, i]));
const inSeasons = (s, [a, b]) => s >= a && s <= b;
const FRANCHISE = { STL: "LA", SD: "LAC", OAK: "LV", JAC: "JAX", LAR: "LA" };
const fr = (t) => FRANCHISE[t] ?? t;
const wmGate = winMarginGate(read(WIN_MARGIN_RECEIPT), read(WIN_MARGIN_PREREG));
if (wmGate.margin.state !== "READY") refuse("published margin head not READY");
const marginOf = new Map();
replayWinMarginHeads({ games: rowsFromTable(read(GAMES_HISTORY_V2)), gate: wmGate, onGame: (g, x) => marginOf.set(g.gameId, { home: fr(g.home), m: x.marginMean }) });
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
        if (inSeasons(season, H.testSeasons) || inSeasons(season, H.devSeasons)) {
          const members = [];
          for (const id of byTeam.get(tg.team) ?? []) {
            if (!tg.rows.has(id)) continue;
            const st = players.get(id);
            const shares = Object.fromEntries(FAMILIES.map((fam) => [fam, decayedShare(st, fam, season)]));
            if (!FAMILIES.some((fam) => shares[fam] > 0)) continue;
            members.push({ id, name: tg.rows.get(id)[C.name], shares, rates: { catch: shrunkRate(st, "catch", L.catchRate, season), ypr: shrunkRate(st, "ypr", L.yardsPerReception, season), ypc: shrunkRate(st, "ypc", L.yardsPerCarry, season) } });
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

// ── samplers ───────────────────────────────────────────────────────────────────────────────────────
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const seedOf = (s) => parseInt(crypto.createHash("sha256").update(s).digest("hex").slice(0, 8), 16);
function normal(rng) { const u = Math.max(1e-12, rng()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }
function gamma(rng, shape) {
  if (shape <= 0) return 0;
  if (shape < 1) return gamma(rng, shape + 1) * rng() ** (1 / shape);
  const d = shape - 1 / 3; const c = 1 / Math.sqrt(9 * d);
  for (;;) { let x; let v; do { x = normal(rng); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = rng(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
}
function dirichlet(rng, alpha) { const g = alpha.map((a) => (a > 0 ? gamma(rng, a) : 0)); const s = g.reduce((a, b) => a + b, 0); return s > 0 ? g.map((x) => x / s) : alpha.map(() => 1 / alpha.length); }
function multinomial(rng, n, p) {
  const out = new Array(p.length).fill(0);
  let left = n; let mass = 1;
  for (let i = 0; i < p.length - 1 && left > 0; i += 1) { const q = mass > 0 ? Math.min(1, Math.max(0, p[i] / mass)) : 0; let k = 0; for (let j = 0; j < left; j += 1) if (rng() < q) k += 1; out[i] = k; left -= k; mass -= p[i]; }
  out[p.length - 1] += left;
  return out;
}
function binomial(rng, n, p) { let k = 0; for (let j = 0; j < n; j += 1) if (rng() < p) k += 1; return k; }

/** One team-game's worlds. Returns per-member Float64Arrays for the four markets and counts invariant checks. */
function worlds(tg, kappa, runs, seedTag, need = { rec: true, rush: true, pass: true }) {
  const rng = mulberry32(seedOf(`${H.seed}|${seedTag}|${tg.gameId}|${tg.team}`));
  const V = allocVolume(tg);
  const mem = tg.members;
  const n = mem.length;
  const sh = (fam) => { const s = mem.map((mb) => reallocate(mb.shares[fam], tg.pool[fam].a, tg.pool[fam].v, rho[fam])); return [...s, Math.max(0, 1 - s.reduce((a, b) => a + b, 0))]; };
  const tS = sh("targets"); const cS = sh("rushAttempts"); const pS = sh("passAttempts");
  const out = { receptions: mem.map(() => new Float64Array(runs)), recYds: mem.map(() => new Float64Array(runs)), rushYds: mem.map(() => new Float64Array(runs)), passYds: mem.map(() => new Float64Array(runs)) };
  let checks = 0;
  for (let r = 0; r < runs; r += 1) {
    const A = Math.max(0, Math.round(V.passAtt + D.volumeSigmaPass * normal(rng)));
    const K = Math.max(0, Math.round(V.carries + D.volumeSigmaRush * normal(rng)));
    if (need.rec || need.pass) {
      const T = V.passAtt > 0 ? Math.round(A * V.targets / V.passAtt) : 0;
      const tgt = multinomial(rng, T, dirichlet(rng, tS.map((s) => s * kappa.t)));
      if (tgt.reduce((a, b) => a + b, 0) !== T) refuse("invariant: targets do not sum to the team total");
      let teamRecYds = 0; let teamRec = 0;
      for (let i = 0; i <= n; i += 1) {
        const cr = i < n ? mem[i].rates.catch : L.catchRate;
        const yp = i < n ? mem[i].rates.ypr : L.yardsPerReception;
        const rec = binomial(rng, tgt[i], cr);
        if (rec > tgt[i]) refuse("invariant: receptions exceed targets");
        const yds = rec > 0 ? gamma(rng, rec * D.receivingShape) * (yp / D.receivingShape) : 0;
        teamRec += rec; teamRecYds += yds;
        if (i < n) { out.receptions[i][r] = rec; out.recYds[i][r] = yds; }
      }
      if (need.pass) {
        const att = multinomial(rng, A, dirichlet(rng, pS.map((s) => s * kappa.p)));
        if (att.reduce((a, b) => a + b, 0) !== A) refuse("invariant: pass attempts do not sum to the team total");
        const cmp = A > 0 ? multinomial(rng, teamRec, att.map((x) => x / A)) : att.map(() => 0);
        if (A === 0 && teamRec > 0) cmp[cmp.length - 1] = teamRec;
        let passSum = 0;
        for (let i = 0; i <= n; i += 1) { const y = teamRec > 0 ? teamRecYds * cmp[i] / teamRec : 0; passSum += y; if (i < n) out.passYds[i][r] = y; }
        if (cmp.reduce((a, b) => a + b, 0) !== teamRec) refuse("invariant: completions differ from receptions");
        if (Math.abs(passSum - teamRecYds) > 1e-6) refuse("invariant: passing yards differ from receiving yards");
      }
    }
    if (need.rush) {
      const car = multinomial(rng, K, dirichlet(rng, cS.map((s) => s * kappa.c)));
      if (car.reduce((a, b) => a + b, 0) !== K) refuse("invariant: carries do not sum to the team total");
      for (let i = 0; i < n; i += 1) out.rushYds[i][r] = car[i] > 0 ? gamma(rng, car[i] * D.rushingShape) * (mem[i].rates.ypc / D.rushingShape) : 0;
    }
    checks += 1;
  }
  return { out, idx: new Map(mem.map((mb, i) => [mb.id, i])), checks };
}

const q = (arr, p) => { const s = Float64Array.from(arr).sort(); return s[Math.floor(p * (s.length - 1))]; };
const MKT_ARR = { player_receptions: "receptions", player_reception_yds: "recYds", player_rush_yds: "rushYds", player_pass_yds: "passYds" };
function sampleRealize(x, v) {
  const mean = v.reduce((s, y) => s + y, 0) / v.length;
  const pOver = x.rolling4 > 0 ? v.reduce((s, y) => s + (y > x.rolling4 ? 1 : 0), 0) / v.length : null;
  return { mean, p10: q(v, 0.1), p50: q(v, 0.5), p90: q(v, 0.9), pOverLine: pOver, actual: x.actual, line: x.rolling4, isCount: x.isCount, season: x.season };
}
function metrics(list) {
  const n = list.length;
  if (!n) return null;
  const avg = (f) => list.reduce((s, x) => s + f(x), 0) / n;
  const withLine = list.filter((x) => x.pOverLine != null);
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  for (const x of withLine) { const b = bins[Math.min(9, Math.floor(x.pOverLine * 10))]; b.n += 1; b.p += x.pOverLine; b.y += x.actual > x.line ? 1 : 0; }
  const ece = withLine.length ? bins.reduce((s, b) => s + (b.n ? (b.n / withLine.length) * Math.abs(b.p / b.n - b.y / b.n) : 0), 0) : null;
  const meanForecast = avg((x) => x.mean);
  const meanActual = avg((x) => x.actual);
  return { n, mae: avg((x) => Math.abs(x.p50 - x.actual)), coverage80: avg((x) => coverOf(x, x)), ece, level: meanActual > 0 ? meanForecast / meanActual : null };
}
const tgList = (seasons) => [...poolsByTeamGame.values()].filter((t) => t.pool && inSeasons(t.season, seasons));
const rowsByTG = new Map();
for (const x of scored) { const k = `${x.gameId}|${x.team}`; (rowsByTG.get(k) ?? rowsByTG.set(k, []).get(k)).push(x); }
function evaluate(seasons, kappa, runs, seedTag, mkts, need) {
  const real = Object.fromEntries(mkts.map((m) => [m, []]));
  let checks = 0;
  for (const tg of tgList(seasons)) {
    const rowsHere = (rowsByTG.get(`${tg.gameId}|${tg.team}`) ?? []).filter((x) => mkts.includes(x.mkt));
    if (!rowsHere.length) continue;
    const w = worlds(tg, kappa, runs, seedTag, need);
    checks += w.checks;
    for (const x of rowsHere) { const i = w.idx.get(x.playerId); if (i == null) continue; real[x.mkt].push({ x, r: sampleRealize(x, w.out[MKT_ARR[x.mkt]][i]) }); }
  }
  return { real, checks };
}
const covOf = (list) => list.reduce((a, o) => a + coverOf(o.r, o.r), 0) / list.length;

// ── dev fit: kappa_t (receptions), then kappa_c (rushing yards), then kappa_p (passing yards) ───────
const pickKappa = (trace) => [...trace].sort((a, b) => Math.abs(a.cov - 0.8) - Math.abs(b.cov - 0.8) || b.kappa - a.kappa)[0].kappa;
const fitTrace = {};
const kappa = { t: 20, c: 20, p: 20 };
fitTrace.t = H.kappaGrid.map((k) => ({ kappa: k, cov: covOf(evaluate(H.devSeasons, { ...kappa, t: k }, H.fitRuns, "fit-t", ["player_receptions"], { rec: true, rush: false, pass: false }).real.player_receptions) }));
kappa.t = pickKappa(fitTrace.t);
fitTrace.c = H.kappaGrid.map((k) => ({ kappa: k, cov: covOf(evaluate(H.devSeasons, { ...kappa, c: k }, H.fitRuns, "fit-c", ["player_rush_yds"], { rec: false, rush: true, pass: false }).real.player_rush_yds) }));
kappa.c = pickKappa(fitTrace.c);
fitTrace.p = H.kappaGrid.map((k) => ({ kappa: k, cov: covOf(evaluate(H.devSeasons, { ...kappa, p: k }, H.fitRuns, "fit-p", ["player_pass_yds"], { rec: true, rush: false, pass: true }).real.player_pass_yds) }));
kappa.p = pickKappa(fitTrace.p);
const r5 = (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(5)) : v);
console.log("kappa (dev):", JSON.stringify(kappa), JSON.stringify(fitTrace, r5));
if (MODE === "validate") {
  const dev = evaluate(H.devSeasons, kappa, H.fitRuns, "dev-report", MARKETS, { rec: true, rush: true, pass: true });
  for (const mkt of MARKETS) console.log(`DEV ${mkt.padEnd(21)} worlds ${JSON.stringify(metrics(dev.real[mkt].map((o) => o.r)), r5)}  analytic ${JSON.stringify(metrics(dev.real[mkt].map((o) => ({ ...analytic(o.x), actual: o.x.actual, line: o.x.rolling4, isCount: o.x.isCount }))), r5)}`);
  process.exit(0);
}

// ── the one look at 2019–2021 ──────────────────────────────────────────────────────────────────────
const test = evaluate(H.testSeasons, kappa, H.runs, "test", MARKETS, { rec: true, rush: true, pass: true });
const results = {};
const bars = {};
const outcome = {};
for (const mkt of MARKETS) {
  const list = test.real[mkt];
  const W = metrics(list.map((o) => o.r));
  const A = metrics(list.map((o) => ({ ...analytic(o.x), actual: o.x.actual, line: o.x.rolling4, isCount: o.x.isCount })));
  results[mkt] = { allocationWorlds: W, allocV1_analytic: A };
  bars[mkt] = {
    nonInferiorMae: { pass: W.mae <= A.mae * H.nonInferiorityRatio, observed: [W.mae, A.mae] },
    coverage80: { pass: W.coverage80 >= H.bars.coverageBand[0] && W.coverage80 <= H.bars.coverageBand[1], observed: W.coverage80 },
    ece: { pass: W.ece != null && W.ece <= H.bars.eceMax, observed: W.ece },
    level: { pass: W.level >= H.bars.levelBand[0] && W.level <= H.bars.levelBand[1], observed: W.level },
    invariants: { pass: true, observed: `${test.checks} worlds checked; any violation would have aborted the run` },
  };
  outcome[mkt] = Object.values(bars[mkt]).every((b) => b.pass) ? "PROCEED_TO_FORWARD_SHADOW" : "DO_NOT_PROCEED";
}
fs.writeFileSync(rel(OUT_PATH), JSON.stringify({
  schemaVersion: 1, artifact: "nfl-005-allocation-worlds-development", dataClass: "PRIVATE_RESEARCH",
  evidenceTier: "DEVELOPMENT — rows 2019-2021 inside the spent P299/P300 window; not a blind result.",
  generatedAt: NOW, preregistration: { path: PREREG_PATH, commit: preregCommit }, scriptSha256: sha("scripts/research/nfl/replay-allocation-worlds.mjs"),
  devFit: { kappa, trace: fitTrace }, inputsFromNfl003: { rho, volume: volCoef },
  population: Object.fromEntries(MARKETS.map((m) => [m, test.real[m].length])), worldsChecked: test.checks,
  results, bars, outcome,
  consequence: "Nothing publishes. A PROCEED_TO_FORWARD_SHADOW family gets the allocation worlds as its registered blind 2026 forward shadow generator.",
}, r5, 1), { flag: "wx" });
for (const mkt of MARKETS) console.log(`${mkt.padEnd(21)} worlds ${JSON.stringify(results[mkt].allocationWorlds, r5)}\n${" ".repeat(21)} analytic ${JSON.stringify(results[mkt].allocV1_analytic, r5)} → ${outcome[mkt]}`);
console.log(`worlds checked ${test.checks}; wrote ${OUT_PATH}`);
