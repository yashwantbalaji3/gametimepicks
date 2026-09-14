#!/usr/bin/env node
/**
 * NFL PLAYER PROPS — HISTORICAL WALK-FORWARD REPLAY (P299)
 *
 * Executes data/internal/research/nfl/reports/player-props-historical-replay-preregistration.json. Every
 * constant, threshold, distribution, grid and bar is read from that file's `frozen` block.
 *
 *   --validate            DEV seasons only (2022–2025): the dispersion-scale fit, population counts and dev
 *                         metrics. No held-out metric is computed; a metric call on a held-out row throws.
 *   --score --now <ISO>   the ONE look at held-out 2014–2021. Refuses unless the registration is committed and
 *                         unmodified, and refuses if the evaluation file already exists. Those checks run FIRST.
 *
 * Deterministic: every quantile and P(over) is computed exactly from the registered distributions.
 * Lives outside app/ on purpose: the Vercel ignore step builds only when app/ changes.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const PREREG_PATH = "data/internal/research/nfl/reports/player-props-historical-replay-preregistration.json";
const OUT_PATH = "data/internal/research/nfl/reports/player-props-historical-replay-evaluation.json";
const TABLE_PATH = "data/internal/research/nfl/replay/player-games-v1.json.gz";

const argv = process.argv.slice(2);
const MODE = argv.includes("--score") ? "score" : argv.includes("--validate") ? "validate" : null;
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };
if (!MODE) refuse("usage: --validate | --score --now <ISO>");

/* The one-look guards run before any work, so a refused score costs nothing. */
const NOW = argOf("--now");
let preregCommit = null;
if (MODE === "score") {
  if (!NOW || !Number.isFinite(Date.parse(NOW))) refuse("--now <ISO> required");
  if (fs.existsSync(rel(OUT_PATH))) refuse(`${OUT_PATH} already exists — the held-out set has been looked at once`);
  const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
  preregCommit = git("log", "-1", "--format=%H %cI", "--", PREREG_PATH);
  if (!preregCommit) refuse("the preregistration is not committed");
  try { git("diff", "--quiet", "HEAD", "--", PREREG_PATH); } catch { refuse("the preregistration has uncommitted changes"); }
}

const prereg = JSON.parse(fs.readFileSync(rel(PREREG_PATH), "utf8"));
const F = prereg.frozen;
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(rel(p))).digest("hex");
if (sha(TABLE_PATH) !== F.inputs.playerGamesSha256) refuse("player-games table does not match the registered hash");
if (sha("scripts/research/nfl/build-player-games-v1.mjs") !== F.inputs.buildScriptSha256) refuse("table build script does not match the registered hash");

const table = JSON.parse(zlib.gunzipSync(fs.readFileSync(rel(TABLE_PATH))));
const C = Object.fromEntries(table.columns.map((c, i) => [c, i]));
const inSeasons = (s, [a, b]) => s >= a && s <= b;

// ── exact distributions ───────────────────────────────────────────────────────────────────────────
function logGamma(x) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let s = 1.000000000190015;
  for (const c of g) { y += 1; s += c / y; }
  return -t + Math.log(2.5066282746310005 * s / x);
}
/** Regularized lower incomplete gamma P(a, x). */
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

/** Count distribution matched to (mean, variance): negative binomial, or Poisson when variance <= mean. */
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

/** Zero-inflated Gamma matched to (mean, variance) with a given zero mass. */
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

