#!/usr/bin/env node
/**
 * NFL WORLD MODEL V2 — INPUT PACKET EXPORT (research side; feeds the app's experimental game-world simulator).
 *
 * The app simulator (app/src/lib/sports/nfl/world-model-v2/) must not carry the 2013–2026 player-game history or the
 * red-zone play-by-play tables. This tool runs the SAME point-in-time state as capture-v2-candidates-forward.mjs
 * (allocV1 walk through the latest committed 2026 final, rzTdV1 red-zone state, development-receipt parameters —
 * nothing refit) and writes one compact, immutable packet per week:
 *   - per team: every pool member's raw (pre-availability) opportunity shares, shrunk efficiency rates, red-zone
 *     carry/target shares, ESPN id and name; the team's opportunity form and opponent-allowed form; team TD form
 *   - the frozen engine parameters (league rates, dispersion, Dirichlet kappas, game-script slopes, volume fit)
 *   - empirical scoring tables from team-games-v1: offensive TDs | points (the validated table), exact
 *     scoring composition | (points, offensive TDs), and overtime outcomes (10-minute OT seasons)
 * Availability is NOT frozen here: the app builder applies the injuries feed and participation artifact at build time.
 *
 *   node scripts/research/nfl/export-world-model-v2-inputs.mjs --now <ISO> --week 5
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const read = (p) => JSON.parse(fs.readFileSync(rel(p), "utf8"));
const argOf = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };
const NOW = argOf("--now");
const WEEK = Number(argOf("--week"));
if (!NOW || !Number.isFinite(Date.parse(NOW))) refuse("--now <ISO> required");
if (Date.parse(NOW) > Date.now() + 60_000) refuse("--now is in the future; captures use the real clock");
if (!Number.isInteger(WEEK)) refuse("--week <n> required");
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(rel(p))).digest("hex");
const INPUTS = {
  playerGamesV1: "data/internal/research/nfl/replay/player-games-v1.json.gz",
  playerGamesV2: "data/internal/research/nfl/replay/player-games-v2.json.gz",
  playerGames2026: "data/internal/research/nfl/replay/player-games-2026-v1.json.gz",
  redZone: "data/internal/research/nfl/replay/player-redzone-v1.json.gz",
  nfl003Dev: "data/internal/research/nfl/reports/nfl-003-opportunity-allocation-development.json",
  nfl004Dev: "data/internal/research/nfl/reports/nfl-004-redzone-td-development.json",
  nfl005AwDev: "data/internal/research/nfl/reports/nfl-005-allocation-worlds-development.json",
  nfl005GwDev: "data/internal/research/nfl/reports/nfl-005-game-worlds-development.json",
  teamGames: "data/internal/research/nfl/sim-v2/team-games-v1.json.gz",
  participation2026: "data/internal/research/nfl/nflverse/participation-2026.jsonl",
  schedule: "app/public/data/nfl/schedule/latest.json",
  rosters: "app/public/data/nfl/rosters/latest.json",
  forecasts: "app/public/data/nfl/forecasts/latest.json",
};
const inputHashes = Object.fromEntries(Object.entries(INPUTS).map(([k, p]) => [k, sha(p)]));
const gz = (p) => JSON.parse(zlib.gunzipSync(fs.readFileSync(rel(p))));
const v1 = gz(INPUTS.playerGamesV1);
const y26 = gz(INPUTS.playerGames2026);
const Y = Object.fromEntries(y26.columns.map((c, i) => [c, i]));
const V1C = v1.columns;
// The allocV1 engine's table: 2013–2025 v1 rows + 2026 rows projected onto v1's columns.
const table = {
  columns: V1C,
  rows: [...v1.rows, ...y26.rows.map((r) => V1C.map((c) => r[Y[c]]))],
  teamTotals: { ...v1.teamTotals, ...Object.fromEntries(Object.entries(y26.teamTotals).map(([k, v]) => [k, v.slice(0, 3)])) },
};
const C = Object.fromEntries(table.columns.map((c, i) => [c, i]));
const inSeasons = (s, [a, b]) => s >= a && s <= b;
const F = read("data/internal/research/nfl/reports/player-props-share-level-preregistration.json").frozen;
const G = read("data/internal/research/nfl/reports/nfl-003-opportunity-allocation-preregistration.json").frozen;
const DEV3 = read(INPUTS.nfl003Dev).devFits;
const teamMargin = () => 0; // the historical walk's margin feature is only used for scored history rows here; Week 5 margins come from the published forecast below
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
  return { teamGames, scored, players, byTeam, teamForm, oppForm, formOf };
}


// ════ NFL-003 allocV1 state after every final through the capture's week ═════════════════════════
const A3 = walk();
const SEASON = 2026;

// ════ NFL-004 TD state (P301 estimators + red-zone history; same code as replay-redzone-td.mjs) ═══
function tdState() {
  const FT = read("data/internal/research/nfl/reports/anytime-td-historical-replay-preregistration.json").frozen;
  const v2 = gz(INPUTS.playerGamesV2);
  const T = Object.fromEntries(v2.columns.map((c, i) => [c, i]));
  const rows2 = [...v2.rows, ...y26.rows.map((r) => v2.columns.map((c) => r[Y[c]]))];
  const totals2 = { ...v2.teamTotals, ...y26.teamTotals };
  const rzDoc = gz(INPUTS.redZone);
  const RZC = Object.fromEntries(rzDoc.columns.map((c, i) => [c, i]));
  const RZT = Object.fromEntries(rzDoc.teamTotalsColumns.map((c, i) => [c, i]));
  const rzRow = new Map(rzDoc.rows.map((r) => [`${r[0]}|${r[1]}|${r[2]}`, r]));
  const sum = (rs, f) => rs.reduce((a, r) => a + f(r), 0);
  const warm = v2.rows.filter((r) => inSeasons(r[T.season], FT.seasons.warmup) && r[T.participation] !== "UNKNOWN");
  const warmTG = Object.entries(v2.teamTotals).filter(([k]) => Number(k.slice(0, 4)) >= FT.seasons.warmup[0] && Number(k.slice(0, 4)) <= FT.seasons.warmup[1]).map(([, v]) => v);
  const touched = warm.filter((r) => r[T.carries] + r[T.targets] > 0);
  const LG = {
    rushTdPerCarry: sum(warm, (r) => r[T.rushTd]) / sum(warm, (r) => r[T.carries]), recTdPerTarget: sum(warm, (r) => r[T.recTd]) / sum(warm, (r) => r[T.targets]),
    teamRushTd: sum(warmTG, (v) => v[3]) / warmTG.length, teamRecTd: sum(warmTG, (v) => v[4]) / warmTG.length,
    otherTdPerPlayerGame: sum(touched, (r) => r[T.otherTd]) / touched.length,
  };
  const wt = (idxNow, idx, sNow, s, hl, bd) => 0.5 ** ((idxNow - idx) / hl) * bd ** Math.max(0, sNow - s);
  const players = new Map(); const byTeam = new Map(); const teamForm = new Map();
  const ST = (id) => { if (!players.has(id)) players.set(id, { team: null, games: 0, obs: { rush: [], targets: [] }, rates: { rushTd: [], recTd: [] }, rz: { c: [], t: [] } }); return players.get(id); };
  const teamTd = (team, season) => { const t = teamForm.get(team); if (!t) return { rush: LG.teamRushTd, rec: LG.teamRecTd }; const bd = FT.teamForm.boundaryDecay ** Math.max(0, season - t.season); return { rush: LG.teamRushTd + (t.rush - LG.teamRushTd) * bd, rec: LG.teamRecTd + (t.rec - LG.teamRecTd) * bd }; };
  const sorted = [...rows2].sort((a, b) => (a[T.date] !== b[T.date] ? (a[T.date] < b[T.date] ? -1 : 1) : a[T.gameId] < b[T.gameId] ? -1 : a[T.gameId] > b[T.gameId] ? 1 : 0));
  const folded = new Set();
  for (const r of sorted) {
    if (r[T.participation] === "UNKNOWN") continue;
    const id = String(r[T.playerId]); const st = ST(id);
    const tot = totals2[`${r[T.gameId]}|${r[T.team]}`] ?? [0, 0, 0, 0, 0];
    if (st.team !== r[T.team]) { if (st.team) byTeam.get(st.team)?.delete(id); st.obs = { rush: [], targets: [] }; st.rz = { c: [], t: [] }; st.team = r[T.team]; if (!byTeam.has(st.team)) byTeam.set(st.team, new Set()); byTeam.get(st.team).add(id); }
    const idx = st.games + 1;
    st.obs.rush.push({ share: tot[1] > 0 ? r[T.carries] / tot[1] : 0, idx, season: r[T.season] });
    st.obs.targets.push({ share: tot[2] > 0 ? r[T.targets] / tot[2] : 0, idx, season: r[T.season] });
    if (r[T.carries] > 0) st.rates.rushTd.push({ num: r[T.rushTd], den: r[T.carries], idx, season: r[T.season] });
    if (r[T.targets] > 0) st.rates.recTd.push({ num: r[T.recTd], den: r[T.targets], idx, season: r[T.season] });
    const pr = rzRow.get(`${r[T.gameId]}|${r[T.team]}|${id}`); const tt = rzDoc.teamTotals[`${r[T.gameId]}|${r[T.team]}`];
    if (tt && tt[RZT.c10] > 0) st.rz.c.push({ num: pr ? pr[RZC.c10] : 0, den: tt[RZT.c10], idx, season: r[T.season] });
    if (tt && tt[RZT.t10] > 0) st.rz.t.push({ num: pr ? pr[RZC.t10] : 0, den: tt[RZT.t10], idx, season: r[T.season] });
    st.games = idx;
    const tk = `${r[T.gameId]}|${r[T.team]}`;
    if (!folded.has(tk)) { folded.add(tk); const a = 1 - 0.5 ** (1 / FT.teamForm.halfLifeGames); const cur = teamTd(r[T.team], r[T.season]); teamForm.set(r[T.team], { rush: cur.rush + a * (tot[3] - cur.rush), rec: cur.rec + a * (tot[4] - cur.rec), season: r[T.season] }); }
  }
  const share = (st, fam, season) => { let n = 0; let d = 0; for (const o of st.obs[fam]) { const w = wt(st.games, o.idx, season, o.season, FT.share.halfLifeGames, FT.share.boundaryDecay); n += w * o.share; d += w; } return d > 0 ? n / d : 0; };
  const rate = (st, key, league, season, prior) => { let n = 0; let d = 0; for (const o of st.rates[key]) { const w = wt(st.games, o.idx, season, o.season, FT.rate.halfLifeGames, FT.rate.boundaryDecay); n += w * o.num; d += w * o.den; } return (n + prior * league) / (d + prior); };
  const rzShare = (st, kind, k, overall, season) => { let n = 0; let d = 0; for (const o of st.rz[kind]) { const w = wt(st.games, o.idx, season, o.season, FT.share.halfLifeGames, FT.share.boundaryDecay); n += w * o.num; d += w * o.den; } return (n + k * overall) / (d + k); };
  const clip = (p) => Math.min(1 - FT.probabilityClip, Math.max(FT.probabilityClip, p));
  return { FT, LG, players, byTeam, teamTd, share, rate, rzShare, clip };
}
const TD = tdState();
const SEL4 = read(INPUTS.nfl004Dev).devSelection.selected; // { N: 10, k: 40, rho: 0 }
if (SEL4.N !== 10) refuse("the forward TD state is built for inside-10; the development receipt selected another N");

// ════ NFL-005 allocation-world sampler (same code as replay-allocation-worlds.mjs) ════════════════
const KAPPA = read(INPUTS.nfl005AwDev).devFit.kappa;
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const seedOf = (s) => parseInt(crypto.createHash("sha256").update(s).digest("hex").slice(0, 8), 16);
function normal(rng) { const u = Math.max(1e-12, rng()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }
function gammaDraw(rng, shape) { if (shape <= 0) return 0; if (shape < 1) return gammaDraw(rng, shape + 1) * rng() ** (1 / shape); const d = shape - 1 / 3; const c = 1 / Math.sqrt(9 * d); for (;;) { let x; let v; do { x = normal(rng); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = rng(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; } }
function dirichlet(rng, alpha) { const g = alpha.map((a) => (a > 0 ? gammaDraw(rng, a) : 0)); const s = g.reduce((a, b) => a + b, 0); return s > 0 ? g.map((x) => x / s) : alpha.map(() => 1 / alpha.length); }
function multinomial(rng, n, p) { const out = new Array(p.length).fill(0); let left = n; let mass = 1; for (let i = 0; i < p.length - 1 && left > 0; i += 1) { const q = mass > 0 ? Math.min(1, Math.max(0, p[i] / mass)) : 0; let k = 0; for (let j = 0; j < left; j += 1) if (rng() < q) k += 1; out[i] = k; left -= k; mass -= p[i]; } out[p.length - 1] += left; return out; }
function binomial(rng, n, p) { let k = 0; for (let j = 0; j < n; j += 1) if (rng() < p) k += 1; return k; }
const RUNS = 2000;
function worldsFor(key, members, shares, V) {
  const rng = mulberry32(seedOf(`v2cap|${key}`));
  const n = members.length;
  const out = { receptions: members.map(() => new Float64Array(RUNS)), recYds: members.map(() => new Float64Array(RUNS)), rushYds: members.map(() => new Float64Array(RUNS)), passYds: members.map(() => new Float64Array(RUNS)) };
  for (let r = 0; r < RUNS; r += 1) {
    const A = Math.max(0, Math.round(V.passAtt + D.volumeSigmaPass * normal(rng)));
    const K = Math.max(0, Math.round(V.carries + D.volumeSigmaRush * normal(rng)));
    const Tt = V.passAtt > 0 ? Math.round(A * V.targets / V.passAtt) : 0;
    const tgt = multinomial(rng, Tt, dirichlet(rng, shares.targets.map((s) => s * KAPPA.t)));
    let teamRec = 0; let teamRecYds = 0;
    for (let i = 0; i <= n; i += 1) {
      const rec = binomial(rng, tgt[i], i < n ? members[i].rates.catch : L.catchRate);
      const yds = rec > 0 ? gammaDraw(rng, rec * D.receivingShape) * ((i < n ? members[i].rates.ypr : L.yardsPerReception) / D.receivingShape) : 0;
      teamRec += rec; teamRecYds += yds;
      if (i < n) { out.receptions[i][r] = rec; out.recYds[i][r] = yds; }
    }
    const att = multinomial(rng, A, dirichlet(rng, shares.passAttempts.map((s) => s * KAPPA.p)));
    const cmp = A > 0 ? multinomial(rng, teamRec, att.map((x) => x / A)) : att.map(() => 0);
    if (A === 0 && teamRec > 0) cmp[cmp.length - 1] = teamRec;
    let passSum = 0;
    for (let i = 0; i <= n; i += 1) { const y = teamRec > 0 ? teamRecYds * cmp[i] / teamRec : 0; passSum += y; if (i < n) out.passYds[i][r] = y; }
    if (Math.abs(passSum - teamRecYds) > 1e-6 || tgt.reduce((a, b) => a + b, 0) !== Tt) refuse(`invariant violated in a world for ${key}`);
    const car = multinomial(rng, K, dirichlet(rng, shares.rushAttempts.map((s) => s * KAPPA.c)));
    for (let i = 0; i < n; i += 1) out.rushYds[i][r] = car[i] > 0 ? gammaDraw(rng, car[i] * D.rushingShape) * (members[i].rates.ypc / D.rushingShape) : 0;
  }
  return out;
}
const qs = (v) => { const s = Float64Array.from(v).sort(); const at = (p) => s[Math.floor(p * (s.length - 1))]; return { mean: Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(3)), p10: Number(at(0.1).toFixed(2)), p50: Number(at(0.5).toFixed(2)), p90: Number(at(0.9).toFixed(2)) }; };

// ════ NFL-005 game worlds (same construction as replay-game-worlds.mjs) ══════════════════════════
const GW = read(INPUTS.nfl005GwDev);
const SCRIPT = GW.devFits.gameScript;
const GWPRE = read("data/internal/research/nfl/reports/nfl-005-game-worlds-preregistration.json").frozen;
const tdByPts = new Map();
for (const t of gz(INPUTS.teamGames)) if (GWPRE.tdTableSeasons.some((w) => inSeasons(t.s, w))) (tdByPts.get(t.pts) ?? tdByPts.set(t.pts, []).get(t.pts)).push(t.passTd + t.rushTd);
const tdPool = (pts) => { let pool = tdByPts.get(pts) ?? []; for (let w = 1; pool.length < GWPRE.tdTableMinObs && w <= 3; w += 1) pool = [...pool, ...(tdByPts.get(pts - w) ?? []), ...(tdByPts.get(pts + w) ?? [])]; return pool.length ? pool : [Math.floor(pts / 7)]; };
const snapPts = (x) => { const v = Math.max(0, Math.round(x)); return v === 1 ? 0 : v; };
function pick(rng, w) { const t = w.reduce((a, b) => a + b, 0); if (!(t > 0)) return -1; let u = rng() * t; for (let i = 0; i < w.length; i += 1) { u -= w[i]; if (u <= 0) return i; } return w.length - 1; }
/** sides: [{team, sign (+1 home), members, shares, V, mTeam, lam, rzc[], rzt[]}]; heads: {mMean, mSigma, tMean, tSigma} */
function gameWorlds(key, sides, heads) {
  const rng = mulberry32(seedOf(`v2cap-gw|${key}`));
  const out = sides.map((sd) => ({ rec: sd.members.map(() => new Float64Array(RUNS)), recYds: sd.members.map(() => new Float64Array(RUNS)), rushYds: sd.members.map(() => new Float64Array(RUNS)), passYds: sd.members.map(() => new Float64Array(RUNS)), td: sd.members.map(() => new Uint8Array(RUNS)), pts: new Int16Array(RUNS) }));
  let homeWins = 0; let ties = 0;
  for (let r = 0; r < RUNS; r += 1) {
    const M = heads.mMean + heads.mSigma * normal(rng); const Tt = Math.max(2, heads.tMean + heads.tSigma * normal(rng));
    const home = snapPts((Tt + M) / 2); const away = snapPts((Tt - M) / 2);
    if (home > away) homeWins += 1; else if (home === away) ties += 1;
    sides.forEach((sd, si) => {
      const n = sd.members.length; const o = out[si];
      const pts = sd.sign === 1 ? home : away; o.pts[r] = pts;
      const real = sd.sign * (home - away);
      const pool = tdPool(pts); const TD = pts >= 6 ? pool[Math.floor(rng() * pool.length)] : 0;
      const rushTD = binomial(rng, TD, sd.lam.rush / (sd.lam.rush + sd.lam.rec)); const recTD = TD - rushTD;
      const A = Math.max(0, Math.round(sd.V.passAtt + SCRIPT.passAtt.beta * (real - sd.mTeam) + SCRIPT.passAtt.sigma * normal(rng)));
      const K = Math.max(0, Math.round(sd.V.carries + SCRIPT.carries.beta * (real - sd.mTeam) + SCRIPT.carries.sigma * normal(rng)));
      const Tg = sd.V.passAtt > 0 ? Math.round(A * sd.V.targets / sd.V.passAtt) : 0;
      const tgt = multinomial(rng, Tg, dirichlet(rng, sd.shares.targets.map((x) => x * KAPPA.t)));
      const rec = new Array(n + 1).fill(0); let teamRec = 0; let teamRecYds = 0;
      for (let i = 0; i <= n; i += 1) { rec[i] = binomial(rng, tgt[i], i < n ? sd.members[i].rates.catch : L.catchRate); const y = rec[i] > 0 ? gammaDraw(rng, rec[i] * D.receivingShape) * ((i < n ? sd.members[i].rates.ypr : L.yardsPerReception) / D.receivingShape) : 0; teamRec += rec[i]; teamRecYds += y; if (i < n) { o.rec[i][r] = rec[i]; o.recYds[i][r] = y; } }
      const att = multinomial(rng, A, dirichlet(rng, sd.shares.passAttempts.map((x) => x * KAPPA.p)));
      const cmp = A > 0 ? multinomial(rng, teamRec, att.map((x) => x / A)) : att.map(() => 0);
      if (A === 0 && teamRec > 0) cmp[cmp.length - 1] = teamRec;
      let passSum = 0; for (let i = 0; i <= n; i += 1) { const y = teamRec > 0 ? teamRecYds * cmp[i] / teamRec : 0; passSum += y; if (i < n) o.passYds[i][r] = y; }
      if (Math.abs(passSum - teamRecYds) > 1e-6) refuse(`invariant: passing != receiving in ${key}`);
      const car = multinomial(rng, K, dirichlet(rng, sd.shares.rushAttempts.map((x) => x * KAPPA.c)));
      for (let i = 0; i < n; i += 1) o.rushYds[i][r] = car[i] > 0 ? gammaDraw(rng, car[i] * D.rushingShape) * (sd.members[i].rates.ypc / D.rushingShape) : 0;
      const tdc = new Array(n + 1).fill(0); const recBy = new Array(n + 1).fill(0);
      for (let k = 0; k < rushTD; k += 1) { const i = pick(rng, sd.rzc.map((w, ix) => (car[ix] > 0 ? w : 0))); tdc[i < 0 ? n : i] += 1; }
      for (let k = 0; k < recTD; k += 1) { let i = pick(rng, sd.rzt.map((w, ix) => (rec[ix] - recBy[ix] > 0 ? w : 0))); if (i < 0) { i = n; rec[n] += 1; } recBy[i] += 1; tdc[i] += 1; if (recBy[i] > rec[i]) refuse("invariant: receiving TDs exceed receptions"); }
      if (tdc.reduce((a, b) => a + b, 0) !== TD) refuse("invariant: scorer TDs != team TDs");
      for (let i = 0; i < n; i += 1) o.td[i][r] = tdc[i] > 0 ? 1 : 0;
    });
  }
  return { out, homeWinShare: homeWins / RUNS, tieShare: ties / RUNS };
}


