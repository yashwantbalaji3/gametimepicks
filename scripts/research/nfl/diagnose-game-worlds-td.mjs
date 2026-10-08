#!/usr/bin/env node
/**
 * NFL-005 — GAME WORLDS (score + TDs + game script + scorers), DEVELOPMENT LOOK. Executes data/internal/research/nfl/reports/nfl-005-game-worlds-preregistration.json.
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

import { winMarginGate, rowsFromTable, replayWinMarginHeads, WIN_MARGIN_RECEIPT, WIN_MARGIN_PREREG, GAMES_HISTORY_V2 } from "/Users/yashwantbalaji/Downloads/gametimepicks/.claude/worktrees/nfl-world-model-v2-priority-79e413/app/src/lib/sports/nfl/win-margin-heads.mjs";
import { totalsV3Gate, gamesFromTable, foldTotalsV3 } from "/Users/yashwantbalaji/Downloads/gametimepicks/.claude/worktrees/nfl-world-model-v2-priority-79e413/app/src/lib/sports/nfl/totals-play-efficiency.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const read = (p) => JSON.parse(fs.readFileSync(rel(p), "utf8"));
const PREREG_PATH = "data/internal/research/nfl/reports/nfl-005-game-worlds-preregistration.json";
const OUT_PATH = "data/internal/research/nfl/reports/nfl-005-game-worlds-development.json";
const AW_DEV = "data/internal/research/nfl/reports/nfl-005-allocation-worlds-development.json";
const NFL003_PREREG = "data/internal/research/nfl/reports/nfl-003-opportunity-allocation-preregistration.json";
const NFL003_DEV = "data/internal/research/nfl/reports/nfl-003-opportunity-allocation-development.json";
const P300_PREREG = "data/internal/research/nfl/reports/player-props-share-level-preregistration.json";
const TABLE_PATH = "data/internal/research/nfl/replay/player-games-v1.json.gz";

const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };
const MODE = "diag";
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
        if (inSeasons(season, H.devSeasons)) { // DIAG: dev seasons only
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
    if (inSeasons(season, H.devSeasons)) { // DIAG: dev seasons only
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
            atdRows.push({ gameId: tg.gameId, team: tg.team, playerId: id, season, pos: row[T.position], cs, ts, c, t, lam, y: row[T.rushTd] + row[T.recTd] + row[T.otherTd] > 0 ? 1 : 0, yRush: row[T.rushTd] > 0 ? 1 : 0, yRec: row[T.recTd] > 0 ? 1 : 0, yOff: row[T.rushTd] + row[T.recTd] > 0 ? 1 : 0, yOtherOnly: row[T.rushTd] + row[T.recTd] === 0 && row[T.otherTd] > 0 ? 1 : 0, carries: row[T.carries], targets: row[T.targets], receptions: row[T.receptions], pRz: clip(1 - Math.exp(-(c * lam.rush + t * lam.rec + LG.other))), pRzNoOther: clip(1 - Math.exp(-(c * lam.rush + t * lam.rec))) });
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
  var OTHER_TD = LG.other; var V2 = v2; // eslint-disable-line no-var
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

// ── coupled worlds per test game ───────────────────────────────────────────────────────────────────
const SIGMA_M = wmGate.margin.sigma;
const SIGMA_T = tGate.fit.sigma;
const snap = (x) => { const s = Math.max(0, Math.round(x)); return s === 1 ? 0 : s; };
// ══ DIAGNOSIS (dev seasons 2022–2025 only) ═════════════════════════════════════════════════════════
const RUNS = Number(argOf("--runs") ?? 500);
const LIMIT = argOf("--limit") ? Number(argOf("--limit")) : Infinity;
const OUT = argOf("--out");
function poisson(rng, mu) { if (!(mu > 0)) return 0; const Lm = Math.exp(-mu); let k = 0; let p = 1; for (;;) { p *= rng(); if (p <= Lm) return k; k += 1; } }
const VAR = ["W0_gate_emp", "W1_nogate_emp", "W2_nogate_pois", "W3_gate_pois"];
const memStats = new Map(); // gameId|team|playerId → { td:[4], car, rec, rzc, rzt }
const sideStats = []; // per team-game: { key, lam, tdSum, tdSq, actualTd, otherW0, otherW1, noQual, tdTotW0 }
const devGames = [...new Set([...poolsByTeamGame.values()].filter((t) => t.pool && inSeasons(t.season, H.devSeasons)).map((t) => t.gameId))].sort();
let nGames = 0; let skipped = 0;
const t0 = Date.now();
for (const gameId of devGames) {
  if (nGames >= LIMIT) break;
  const g = marginOf.get(gameId); const muT = muTOf.get(gameId);
  if (!g || g.m == null || muT == null) { skipped += 1; continue; }
  const sides = [...poolsByTeamGame.values()].filter((t) => t.gameId === gameId && t.pool);
  if (sides.length !== 2) { skipped += 1; continue; }
  nGames += 1;
  const rng = mulberry32(seedOf(`${H.seed}|${gameId}`));
  const rng2 = mulberry32(seedOf(`diag|${gameId}`));
  const prep = sides.map((t) => {
    const mem = t.members; const n = mem.length;
    const sh = (fam) => { const s = mem.map((mb) => reallocate(mb.shares[fam], t.pool[fam].a, t.pool[fam].v, rho[fam])); return [...s, Math.max(0, 1 - s.reduce((a, b) => a + b, 0))]; };
    const info = tdInfo.get(`${gameId}|${t.team}`);
    const rzc = mem.map((mb) => info?.rz.get(mb.id)?.c ?? 0); const rzt = mem.map((mb) => info?.rz.get(mb.id)?.t ?? 0);
    const st = { td: VAR.map(() => new Float64Array(n)), car: new Float64Array(n), rec: new Float64Array(n), tdSum: 0, tdSq: 0, otherTd: [0, 0], allTd: [0, 0], noQual: 0 };
    return { t, mem, n, V: allocVolume(t), tS: sh("targets"), cS: sh("rushAttempts"), pS: sh("passAttempts"), rzc: [...rzc, Math.max(0, 1 - rzc.reduce((a, b) => a + b, 0))], rzt: [...rzt, Math.max(0, 1 - rzt.reduce((a, b) => a + b, 0))], lam: info?.lam ?? { rush: 0.8, rec: 1.5 }, hasInfo: !!info, sign: fr(t.team) === g.home ? 1 : -1, st };
  });
  for (let r = 0; r < RUNS; r += 1) {
    const M = g.m + SIGMA_M * normal(rng); const Tt = Math.max(2, muT + SIGMA_T * normal(rng));
    const home = snap((Tt + M) / 2); const away = snap((Tt - M) / 2);
    for (const s of prep) {
      const pts = s.sign === 1 ? home : away; const real = s.sign * (home - away);
      const tdPoolHere = tdPool(pts); const TD = pts >= 6 ? tdPoolHere[Math.floor(rng() * tdPoolHere.length)] : 0;
      const rushTD = binomial(rng, TD, s.lam.rush / (s.lam.rush + s.lam.rec)); const recTD = TD - rushTD;
      const mTeam = s.sign * g.m;
      const A = Math.max(0, Math.round(s.V.passAtt + script.passAtt.beta * (real - mTeam) + script.passAtt.sigma * normal(rng)));
      const K = Math.max(0, Math.round(s.V.carries + script.carries.beta * (real - mTeam) + script.carries.sigma * normal(rng)));
      const Tg = s.V.passAtt > 0 ? Math.round(A * s.V.targets / s.V.passAtt) : 0;
      const tgt = multinomial(rng, Tg, dirichlet(rng, s.tS.map((x) => x * KAPPA.t)));
      const rec = new Array(s.n + 1).fill(0);
      for (let i = 0; i <= s.n; i += 1) {
        rec[i] = binomial(rng, tgt[i], i < s.n ? s.mem[i].rates.catch : L.catchRate);
        if (rec[i] > 0) gammaDraw(rng, rec[i] * D.receivingShape); // keep rng stream as the original
      }
      const att = multinomial(rng, A, dirichlet(rng, s.pS.map((x) => x * KAPPA.p)));
      const teamRec = rec.reduce((a, b) => a + b, 0);
      if (A > 0) multinomial(rng, teamRec, att.map((x) => x / A));
      const car = multinomial(rng, K, dirichlet(rng, s.cS.map((x) => x * KAPPA.c)));
      for (let i = 0; i < s.n; i += 1) if (car[i] > 0) gammaDraw(rng, car[i] * D.rushingShape);
      // W0: registered scorer rule (gate, empirical TD|points) — rng stream identical to the registered loop
      const run = (rTD, cTD, gate, R, recArr) => {
        const td = new Array(s.n + 1).fill(0); const recBy = new Array(s.n + 1).fill(0); const rc = recArr.slice(); let nq = 0;
        for (let k = 0; k < rTD; k += 1) { const i = pick(R, s.rzc.map((w, ix) => (!gate || car[ix] > 0 ? w : 0))); if (i < 0) nq += 1; td[i < 0 ? s.n : i] += 1; }
        for (let k = 0; k < cTD; k += 1) { let i = pick(R, s.rzt.map((w, ix) => (!gate || rc[ix] - recBy[ix] > 0 ? w : 0))); if (i < 0) { i = s.n; rc[s.n] += 1; nq += 1; } recBy[i] += 1; td[i] += 1; }
        return { td, nq };
      };
      const w0 = run(rushTD, recTD, true, rng, rec);
      const w1 = run(rushTD, recTD, false, rng2, rec);
      const pr = poisson(rng2, s.lam.rush); const pc = poisson(rng2, s.lam.rec);
      const w2 = run(pr, pc, false, rng2, rec);
      const w3 = run(pr, pc, true, rng2, rec);
      [w0, w1, w2, w3].forEach((w, v) => { for (let i = 0; i < s.n; i += 1) if (w.td[i] > 0) s.st.td[v][i] += 1; });
      for (let i = 0; i < s.n; i += 1) { if (car[i] > 0) s.st.car[i] += 1; if (rec[i] > 0) s.st.rec[i] += 1; }
      s.st.tdSum += TD; s.st.tdSq += TD * TD; s.st.otherTd[0] += w0.td[s.n]; s.st.otherTd[1] += w1.td[s.n]; s.st.allTd[0] += TD; s.st.noQual += w0.nq;
    }
  }
  for (const s of prep) {
    const tot = V2.teamTotals[`${gameId}|${s.t.team}`] ?? [0, 0, 0, 0, 0];
    const memIds = new Set(s.mem.map((m) => m.id));
    let actualPoolTd = 0;
    sideStats.push({ key: `${gameId}|${s.t.team}`, season: s.t.season, hasInfo: s.hasInfo, lamSum: s.lam.rush + s.lam.rec, lamRush: s.lam.rush, lamRec: s.lam.rec, mean: s.st.tdSum / RUNS, ex2: s.st.tdSq / RUNS, actualTd: tot[3] + tot[4], otherShareW0: s.st.otherTd[0] / Math.max(1, s.st.allTd[0]), otherW0: s.st.otherTd[0] / RUNS, otherW1: s.st.otherTd[1] / RUNS, noQual: s.st.noQual / RUNS, rzcOther: s.rzc[s.n], rztOther: s.rzt[s.n], sumRzc: s.rzc.slice(0, s.n).reduce((a, b) => a + b, 0), sumRzt: s.rzt.slice(0, s.n).reduce((a, b) => a + b, 0), memIds: [...memIds] });
    s.mem.forEach((mb, i) => memStats.set(`${gameId}|${s.t.team}|${mb.id}`, { td: VAR.map((_, v) => s.st.td[v][i] / RUNS), pCar: s.st.car[i] / RUNS, pRec: s.st.rec[i] / RUNS, rzc: s.rzc[i], rzt: s.rzt[i], tdMean: s.st.tdSum / RUNS, lam: s.lam }));
  }
  if (nGames % 100 === 0) console.error(`${nGames} games, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.error(`games ${nGames} (skipped ${skipped}), runs ${RUNS}, ${((Date.now() - t0) / 1000).toFixed(0)}s`);

// actual offensive TDs by players in vs out of the active pool (the OTHER bucket), from player-games-v2
{
  const TT = Object.fromEntries(V2.columns.map((c, i) => [c, i]));
  const byTG = new Map();
  for (const r of V2.rows) { if (!inSeasons(r[TT.season], H.devSeasons)) continue; const k = `${r[TT.gameId]}|${r[TT.team]}`; (byTG.get(k) ?? byTG.set(k, []).get(k)).push(r); }
  let inPool = 0; let all = 0; let inGate = 0;
  const gateKeys = new Set();
  for (const ss of sideStats) {
    const ids = new Set(ss.memIds);
    for (const r of byTG.get(ss.key) ?? []) { const td = r[TT.rushTd] + r[TT.recTd]; all += td; if (ids.has(String(r[TT.playerId]))) inPool += td; }
  }
  var ACTUAL_OTHER = { offensiveTd: all, byActivePool: inPool, otherShare: 1 - inPool / all }; // eslint-disable-line no-var
}

// ── metrics ────────────────────────────────────────────────────────────────────────────────────────
const rowsJ = atdRows.filter((x) => memStats.has(`${x.gameId}|${x.team}|${x.playerId}`)).map((x) => ({ ...x, w: memStats.get(`${x.gameId}|${x.team}|${x.playerId}`) }));
const OTHER = OTHER_TD;
const addOther = (p) => 1 - (1 - p) * Math.exp(-OTHER);
const cl = (p) => Math.min(1 - 1e-4, Math.max(1e-4, p));
const MODELS = {
  rzTdV1: (x) => x.pRz,
  rzTdV1_noOther: (x) => x.pRzNoOther,
  W0_registeredWorld: (x) => x.w.td[0],
  W0_plusOther: (x) => addOther(x.w.td[0]),
  W1_noGate_empTD: (x) => x.w.td[1],
  W1_noGate_empTD_plusOther: (x) => addOther(x.w.td[1]),
  W2_noGate_poissonTD: (x) => x.w.td[2],
  W2_plusOther: (x) => addOther(x.w.td[2]),
  W3_gate_poissonTD: (x) => x.w.td[3],
  W3_plusOther: (x) => addOther(x.w.td[3]),
  // analytic thinning with the world's own mean team TD (Poisson dispersion), no gate: isolates team-TD level vs dispersion
  Wmean_poissonAtWorldMean_plusOther: (x) => { const pr = x.w.lam.rush / (x.w.lam.rush + x.w.lam.rec); return addOther(1 - Math.exp(-(x.c * pr + x.t * (1 - pr)) * x.w.tdMean)); },
};
function binM(list, f) {
  const n = list.length; if (!n) return null;
  let ll = 0; let sp = 0; let sy = 0; let br = 0; const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  for (const x of list) { const p = cl(f(x)); const y = x.y; ll -= y ? Math.log(p) : Math.log(1 - p); br += (p - y) ** 2; sp += p; sy += y; const b = bins[Math.min(9, Math.floor(p * 10))]; b.n += 1; b.p += p; b.y += y; }
  return { n, logLoss: ll / n, brier: br / n, meanP: sp / n, rate: sy / n, level: sy > 0 ? sp / sy : null, ece: bins.reduce((a, b) => a + (b.n ? (b.n / n) * Math.abs(b.p / b.n - b.y / b.n) : 0), 0), reliability: bins.map((b, i) => ({ bin: `${i / 10}-${(i + 1) / 10}`, n: b.n, meanP: b.n ? b.p / b.n : null, rate: b.n ? b.y / b.n : null })).filter((b) => b.n) };
}
const role = (x) => (x.pos === "QB" ? "QB" : x.pos === "RB" || x.pos === "FB" ? "RB" : x.pos === "WR" ? "WR" : x.pos === "TE" ? "TE" : "OTHERPOS");
const summarise = (list) => Object.fromEntries(Object.entries(MODELS).map(([k, f]) => [k, (({ reliability, ...m }) => m)(binM(list, f))]));
const out = { window: H.devSeasons, runs: RUNS, games: nGames, rows: rowsJ.length, otherTdPerPlayerGame: OTHER };
out.overall = summarise(rowsJ);
out.reliability = { rzTdV1: binM(rowsJ, MODELS.rzTdV1).reliability, W0_registeredWorld: binM(rowsJ, MODELS.W0_registeredWorld).reliability, W1_noGate_empTD_plusOther: binM(rowsJ, MODELS.W1_noGate_empTD_plusOther).reliability };
out.byRole = {};
for (const ro of ["RB", "WR", "TE", "QB", "OTHERPOS"]) { const l = rowsJ.filter((x) => role(x) === ro); if (l.length) out.byRole[ro] = { n: l.length, rate: l.reduce((a, x) => a + x.y, 0) / l.length, ...Object.fromEntries(["rzTdV1", "W0_registeredWorld", "W1_noGate_empTD_plusOther", "W3_plusOther", "W2_plusOther"].map((k) => { const m = binM(l, MODELS[k]); return [k, { meanP: m.meanP, level: m.level, logLoss: m.logLoss }]; })) }; }
// by rz-share quintile (rush+rec expected TD weight) — concentration check
const wexp = (x) => x.c * x.lam.rush + x.t * x.lam.rec;
const sorted = [...rowsJ].sort((a, b) => wexp(a) - wexp(b));
out.byRzWeightQuintile = Array.from({ length: 5 }, (_, q) => { const l = sorted.slice(Math.floor(q * sorted.length / 5), Math.floor((q + 1) * sorted.length / 5)); return { q: q + 1, n: l.length, rate: l.reduce((a, x) => a + x.y, 0) / l.length, ...Object.fromEntries(["rzTdV1", "W0_registeredWorld", "W1_noGate_empTD_plusOther", "W3_plusOther", "W2_plusOther"].map((k) => [k, binM(l, MODELS[k]).meanP])), pCarryWorld: l.reduce((a, x) => a + x.w.pCar, 0) / l.length, pCarryActual: l.reduce((a, x) => a + (x.carries > 0 ? 1 : 0), 0) / l.length, pRecWorld: l.reduce((a, x) => a + x.w.pRec, 0) / l.length, pRecActual: l.reduce((a, x) => a + (x.receptions > 0 ? 1 : 0), 0) / l.length }; });
// participation gate: world P(>=1 carry) vs actual, for players with rz carry share >= 0.05
const gateRows = rowsJ.filter((x) => x.w.rzc >= 0.05 && x.pos !== "QB");
const qbRows = rowsJ.filter((x) => x.pos === "QB");
out.participation = {
  nonQB_rzc_ge_0_05: { n: gateRows.length, pCarryWorld: gateRows.reduce((a, x) => a + x.w.pCar, 0) / gateRows.length, pCarryActual: gateRows.reduce((a, x) => a + (x.carries > 0 ? 1 : 0), 0) / gateRows.length },
  allRows: { pCarryWorld: rowsJ.reduce((a, x) => a + x.w.pCar, 0) / rowsJ.length, pCarryActual: rowsJ.reduce((a, x) => a + (x.carries > 0 ? 1 : 0), 0) / rowsJ.length, pRecWorld: rowsJ.reduce((a, x) => a + x.w.pRec, 0) / rowsJ.length, pRecActual: rowsJ.reduce((a, x) => a + (x.receptions > 0 ? 1 : 0), 0) / rowsJ.length },
  QB: qbRows.length ? { n: qbRows.length, pCarryWorld: qbRows.reduce((a, x) => a + x.w.pCar, 0) / qbRows.length, pCarryActual: qbRows.reduce((a, x) => a + (x.carries > 0 ? 1 : 0), 0) / qbRows.length, rushTdRate: qbRows.reduce((a, x) => a + x.yRush, 0) / qbRows.length } : null,
};
// team TD distribution
const sd = sideStats.filter((s) => s.hasInfo);
const mean = (f) => sd.reduce((a, s) => a + f(s), 0) / sd.length;
const actMean = mean((s) => s.actualTd); const actVar = mean((s) => (s.actualTd - actMean) ** 2);
const wMean = mean((s) => s.mean); const wVar = mean((s) => s.ex2) - wMean ** 2; // pooled marginal variance across team-game worlds
const wWithin = mean((s) => s.ex2 - s.mean ** 2);
const lamMean = mean((s) => s.lamSum);
out.teamTd = {
  n: sd.length, actual: { mean: actMean, var: actVar, dispersionIndex: actVar / actMean }, world: { mean: wMean, varMarginal: wVar, varWithinGameMean: wWithin, dispersionIndex: wVar / wMean },
  p301TeamForm_lamSum: { mean: lamMean, poissonMarginalVar: lamMean + mean((s) => (s.lamSum - lamMean) ** 2) },
  corr_worldMean_actual: (() => { const mx = wMean; const my = actMean; let sxy = 0; let sxx = 0; let syy = 0; for (const s of sd) { sxy += (s.mean - mx) * (s.actualTd - my); sxx += (s.mean - mx) ** 2; syy += (s.actualTd - my) ** 2; } return sxy / Math.sqrt(sxx * syy); })(),
  corr_lam_actual: (() => { const mx = lamMean; const my = actMean; let sxy = 0; let sxx = 0; let syy = 0; for (const s of sd) { sxy += (s.lamSum - mx) * (s.actualTd - my); sxx += (s.lamSum - mx) ** 2; syy += (s.actualTd - my) ** 2; } return sxy / Math.sqrt(sxx * syy); })(),
  sdOfPerGameMean: { world: Math.sqrt(mean((s) => (s.mean - wMean) ** 2)), lam: Math.sqrt(mean((s) => (s.lamSum - lamMean) ** 2)) },
};
out.otherBucket = { worldW0_otherTdPerTeamGame: mean((s) => s.otherW0), worldW1_otherTdPerTeamGame: mean((s) => s.otherW1), worldW0_otherShareOfTd: mean((s) => s.otherW0) / wMean, noQualifierTdPerTeamGame: mean((s) => s.noQual), rzcOtherWeight: mean((s) => s.rzcOther), rztOtherWeight: mean((s) => s.rztOther), actual: ACTUAL_OTHER, actualPositivesOtherTdOnlyShare: rowsJ.reduce((a, x) => a + x.yOtherOnly, 0) / rowsJ.reduce((a, x) => a + x.y, 0) };
const r5 = (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(5)) : v);
console.log(JSON.stringify(out, r5, 1));
// W2 (no gate, Poisson at lam) should equal rzTdV1_noOther unless active rz shares sum > 1 (renormalised)
out.shareSums = { meanSumRzcActive: mean((s) => s.sumRzc), meanSumRztActive: mean((s) => s.sumRzt), fracSumRzcGt1: mean((s) => (s.sumRzc > 1 ? 1 : 0)), fracSumRztGt1: mean((s) => (s.sumRzt > 1 ? 1 : 0)) };
// gate effect vs world participation: W3/W2 ratio by world P(eligible) band (Poisson TD counts, same TDs in expectation)
out.gateByParticipation = [[0, 0.5], [0.5, 0.8], [0.8, 0.95], [0.95, 1.01]].map(([a, b]) => { const l = rowsJ.filter((x) => { const pe = x.w.rzc >= x.w.rzt ? x.w.pCar : x.w.pRec; return pe >= a && pe < b; }); const sm = (f) => l.reduce((acc, x) => acc + f(x), 0) / l.length; return { pEligibleBand: [a, b], n: l.length, actual: sm((x) => x.y), rzTdV1: sm((x) => x.pRz), W2_noGate: sm((x) => addOther(x.w.td[2])), W3_gate: sm((x) => addOther(x.w.td[3])), W0: sm((x) => x.w.td[0]) }; });
// by season
out.bySeason = Object.fromEntries([2022, 2023, 2024, 2025].map((yr) => { const l = rowsJ.filter((x) => x.season === yr); return [yr, Object.fromEntries(["rzTdV1", "W0_registeredWorld", "W1_noGate_empTD_plusOther"].map((k) => { const m = binM(l, MODELS[k]); return [k, { logLoss: m.logLoss, ece: m.ece, level: m.level }]; }))]; }));
console.log(JSON.stringify({ shareSums: out.shareSums, gateByParticipation: out.gateByParticipation, bySeason: out.bySeason, teamTd: out.teamTd }, r5));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, r5, 1));