// ── walk-forward state ────────────────────────────────────────────────────────────────────────────
const FAMILY_OF = { player_receptions: "targets", player_reception_yds: "targets", player_rush_yds: "rushAttempts", player_pass_yds: "passAttempts" };
const MARKETS = Object.keys(FAMILY_OF);
const CANDS = ["interceptVolume", "teamFormVolume"];
const players = new Map();
const byTeam = new Map(); // team -> Set(player id) of players whose latest played game was for that team
const teamForm = new Map();
const ST = (id) => {
  if (!players.has(id)) players.set(id, { team: null, games: 0, obs: { passAttempts: [], rushAttempts: [], targets: [] }, rates: {}, recent: {} });
  return players.get(id);
};
const weight = (idxNow, idx, seasonNow, season, hl, bd) => 0.5 ** ((idxNow - idx) / hl) * bd ** Math.max(0, seasonNow - season);
function decayedShare(st, family, season) {
  let num = 0;
  let den = 0;
  for (const o of st.obs[family]) { const w = weight(st.games, o.idx, season, o.season, F.share.halfLifeGames, F.share.boundaryDecay); num += w * o.share; den += w; }
  return den > 0 ? num / (den + F.share.shrinkK) : 0;
}
function shrunkRate(st, key, league, season) {
  let num = 0;
  let den = 0;
  for (const o of st.rates[key] ?? []) { const w = weight(st.games, o.idx, season, o.season, F.rate.halfLifeGames, F.rate.boundaryDecay); num += w * o.num; den += w * o.den; }
  return (num + F.rate.priorTrials * league) / (den + F.rate.priorTrials);
}
const INTERCEPT = { passAtt: F.intercepts.passAttempts, carries: F.intercepts.carries, targets: F.intercepts.passAttempts };
function teamVolume(team, season) {
  const t = teamForm.get(team);
  if (!t) return { ...INTERCEPT };
  const bd = F.teamForm.boundaryDecay ** Math.max(0, season - t.season);
  return { passAtt: INTERCEPT.passAtt + (t.passAtt - INTERCEPT.passAtt) * bd, carries: INTERCEPT.carries + (t.carries - INTERCEPT.carries) * bd, targets: INTERCEPT.targets + (t.targets - INTERCEPT.targets) * bd };
}
function foldTeam(team, season, totals) {
  const alpha = 1 - 0.5 ** (1 / F.teamForm.halfLifeGames);
  const cur = teamVolume(team, season);
  teamForm.set(team, { passAtt: cur.passAtt + alpha * (totals[0] - cur.passAtt), carries: cur.carries + alpha * (totals[1] - cur.carries), targets: cur.targets + alpha * (totals[2] - cur.targets), season });
}

const L = F.league;
const D = F.dispersion;
const perOpp = { player_reception_yds: L.catchRate * L.yardsPerReception, player_receptions: L.catchRate, player_rush_yds: L.yardsPerCarry, player_pass_yds: L.completionRate * L.yardsPerCompletion };
const actualOf = { player_receptions: (r) => r[C.receptions], player_reception_yds: (r) => r[C.recYds], player_rush_yds: (r) => r[C.rushYds], player_pass_yds: (r) => r[C.passYds] };

/**
 * Unscaled moments of one market for one candidate: { mean, variance, count: bool, zeroCount: {mean, variance} }.
 * The dispersion scale is applied later, so the dev fit can try the grid without replaying.
 */
function moments(st, mkt, season, vol) {
  const fam = FAMILY_OF[mkt];
  const share = decayedShare(st, fam, season);
  const opp = (mean, sigma) => ({ mean, variance: mean + share * share * sigma * sigma });
  const thin = (n, rate) => ({ mean: n.mean * rate, variance: n.mean * rate * (1 - rate) + rate * rate * n.variance });
  const yards = (k, perPlay, shape) => ({ mean: k.mean * perPlay, variance: (k.mean * perPlay * perPlay) / shape + k.variance * perPlay * perPlay });
  if (mkt === "player_receptions" || mkt === "player_reception_yds") {
    const rec = thin(opp(share * vol.targets, D.volumeSigmaPass), shrunkRate(st, "catch", L.catchRate, season));
    if (mkt === "player_receptions") return { ...rec, count: true };
    return { ...yards(rec, shrunkRate(st, "ypr", L.yardsPerReception, season), D.receivingShape), count: false, zeroCount: rec };
  }
  if (mkt === "player_rush_yds") {
    const car = opp(share * vol.carries, D.volumeSigmaRush);
    return { ...yards(car, shrunkRate(st, "ypc", L.yardsPerCarry, season), D.rushingShape), count: false, zeroCount: car };
  }
  const cmp = thin(opp(share * vol.passAtt, D.volumeSigmaPass), shrunkRate(st, "comp", L.completionRate, season));
  return { ...yards(cmp, shrunkRate(st, "ypcmp", L.yardsPerCompletion, season), D.passingShape), count: false, zeroCount: cmp };
}

/** The scaled distribution of a scored row: p10, p90 and P(over line). */
function evaluateRow(m, s, line) {
  if (m.count) {
    const d = countDist(m.mean, m.mean + s * Math.max(m.variance - m.mean, 0));
    return { p10: countQuantile(d, 0.1), p90: countQuantile(d, 0.9), pOver: line > 0 ? 1 - countCdf(d, Math.floor(line)) : null };
  }
  const p0 = countPmf(countDist(m.zeroCount.mean, m.zeroCount.variance), 0);
  const d = zeroGamma(m.mean, s * m.variance, p0);
  return { p10: zgQuantile(d, 0.1), p90: zgQuantile(d, 0.9), pOver: line > 0 ? 1 - zgCdf(d, line) : null };
}