// ════ the packet ══════════════════════════════════════════════════════════════════════════════════
const ESPN_TO_NV = { WSH: "WAS", LAR: "LA" };
const nv = (t) => ESPN_TO_NV[t] ?? t;
const gsisToEspn = new Map();
for (const l of fs.readFileSync(rel(INPUTS.participation2026), "utf8").trim().split("\n")) { const p = JSON.parse(l); if (p.gsisId && p.espnId) gsisToEspn.set(p.gsisId, String(p.espnId)); }
const playersCsv = path.join(ROOT, "data/internal/research/nfl/raw/nflverse/players.csv");
const mainPlayersCsv = "/Users/yashwantbalaji/Downloads/gametimepicks/data/internal/research/nfl/raw/nflverse/players.csv";
const pcsv = fs.existsSync(playersCsv) ? playersCsv : fs.existsSync(mainPlayersCsv) ? mainPlayersCsv : null;
let playersCsvSha = null;
if (pcsv) {
  const buf = fs.readFileSync(pcsv); playersCsvSha = crypto.createHash("sha256").update(buf).digest("hex");
  const lines = buf.toString("utf8").split("\n"); const h = lines[0].split(","); const gi = h.indexOf("gsis_id"); const ei = h.indexOf("espn_id");
  for (const l of lines.slice(1)) { const c = l.split(","); if (c[gi] && c[ei] && !gsisToEspn.has(c[gi])) gsisToEspn.set(c[gi], c[ei]); }
}
const nameOf = new Map();
for (const r of table.rows) nameOf.set(String(r[C.playerId]), r[C.name]);
const r4 = (x) => Number(x.toFixed(4));
const schedule = read(INPUTS.schedule);
const events = schedule.rows.filter((r) => r.seasonType === 2 && r.week === WEEK && r.statusRaw === "STATUS_SCHEDULED" && Date.parse(r.dateUtc) > Date.parse(NOW));
const teams = {};
const games = [];
const mem4 = (team) => TD.byTeam.get(team) ?? new Set();
for (const ev of events) {
  const g = { providerEventId: ev.providerEventId, matchup: ev.shortName, kickoffUtc: ev.dateUtc, away: ev.away.abbr, home: ev.home.abbr, volumeBase: {} };
  for (const [abbr, opp] of [[ev.away.abbr, ev.home.abbr], [ev.home.abbr, ev.away.abbr]]) {
    const team = nv(abbr);
    const tf = A3.formOf(A3.teamForm, team, SEASON); const of = A3.formOf(A3.oppForm, nv(opp), SEASON);
    // volume without the margin term (g·m is added at build time from the published margin)
    g.volumeBase[abbr] = Object.fromEntries(FAMILIES.map((fam) => { const k = VOLKEY[fam]; const c = DEV3.volume[fam]; return [k, r4(INTERCEPT[k] + c.bT * (tf[k] - INTERCEPT[k]) + c.bO * (of[k] - INTERCEPT[k]))]; }));
    if (teams[abbr]) continue;
    const pool = [];
    for (const id of A3.byTeam.get(team) ?? []) {
      const st = A3.players.get(id);
      const shares = Object.fromEntries(FAMILIES.map((fam) => [fam, decayedShare(st, fam, SEASON)]));
      if (!FAMILIES.some((fam) => shares[fam] > 0)) continue;
      const st4 = mem4(team).has(id) ? TD.players.get(id) : null;
      pool.push({
        playerId: id, espnId: gsisToEspn.get(id) ?? null, name: nameOf.get(id) ?? null,
        shares: Object.fromEntries(FAMILIES.map((fam) => [fam, r4(shares[fam])])),
        rates: { catch: r4(shrunkRate(st, "catch", L.catchRate, SEASON)), ypr: r4(shrunkRate(st, "ypr", L.yardsPerReception, SEASON)), ypc: r4(shrunkRate(st, "ypc", L.yardsPerCarry, SEASON)), comp: r4(shrunkRate(st, "comp", L.completionRate, SEASON)), ypcmp: r4(shrunkRate(st, "ypcmp", L.yardsPerCompletion, SEASON)) },
        redZone: st4 ? { carry: r4(TD.rzShare(st4, "c", SEL4.k, TD.share(st4, "rush", SEASON), SEASON)), target: r4(TD.rzShare(st4, "t", SEL4.k, TD.share(st4, "targets", SEASON), SEASON)) } : { carry: 0, target: 0 },
      });
    }
    const lam = TD.teamTd(team, SEASON);
    teams[abbr] = { nflverse: team, teamTdForm: { rush: r4(lam.rush), rec: r4(lam.rec) }, pool };
  }
  games.push(g);
}
// ── empirical scoring tables (team-games-v1) ─────────────────────────────────────────────────────────
const tg = gz(INPUTS.teamGames);
const inTable = (s) => GWPRE.tdTableSeasons.some((w) => inSeasons(s, w));
const offTdByPts = {}; const composition = {};
let exact = 0; let inexact = 0;
for (const t of tg) {
  if (!inTable(t.s)) continue;
  const off = t.passTd + t.rushTd;
  (offTdByPts[t.pts] ??= {})[off] = (offTdByPts[t.pts][off] ?? 0) + 1;
  const parts = [t.nonOffTd ?? 0, t.xpMade, t.twoMade, t.fgMade, t.safetiesFor ?? 0];
  if (6 * (off + parts[0]) + parts[1] + 2 * parts[2] + 3 * parts[3] + 2 * parts[4] !== t.pts) { inexact += 1; continue; }
  exact += 1;
  const k = `${t.pts}|${off}`; const c = parts.join(",");
  (composition[k] ??= {})[c] = (composition[k][c] ?? 0) + 1;
}
// overtime: regular-season games level after regulation, 10-minute OT era (2017+)
const byG = new Map(); for (const t of tg) (byG.get(t.g) ?? byG.set(t.g, []).get(t.g)).push(t);
const overtime = { seasons: [2017, 2025], games: 0, regulationGames: 0, outcomes: {} };
for (const rs of byG.values()) {
  if (rs.length !== 2 || rs[0].st !== "REG" || rs[0].s < 2017) continue;
  overtime.regulationGames += 1;
  const ot = rs.map((r) => r.periodPts?.["5"] ?? 0);
  if (rs[0].pts - ot[0] !== rs[1].pts - ot[1]) continue;
  overtime.games += 1;
  const w = Math.max(ot[0], ot[1]); const l = Math.min(ot[0], ot[1]);
  const k = `${w},${l}`; overtime.outcomes[k] = (overtime.outcomes[k] ?? 0) + 1;
}
const doc = {
  schemaVersion: 1, artifact: "nfl-world-model-v2-inputs", dataClass: "PRIVATE_RESEARCH",
  exportedAt: NOW, season: SEASON, week: WEEK,
  provenance: { tool: "scripts/research/nfl/export-world-model-v2-inputs.mjs", sameStateAs: "capture-v2-candidates-forward.mjs", inputHashes, playersCsvSha256: playersCsvSha, scheduleGeneratedAt: schedule.generatedAt },
  params: {
    league: L, dispersion: D, intercepts: INTERCEPT, kappa: KAPPA, gameScript: SCRIPT,
    volumeMarginSlope: Object.fromEntries(FAMILIES.map((fam) => [VOLKEY[fam], DEV3.volume[fam].g])),
    rho: DEV3.rho, otherFloor: G.otherFloor, tdTableMinObs: GWPRE.tdTableMinObs,
    otherTdPerPlayerGame: TD.LG.otherTdPerPlayerGame,
    receipts: { allocV1: "nfl-003-opportunity-allocation-development.json", allocationWorlds: "nfl-005-allocation-worlds-development.json", gameWorlds: "nfl-005-game-worlds-development.json", redZone: "nfl-004-redzone-td-development.json" },
  },
  tables: { offTdByPts, composition, compositionRows: { exact, inexact }, overtime, tdTableSeasons: GWPRE.tdTableSeasons },
  teams, games,
};
const body = JSON.stringify(doc);
doc.contentSha256 = crypto.createHash("sha256").update(body).digest("hex");
const out = argOf("--out", rel(`data/internal/nfl/world-model-v2/inputs/${SEASON}-week${String(WEEK).padStart(2, "0")}-${NOW.replace(/[-:]/g, "").slice(0, 13)}Z.json`));
fs.mkdirSync(path.dirname(out), { recursive: true });
if (fs.existsSync(out)) refuse(`${out} exists — packets are never overwritten`);
fs.writeFileSync(out, `${JSON.stringify(doc)}\n`, { flag: "wx" });
console.log(`wrote ${out}: ${games.length} game(s), ${Object.keys(teams).length} teams · exact composition rows ${exact}/${exact + inexact} · OT games ${overtime.games}/${overtime.regulationGames} · ${doc.contentSha256.slice(0, 12)}`);
