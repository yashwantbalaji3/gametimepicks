#!/usr/bin/env node
/**
 * NFL-005 — SHARED WORLDS, DEVELOPMENT LOOK. Executes data/internal/research/nfl/reports/nfl-005-shared-worlds-preregistration.json.
 *
 * Feeds Sim V2 (drive-level, jointly coherent) the NFL-003 allocV1 point-in-time player inputs and compares its player
 * marginals with allocV1's analytic marginals on IDENTICAL rows (P300's gate, protocol A games 2019–2021). The NFL-003
 * engine section below is copied verbatim from replay-opportunity-allocation.mjs (P300's estimators); rho, volume and
 * dispersion come from the committed NFL-003 development receipt — nothing is refit here. Anchors are built exactly as
 * validate-drive-sim-v2.mjs protocol A builds them.
 *
 *   node scripts/research/nfl/replay-shared-worlds.mjs --score --now <ISO>   (one look; refuses if the output exists)
 *   node scripts/research/nfl/replay-shared-worlds.mjs --probe <n>           (first n games only; prints, writes nothing)
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { winMarginGate, rowsFromTable, replayWinMarginHeads, WIN_MARGIN_RECEIPT, WIN_MARGIN_PREREG, GAMES_HISTORY_V2 } from "../../../app/src/lib/sports/nfl/win-margin-heads.mjs";
import { totalsV3Gate, gamesFromTable, foldTotalsV3 } from "../../../app/src/lib/sports/nfl/totals-play-efficiency.mjs";
import { compileParams, prepareTeamPlayers, PSTAT, N_PSTAT } from "../../../app/src/lib/sports/nfl/sim-v2/engine.mjs";
import { calibrate, runBatch } from "../../../app/src/lib/sports/nfl/sim-v2/simulate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const read = (p) => JSON.parse(fs.readFileSync(rel(p), "utf8"));
const PREREG_PATH = "data/internal/research/nfl/reports/nfl-005-shared-worlds-preregistration.json";
const OUT_PATH = "data/internal/research/nfl/reports/nfl-005-shared-worlds-development.json";
const NFL003_PREREG = "data/internal/research/nfl/reports/nfl-003-opportunity-allocation-preregistration.json";
const NFL003_DEV = "data/internal/research/nfl/reports/nfl-003-opportunity-allocation-development.json";
const P300_PREREG = "data/internal/research/nfl/reports/player-props-share-level-preregistration.json";
const TABLE_PATH = "data/internal/research/nfl/replay/player-games-v1.json.gz";
const PARAMS_PATH = "data/internal/research/nfl/sim-v2/drive-params-2015-2018.json";

const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };
const MODE = argv.includes("--score") ? "score" : argv.includes("--probe") ? "probe" : null;
if (!MODE) refuse("usage: --score --now <ISO> | --probe <n>");
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
for (const [p, k] of [[NFL003_DEV, "nfl003DevelopmentSha256"], ["app/src/lib/sports/nfl/sim-v2/engine.mjs", "simEngineSha256"], ["app/src/lib/sports/nfl/sim-v2/simulate.mjs", "simBatchSha256"], [PARAMS_PATH, "driveParamsSha256"], [TABLE_PATH, "playerGamesSha256"]]) {
  if (sha(p) !== H.inputs[k]) refuse(`${p} does not match the registered hash`);
}
const DEV3 = read(NFL003_DEV).devFits;
const table = JSON.parse(zlib.gunzipSync(fs.readFileSync(rel(TABLE_PATH))));
const C = Object.fromEntries(table.columns.map((c, i) => [c, i]));
const inSeasons = (s, [a, b]) => s >= a && s <= b;
const FRANCHISE = { STL: "LA", SD: "LAC", OAK: "LV", JAC: "JAX", LAR: "LA" };
const fr = (t) => FRANCHISE[t] ?? t;

// ── anchors exactly as validate-drive-sim-v2.mjs (protocol A) ──────────────────────────────────────
const R = "data/internal/research/nfl";
const wmGate = winMarginGate(read(WIN_MARGIN_RECEIPT), read(WIN_MARGIN_PREREG));
const tGate = totalsV3Gate(read(`${R}/reports/matchup-totals-historical-replay-evaluation.json`), read(`${R}/reports/matchup-totals-historical-replay-preregistration.json`));
if (wmGate.margin?.state !== "READY" || tGate.state !== "READY") refuse("a head's gate is not READY");
const pre = new Map();
replayWinMarginHeads({ games: rowsFromTable(read(GAMES_HISTORY_V2)), gate: wmGate, onGame: (g, x) => pre.set(g.gameId, { ...x, home: fr(g.home) }) });
foldTotalsV3({
  games: gamesFromTable(read(`${R}/replay/games-history-v1.json`)), efficiencyRows: read(`${R}/replay/team-game-efficiency-v1.json`).rows,
  frozen: tGate.frozen, fit: tGate.fit,
  onDay: (day, predict) => { for (const g of day) { const o = pre.get(g.gameId); if (o) o.muT = predict(g.home, g.away); } },
});
const teamMargin = (gameId, team) => { const g = pre.get(gameId); if (!g || g.marginMean == null) return 0; return fr(team) === g.home ? g.marginMean : -g.marginMean; };
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
        if (inSeasons(season, H.testSeasons)) {
          const members = [];
          for (const id of byTeam.get(tg.team) ?? []) {
            if (!tg.rows.has(id)) continue;
            const st = players.get(id);
            const shares = Object.fromEntries(FAMILIES.map((fam) => [fam, decayedShare(st, fam, season)]));
            if (!FAMILIES.some((fam) => shares[fam] > 0)) continue;
            members.push({ id, name: tg.rows.get(id)[C.name], shares, rates: { catch: shrunkRate(st, "catch", L.catchRate, season), ypr: shrunkRate(st, "ypr", L.yardsPerReception, season), ypc: shrunkRate(st, "ypc", L.yardsPerCarry, season) } });
          }
          poolsByTeamGame.set(`${tg.gameId}|${tg.team}`, { gameId: tg.gameId, team: tg.team, members, pool: null });
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
const testRows = scored.filter((x) => inSeasons(x.season, H.testSeasons));
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

// ── simulate every protocol-A game with both team-games recorded ───────────────────────────────────
const compiled = compileParams(read(PARAMS_PATH));
const gameIds = [...new Set([...poolsByTeamGame.values()].map((t) => t.gameId))].filter((g) => pre.get(g)?.muT != null && pre.get(g)?.marginMean != null).sort();
const limit = MODE === "probe" ? Number(argOf("--probe")) : Infinity;
const STAT_OF = { player_receptions: PSTAT.rec, player_reception_yds: PSTAT.recYds, player_rush_yds: PSTAT.rushYds, player_pass_yds: PSTAT.passYds };
const simDist = new Map(); // `${gameId}|${team}|${playerId}|${mkt}` → Float32Array of run values
const coherence = { games: 0, runs: 0, failedRuns: 0, failureCodes: {}, recEqualsPassMismatches: 0 };
const crossGap = []; // analytic Σ receiving means / passer's passing mean, per team-game
let gi = 0;
for (const gameId of gameIds) {
  if (gi >= limit) break;
  const a = pre.get(gameId);
  const recs = [...poolsByTeamGame.values()].filter((t) => t.gameId === gameId);
  if (recs.length !== 2 || recs.some((t) => !t.pool)) continue;
  const side = (t) => (fr(t.team) === a.home ? 0 : 1);
  recs.sort((x, y) => side(x) - side(y));
  if (side(recs[0]) !== 0 || side(recs[1]) !== 1) continue;
  const prepared = recs.map((t) => prepareTeamPlayers({ players: t.members.map((mb) => ({
    playerId: mb.id, name: mb.name,
    passShare: reallocate(mb.shares.passAttempts, t.pool.passAttempts.a, t.pool.passAttempts.v, rho.passAttempts),
    targetShare: reallocate(mb.shares.targets, t.pool.targets.a, t.pool.targets.v, rho.targets),
    carryShare: reallocate(mb.shares.rushAttempts, t.pool.rushAttempts.a, t.pool.rushAttempts.v, rho.rushAttempts),
    catchRate: mb.rates.catch, ypr: mb.rates.ypr, ypc: mb.rates.ypc,
  })) }));
  const seed = crypto.createHash("sha256").update(`nfl005|${gameId}`).digest("hex").slice(0, 8);
  const postseason = Number(gameId.slice(5, 7)) > 18 || (Number(gameId.slice(0, 4)) <= 2020 && Number(gameId.slice(5, 7)) > 17);
  const cal = calibrate({ compiled, anchors: { home: (a.muT + a.marginMean) / 2, away: (a.muT - a.marginMean) / 2 }, baseSeed: seed, runs: H.calibrateRuns, postseason });
  const b = runBatch({ compiled, thetas: cal.thetas, players: prepared, baseSeed: seed, runs: H.runs, postseason });
  coherence.games += 1; coherence.runs += b.runs; coherence.failedRuns += b.failedRuns;
  for (const [c, n] of Object.entries(b.failureCodes)) coherence.failureCodes[c] = (coherence.failureCodes[c] ?? 0) + n;
  for (let s = 0; s < 2; s += 1) {
    const n = b.nSlots[s] + 1;
    for (let i = 0; i < b.runs; i += 1) {
      let rec = 0; let pass = 0;
      for (let j = 0; j < n; j += 1) { rec += b.players[s][(i * n + j) * N_PSTAT + PSTAT.recYds]; pass += b.players[s][(i * n + j) * N_PSTAT + PSTAT.passYds]; }
      if (Math.abs(rec - pass) > 1e-6) coherence.recEqualsPassMismatches += 1;
    }
    prepared[s].slots.forEach((slot, j) => {
      for (const [mkt, k] of Object.entries(STAT_OF)) {
        const v = new Float32Array(b.runs);
        for (let i = 0; i < b.runs; i += 1) v[i] = b.players[s][(i * n + j) * N_PSTAT + k];
        simDist.set(`${gameId}|${recs[s].team}|${slot.playerId}|${mkt}`, v);
      }
    });
  }
  gi += 1;
  if (gi % 100 === 0) console.log(`  ${gi}/${gameIds.length} games`);
}

// analytic cross-family gap (the incoherence joint worlds remove): Σ named receiving means vs the main passer's passing mean
const byTG = new Map();
for (const x of testRows) { const k = `${x.gameId}|${x.team}`; (byTG.get(k) ?? byTG.set(k, []).get(k)).push(x); }
for (const list of byTG.values()) {
  const recSum = list.filter((x) => x.mkt === "player_reception_yds").reduce((s, x) => s + analytic(x).mean, 0);
  const passer = list.filter((x) => x.mkt === "player_pass_yds").map((x) => analytic(x).mean).sort((p, q) => q - p)[0];
  if (passer > 0) crossGap.push(recSum / passer);
}

// ── metrics on identical rows ──────────────────────────────────────────────────────────────────────
const q = (arr, p) => { const s = Float64Array.from(arr).sort(); return s[Math.floor(p * (s.length - 1))]; };
const rowsBoth = testRows.filter((x) => simDist.has(`${x.gameId}|${x.team}|${x.playerId}|${x.mkt}`));
function realize(x, which) {
  if (which === "allocV1_analytic") return { ...analytic(x), actual: x.actual, line: x.rolling4, isCount: x.isCount, season: x.season };
  const v = simDist.get(`${x.gameId}|${x.team}|${x.playerId}|${x.mkt}`);
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
const r5 = (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(5)) : v);
const results = {};
const bars = {};
const outcome = {};
for (const mkt of MARKETS) {
  const list = rowsBoth.filter((x) => x.mkt === mkt);
  results[mkt] = { allocV1_analytic: metrics(list.map((x) => realize(x, "allocV1_analytic"))), simV2_allocV1: metrics(list.map((x) => realize(x, "simV2_allocV1"))) };
  const S = results[mkt].simV2_allocV1;
  const A = results[mkt].allocV1_analytic;
  if (!S || !A) continue;
  bars[mkt] = {
    nonInferiorMae: { pass: S.mae <= A.mae * H.nonInferiorityRatio, observed: [S.mae, A.mae] },
    coverage80: { pass: S.coverage80 >= H.bars.coverageBand[0] && S.coverage80 <= H.bars.coverageBand[1], observed: S.coverage80 },
    ece: { pass: S.ece != null && S.ece <= H.bars.eceMax, observed: S.ece },
    level: { pass: S.level >= H.bars.levelBand[0] && S.level <= H.bars.levelBand[1], observed: S.level },
    coherence: { pass: coherence.failedRuns === 0 && coherence.recEqualsPassMismatches === 0, observed: { failedRuns: coherence.failedRuns, recEqualsPassMismatches: coherence.recEqualsPassMismatches } },
  };
  outcome[mkt] = Object.values(bars[mkt]).every((b) => b.pass) ? "PROCEED_TO_FORWARD_SHADOW" : "DO_NOT_PROCEED";
}
const gapSorted = [...crossGap].sort((x, y) => x - y);
const crossFamily = { teamGames: crossGap.length, meanRatio: crossGap.reduce((s, x) => s + x, 0) / crossGap.length, p90: gapSorted[Math.floor(0.9 * (gapSorted.length - 1))], shareAbove1_1: crossGap.filter((x) => x > 1.1).length / crossGap.length, note: "analytic allocV1: Σ named receiving-yard means / main passer's passing-yard mean (named receivers are a subset, so > 1 is an incoherence); Sim V2 makes it exactly Σ receiving = passing in every run" };
console.log(`games simulated ${coherence.games} · runs ${coherence.runs} · failed ${coherence.failedRuns} · rec≠pass ${coherence.recEqualsPassMismatches}`);
for (const mkt of MARKETS) if (results[mkt].simV2_allocV1) console.log(`${mkt.padEnd(21)} analytic ${JSON.stringify(results[mkt].allocV1_analytic, r5)}\n${" ".repeat(21)} simV2    ${JSON.stringify(results[mkt].simV2_allocV1, r5)} → ${outcome[mkt]}`);
console.log("cross-family (analytic):", JSON.stringify(crossFamily, r5));
if (MODE === "probe") process.exit(0);
fs.writeFileSync(rel(OUT_PATH), JSON.stringify({
  schemaVersion: 1, artifact: "nfl-005-shared-worlds-development", dataClass: "PRIVATE_RESEARCH",
  evidenceTier: "DEVELOPMENT — protocol A games 2019-2021; player rows inside the spent P299/P300 window. Not a blind result.",
  generatedAt: NOW, preregistration: { path: PREREG_PATH, commit: preregCommit },
  scriptSha256: sha("scripts/research/nfl/replay-shared-worlds.mjs"),
  population: { games: coherence.games, rows: Object.fromEntries(MARKETS.map((m) => [m, rowsBoth.filter((x) => x.mkt === m).length])), testRowsBeforeJoin: testRows.length },
  inputsFromNfl003: { rho, volume: volCoef },
  preScoreProbeDisclosure: "Before this score the author ran --probe 20 (the first 20 test games, all four families; printed, nothing written) to check runtime and joins. No registered parameter, bar or population rule changed after it.",
  coherence, crossFamilyAnalytic: crossFamily, results, bars, outcome,
  consequence: "Nothing publishes. A PROCEED_TO_FORWARD_SHADOW family gets Sim V2 + allocV1 as its registered blind 2026 forward shadow generator.",
}, r5, 1), { flag: "wx" });
console.log(`wrote ${OUT_PATH}`);