// ── the replay ────────────────────────────────────────────────────────────────────────────────────
const rows = [...table.rows].sort((a, b) => (a[C.date] !== b[C.date] ? (a[C.date] < b[C.date] ? -1 : 1) : a[C.gameId] < b[C.gameId] ? -1 : a[C.gameId] > b[C.gameId] ? 1 : 0));
const scored = [];
const counts = { void: {}, quarantined: {}, playedNoRowScored: {}, pfrHistories: 0 };
const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };

for (let i = 0; i < rows.length;) {
  let j = i;
  while (j < rows.length && rows[i][C.date] === rows[j][C.date]) j += 1;
  const day = rows.slice(i, j);
  const season = day[0][C.season];

  if (season > F.seasons.warmup[1]) {
    const teamGames = new Map();
    for (const r of day) {
      const k = `${r[C.gameId]}|${r[C.team]}`;
      if (!teamGames.has(k)) teamGames.set(k, { team: r[C.team], rows: new Map() });
      teamGames.get(k).rows.set(String(r[C.playerId]), r);
    }
    for (const tg of teamGames.values()) {
      const vols = { interceptVolume: INTERCEPT, teamFormVolume: teamVolume(tg.team, season) };
      for (const id of byTeam.get(tg.team) ?? []) {
        const st = players.get(id);
        const row = tg.rows.get(id) ?? null;
        for (const mkt of MARKETS) {
          const fam = FAMILY_OF[mkt];
          const share = decayedShare(st, fam, season);
          if (share < F.thresholds[fam]) continue;
          if (!row) { bump(counts.void, `${season}|${mkt}`); continue; }
          if (row[C.participation] === "UNKNOWN") { bump(counts.quarantined, `${season}|${mkt}`); continue; }
          if (row[C.participation] === "PLAYED_NO_ROW") bump(counts.playedNoRowScored, `${season}|${mkt}`);
          const recent = (st.recent[mkt] ?? []).slice(-4);
          const rolling4 = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
          const volKey = mkt === "player_rush_yds" ? "carries" : mkt === "player_pass_yds" ? "passAtt" : "targets";
          const base = { season, mkt, actual: actualOf[mkt](row), rolling4, shareVol: share * INTERCEPT[volKey] * perOpp[mkt], isCount: mkt === "player_receptions" };
          for (const cand of CANDS) scored.push({ ...base, cand, m: moments(st, mkt, season, vols[cand]) });
        }
      }
    }
  }

  const teamsFolded = new Set();
  for (const r of day) {
    if (r[C.participation] === "UNKNOWN") continue;
    const id = String(r[C.playerId]);
    if (id.startsWith("pfr:") && !players.has(id)) counts.pfrHistories += 1;
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
    if (!teamsFolded.has(tk)) { teamsFolded.add(tk); foldTeam(r[C.team], r[C.season], totals); }
  }
  i = j;
}

// ── dev dispersion-scale fit (2022–2025 only) ─────────────────────────────────────────────────────
const isDev = (s) => inSeasons(s.season, F.seasons.dev);
const coverOf = (x, e) => (x.isCount && (x.actual === e.p10 || x.actual === e.p90) ? 0.5 : x.actual >= e.p10 && x.actual <= e.p90 ? 1 : 0);
const scale = {};
const scaleTrace = {};
for (const mkt of MARKETS) for (const cand of CANDS) {
  const dev = scored.filter((x) => x.mkt === mkt && x.cand === cand && isDev(x));
  if (dev.some((x) => !isDev(x))) throw new Error("a non-dev row reached the dispersion fit");
  const trace = F.dispersionScaleGrid.map((s) => ({ s, devCoverage80: dev.length ? dev.reduce((a, x) => a + coverOf(x, evaluateRow(x.m, s, 0)), 0) / dev.length : null }));
  const best = [...trace].sort((a, b) => Math.abs(a.devCoverage80 - 0.8) - Math.abs(b.devCoverage80 - 0.8) || a.s - b.s)[0];
  scale[`${mkt}|${cand}`] = best.s;
  scaleTrace[`${mkt}|${cand}`] = trace;
}
for (const x of scored) {
  const e = evaluateRow(x.m, scale[`${x.mkt}|${x.cand}`], x.rolling4);
  x.mean = x.m.mean;
  x.p10 = e.p10;
  x.p90 = e.p90;
  x.pOverLine = e.pOver;
  x.line = x.rolling4;
  delete x.m;
}

// ── metrics ───────────────────────────────────────────────────────────────────────────────────────
const guard = (list) => { if (MODE === "validate" && list.some((s) => !isDev(s))) throw new Error("a held-out row reached a metric in --validate"); };
function metrics(list) {
  guard(list);
  const n = list.length;
  if (!n) return null;
  const avg = (f) => list.reduce((s, x) => s + f(x), 0) / n;
  const withLine = list.filter((x) => x.pOverLine != null);
  const bins = Array.from({ length: F.bars.eceBins }, () => ({ n: 0, p: 0, y: 0 }));
  for (const x of withLine) { const b = bins[Math.min(F.bars.eceBins - 1, Math.floor(x.pOverLine * F.bars.eceBins))]; b.n += 1; b.p += x.pOverLine; b.y += x.actual > x.line ? 1 : 0; }
  const ece = withLine.length ? bins.reduce((s, b) => s + (b.n ? (b.n / withLine.length) * Math.abs(b.p / b.n - b.y / b.n) : 0), 0) : null;
  return {
    n,
    mae: avg((x) => Math.abs(x.mean - x.actual)),
    rolling4Mae: avg((x) => Math.abs(x.rolling4 - x.actual)),
    shareVolMae: avg((x) => Math.abs(x.shareVol - x.actual)),
    coverage80: avg((x) => coverOf(x, x)),
    ece,
    eceN: withLine.length,
  };
}
const r5 = (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(5)) : v);
const slice = (cand, mkt, pred) => scored.filter((s) => s.cand === cand && s.mkt === mkt && pred(s));

if (MODE === "validate") {
  console.log(`scored rows (all seasons, both candidates): ${scored.length} · pfr-prefixed histories ${counts.pfrHistories}`);
  console.log("dev dispersion scales:", JSON.stringify(scale));
  for (const mkt of MARKETS) for (const cand of CANDS) {
    for (const season of [2022, 2023, 2024, 2025]) {
      const m = metrics(slice(cand, mkt, (s) => s.season === season));
      if (m) console.log(`${season} ${mkt.padEnd(21)} ${cand.padEnd(15)} n ${m.n} · mae ${m.mae.toFixed(3)} · rolling4 ${m.rolling4Mae.toFixed(3)} · shareVol ${m.shareVolMae.toFixed(3)} · cov80 ${m.coverage80.toFixed(3)} · ece ${m.ece?.toFixed(3)}`);
    }
    const all = metrics(slice(cand, mkt, isDev));
    if (all) console.log(`DEV  ${mkt.padEnd(21)} ${cand.padEnd(15)} s ${scale[`${mkt}|${cand}`]} · n ${all.n} · mae ${all.mae.toFixed(3)} · rolling4 ${all.rolling4Mae.toFixed(3)} · shareVol ${all.shareVolMae.toFixed(3)} · cov80 ${all.coverage80.toFixed(3)} · ece ${all.ece?.toFixed(3)}\n`);
  }
  process.exit(0);
}

// ── --score: the one look ─────────────────────────────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function bootstrap(list) {
  const overall = metrics(list);
  const better = overall.rolling4Mae <= overall.shareVolMae ? "rolling4" : "shareVol";
  const seasons = [...new Set(list.map((x) => x.season))].sort((a, b) => a - b);
  const agg = new Map(seasons.map((s) => [s, { sum: 0, n: 0 }]));
  for (const x of list) { const o = agg.get(x.season); o.sum += Math.abs(x.mean - x.actual) - Math.abs(x[better] - x.actual); o.n += 1; }
  const rand = mulberry32(F.bootstrap.seed);
  const stats = [];
  for (let b = 0; b < F.bootstrap.resamples; b += 1) {
    let sum = 0; let n = 0;
    for (let k = 0; k < seasons.length; k += 1) { const o = agg.get(seasons[Math.floor(rand() * seasons.length)]); sum += o.sum; n += o.n; }
    stats.push(sum / n);
  }
  stats.sort((x, y) => x - y);
  return { versus: better, point: [...agg.values()].reduce((s, o) => s + o.sum, 0) / list.length, lo95: stats[Math.floor(0.025 * stats.length)], hi95: stats[Math.ceil(0.975 * stats.length) - 1] };
}

const held = (s) => inSeasons(s.season, F.seasons.heldOut);
const eraKeys = F.eras.map(([a, b]) => ({ key: `${a}-${b}`, pred: (s) => inSeasons(s.season, [a, b]) }));
const results = {};
const bars = {};
const verdicts = {};
const bar = (pass, required, observed) => ({ pass: Boolean(pass), required, observed });
for (const mkt of MARKETS) {
  results[mkt] = {};
  bars[mkt] = {};
  verdicts[mkt] = {};
  for (const cand of CANDS) {
    const list = slice(cand, mkt, held);
    const overall = metrics(list);
    const eras = Object.fromEntries(eraKeys.map((e) => [e.key, metrics(slice(cand, mkt, (s) => held(s) && e.pred(s)))]));
    const seasons = Object.fromEntries([...new Set(list.map((x) => x.season))].sort((a, b) => a - b).map((s) => [s, metrics(slice(cand, mkt, (x) => x.season === s))]));
    const boot = list.length ? bootstrap(list) : null;
    results[mkt][cand] = { dispersionScale: scale[`${mkt}|${cand}`], overall, eras, seasons, bootstrap: boot };
    const [lo, hi] = F.bars.coverageBand;
    const b = overall ? {
      beatsRolling4: bar(overall.mae < overall.rolling4Mae && Object.values(eras).every((m) => m && m.mae < m.rolling4Mae), "below rolling-4 overall and in every era", { overall: [overall.mae, overall.rolling4Mae], eras: Object.fromEntries(Object.entries(eras).map(([k, m]) => [k, m ? [m.mae, m.rolling4Mae] : null])) }),
      beatsShareVolume: bar(overall.mae < overall.shareVolMae && Object.values(eras).every((m) => m && m.mae < m.shareVolMae), "below share x volume overall and in every era", { overall: [overall.mae, overall.shareVolMae], eras: Object.fromEntries(Object.entries(eras).map(([k, m]) => [k, m ? [m.mae, m.shareVolMae] : null])) }),
      improvementIsNotNoise: bar(boot && boot.hi95 < 0, "season-bootstrap 95% upper bound < 0 versus the better baseline", boot),
      coverage80: bar(overall.coverage80 >= lo && overall.coverage80 <= hi, `[${lo}, ${hi}]`, overall.coverage80),
      thresholdCalibration: bar(overall.ece != null && overall.ece <= F.bars.eceMax, `ECE <= ${F.bars.eceMax}`, overall.ece),
      minimumN: bar(overall.n >= F.bars.minimumN, `n >= ${F.bars.minimumN}`, overall.n),
    } : { minimumN: bar(false, `n >= ${F.bars.minimumN}`, 0) };
    bars[mkt][cand] = b;
    verdicts[mkt][cand] = Object.values(b).every((x) => x.pass) ? "ELIGIBLE" : "REJECTED";
  }
}
const recommendation = Object.fromEntries(MARKETS.map((mkt) => {
  const ok = CANDS.filter((c) => verdicts[mkt][c] === "ELIGIBLE").sort((a, b) => results[mkt][a].overall.mae - results[mkt][b].overall.mae);
  return [mkt, ok[0] ?? null];
}));

const receipt = {
  schemaVersion: 1,
  artifact: "player-props-historical-replay-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  program: "299",
  generatedAt: NOW,
  preregistration: { path: PREREG_PATH, commit: preregCommit },
  scriptSha256: sha("scripts/research/nfl/replay-player-props.mjs"),
  population: {
    heldOutSeasons: F.seasons.heldOut,
    scored: Object.fromEntries(MARKETS.map((m) => [m, slice(CANDS[0], m, held).length])),
    void: counts.void,
    quarantined: counts.quarantined,
    playedNoRowScored: counts.playedNoRowScored,
    pfrPrefixedHistories: counts.pfrHistories,
  },
  devDispersionScales: scale,
  devDispersionTrace: scaleTrace,
  results,
  bars,
  verdicts,
  recommendation,
  consequence: "Nothing publishes from this receipt. v1 keeps publishing; replacing or adding a public player family is its own reviewed step in a founder-approved app/ change.",
};
fs.writeFileSync(rel(OUT_PATH), JSON.stringify(receipt, r5, 1), { flag: "wx" });
for (const mkt of MARKETS) for (const cand of CANDS) {
  const o = results[mkt][cand].overall;
  if (!o) { console.log(`${mkt} ${cand}: no scored rows`); continue; }
  console.log(`${mkt.padEnd(21)} ${cand.padEnd(15)} ${verdicts[mkt][cand].padEnd(9)} s ${scale[`${mkt}|${cand}`]} · n ${o.n} · mae ${o.mae.toFixed(3)} · rolling4 ${o.rolling4Mae.toFixed(3)} · shareVol ${o.shareVolMae.toFixed(3)} · cov80 ${o.coverage80.toFixed(3)} · ece ${o.ece?.toFixed(3)} · failed: ${Object.entries(bars[mkt][cand]).filter(([, b]) => !b.pass).map(([k]) => k).join(", ") || "none"}`);
}
console.log(`recommendation: ${JSON.stringify(recommendation)}`);
