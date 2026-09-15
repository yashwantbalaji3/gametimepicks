#!/usr/bin/env node
/**
 * P318 / P332 — NFL passing yards, DECOMPOSED candidate. DEV ONLY (seasons 2022–2025 of player-games-v1). Nothing here is
 * a registration, a second look, or a public change; every figure is development evidence for the go/no-go the design
 * note (`passing-yards-candidate-design.md`) asks for.
 *
 * Candidate: passYds = attempts × yards-per-attempt, forecast BEFORE each game from folded prior games only:
 *   team attempts   decayed mean of the team's pass attempts (half-life HL games, season decay SD), with a prior of
 *                   PRIOR_TEAM games toward the running league mean
 *   QB share        the named QB's decayed share of the team's attempts on games he played (no pull toward zero);
 *                   the candidate is the team's highest-share QB whose last played game is one of the team's last
 *                   three — a departed or benched QB is never a candidate (VOID rule as in the forward protocol)
 *   yards/attempt   the QB's decayed yards ÷ attempts, shrunk toward the running league rate with PRIOR_YPA attempts
 *   combine         attempts ~ NegBin(mean, size R) · Y/A ~ Gamma(cv CV) · yards = attempts × Y/A, 2,000 seeded draws
 * Scored on dev rows where the candidate PLAYED (else VOID): MAE on p50, level (mean forecast ÷ mean actual), p10–p90
 * coverage and width, 10-bin ECE of P(over the rolling-4 line) — the bars every family uses. Baselines: the rolling-4
 * median (line) as a point forecast; the design note quotes the live ESTIMATE's dev MAE of 65.3.
 * Only the dispersion pair (R, CV) is a grid, as the props preregistration convention allows; everything else is fixed.
 *
 * Usage: node scripts/research/nfl/explore-passing-yards-decomposed.mjs [--out data/internal/research/nfl/reports/passing-yards-decomposed-dev.json]
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const argOf = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const OUT = argOf("--out") ?? "data/internal/research/nfl/reports/passing-yards-decomposed-dev.json";
const DEV = [2022, 2025], WARMUP_FROM = 2021;
const HL = 6, SD = 0.85, PRIOR_TEAM = 4, PRIOR_YPA = 150, MIN_SHARE = 0.5, DRAWS = 2000;
const GRID = { R: [15, 25, 40], CV: [0.25, 0.3, 0.35] };

const table = JSON.parse(zlib.gunzipSync(fs.readFileSync(rel("data/internal/research/nfl/replay/player-games-v1.json.gz"))));
const C = Object.fromEntries(table.columns.map((c, i) => [c, i]));
const TT = Object.fromEntries(table.teamTotalsColumns.map((c, i) => [c, i]));
const rows = table.rows.filter((r) => r[C.season] >= WARMUP_FROM && r[C.seasonType] === "REG");
/* team-games in date order, with the team's total pass attempts */
const teamGames = new Map();
for (const r of rows) {
  const key = `${r[C.gameId]}|${r[C.team]}`;
  if (!teamGames.has(key)) teamGames.set(key, { key, gameId: r[C.gameId], team: r[C.team], season: r[C.season], week: r[C.week], date: r[C.date], passAtt: table.teamTotals[key]?.[TT.passAtt] ?? null, qbs: [] });
  if (r[C.position] === "QB") teamGames.get(key).qbs.push(r);
}
const ordered = [...teamGames.values()].filter((g) => g.passAtt != null).sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));

/* seeded RNG + samplers */
let seed = 20260915; const rng = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gaussian = () => { const u = Math.max(rng(), 1e-12), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function gammaDraw(shape, scale) { // Marsaglia–Tsang; shape ≥ 1 in our range
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { const x = gaussian(); const v = (1 + c * x) ** 3; if (v <= 0) continue; const u = rng(); if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v * scale; }
}
const poisson = (lam) => { const L = Math.exp(-lam); let k = 0, p = 1; do { k += 1; p *= rng(); } while (p > L); return k - 1; };
const negBin = (mean, r) => poisson(gammaDraw(r, mean / r));

/* state */
const decay = (last, now, seasonLast, seasonNow) => 0.5 ** ((now - last) / HL) * SD ** Math.max(0, seasonNow - seasonLast);
const team = new Map(); // team → { idx, num, den, season }
const qb = new Map();   // playerId → { team, lastTeamIdx, shareNum, shareDen, yds, att, season, played: [yards...] }
let leagueAttSum = 0, leagueAttN = 0, leagueYds = 0, leagueAtt = 0;
const teamIdx = new Map();
const scored = [];
let voids = 0, candidatesNoQb = 0;

for (const g of ordered) {
  const idx = (teamIdx.get(g.team) ?? 0);
  const isDev = g.season >= DEV[0] && g.season <= DEV[1];
  const ts = team.get(g.team);
  const leagueMeanAtt = leagueAttN ? leagueAttSum / leagueAttN : 33;
  const leagueYpa = leagueAtt ? leagueYds / leagueAtt : 7.0;
  /* candidate QB from state (before folding this game) */
  let best = null;
  for (const [pid, st] of qb) {
    if (st.team !== g.team || idx - st.lastTeamIdx > 3) continue;
    const share = st.shareDen > 0 ? st.shareNum / st.shareDen : 0;
    if (share >= MIN_SHARE && (!best || share > best.share)) best = { pid, share, st };
  }
  if (isDev && ts && ts.den > 0) {
    if (!best) candidatesNoQb += 1;
    else {
      const wTeam = ts.den; const attMean = (ts.num + PRIOR_TEAM * leagueMeanAtt) / (wTeam + PRIOR_TEAM);
      const ypa = (best.st.yds + PRIOR_YPA * leagueYpa) / (best.st.att + PRIOR_YPA);
      const played = g.qbs.find((r) => r[C.playerId] === best.pid && r[C.participation] === "PLAYED" && r[C.passAtt] > 0);
      if (!played) { voids += 1; }
      else {
        const actual = played[C.passYds];
        const hist = best.st.played;
        const line = hist.length >= 4 ? [...hist.slice(-4)].sort((a, b) => a - b).slice(1, 3).reduce((a, b) => a + b, 0) / 2 : null;
        scored.push({ season: g.season, week: g.week, team: g.team, pid: best.pid, attMean: attMean * best.share, ypa, actual, line, actualAtt: played[C.passAtt] });
      }
    }
  }
  /* fold this team-game */
  const t = ts ?? { num: 0, den: 0, idx: 0, season: g.season };
  const d = ts ? decay(0, 1, ts.season, g.season) : 1; // one-step decay per team game, plus season decay
  t.num = t.num * d + g.passAtt; t.den = t.den * d + 1; t.season = g.season; team.set(g.team, t);
  leagueAttSum += g.passAtt; leagueAttN += 1;
  for (const r of g.qbs) {
    const pid = r[C.playerId];
    const st = qb.get(pid) ?? { team: g.team, lastTeamIdx: idx, shareNum: 0, shareDen: 0, yds: 0, att: 0, season: g.season, played: [] };
    const dq = decay(0, 1, st.season, g.season);
    if (st.team !== g.team) { st.team = g.team; st.shareNum = 0; st.shareDen = 0; } // a new team: share history restarts
    if (r[C.participation] === "PLAYED") {
      st.shareNum = st.shareNum * dq + (g.passAtt > 0 ? r[C.passAtt] / g.passAtt : 0); st.shareDen = st.shareDen * dq + 1;
      st.yds = st.yds * dq + r[C.passYds]; st.att = st.att * dq + r[C.passAtt];
      st.lastTeamIdx = idx; if (r[C.passAtt] > 0) st.played.push(r[C.passYds]);
      leagueYds += r[C.passYds]; leagueAtt += r[C.passAtt];
    }
    st.season = g.season; qb.set(pid, st);
  }
  teamIdx.set(g.team, idx + 1);
}

/* score under each dispersion pair (common draws per row via reseeding) */
const r4 = (v) => (Number.isFinite(v) ? Number(v.toFixed(4)) : null);
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pct = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
function evaluate(R, CV) {
  seed = 20260915;
  const out = [];
  for (const x of scored) {
    const draws = new Array(DRAWS);
    for (let i = 0; i < DRAWS; i += 1) { const att = negBin(Math.max(x.attMean, 1), R); const ypa = gammaDraw(1 / (CV * CV), x.ypa * CV * CV); draws[i] = att * ypa; }
    const p10 = pct(draws, 0.1), p25 = pct(draws, 0.25), p50 = pct(draws, 0.5), p75 = pct(draws, 0.75), p90 = pct(draws, 0.9), mean = meanOf(draws);
    const pOver = x.line != null ? draws.filter((y) => y > x.line).length / DRAWS : null;
    out.push({ ...x, p10, p25, p50, p75, p90, mean, pOver, over: x.line != null ? (x.actual > x.line ? 1 : x.actual < x.line ? 0 : null) : null });
  }
  const lined = out.filter((o) => o.pOver != null && o.over != null);
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, o: 0 }));
  for (const o of lined) { const b = bins[Math.min(9, Math.floor(o.pOver * 10))]; b.n += 1; b.p += o.pOver; b.o += o.over; }
  const ece = bins.reduce((s, b) => s + (b.n ? (b.n / lined.length) * Math.abs(b.p / b.n - b.o / b.n) : 0), 0);
  const bySeason = {};
  for (const o of out) { (bySeason[o.season] ??= []).push(o); }
  const blk = (list) => ({ n: list.length, maeP50: r4(meanOf(list.map((o) => Math.abs(o.p50 - o.actual)))), level: r4(meanOf(list.map((o) => o.mean)) / meanOf(list.map((o) => o.actual))), coverage: r4(meanOf(list.map((o) => (o.actual >= o.p10 && o.actual <= o.p90 ? 1 : 0)))), width: r4(meanOf(list.map((o) => o.p90 - o.p10))), coverP25P75: r4(meanOf(list.map((o) => (o.actual >= o.p25 && o.actual <= o.p75 ? 1 : 0)))) });
  return { R, CV, ...blk(out), ece: r4(ece), linedN: lined.length, maeRolling4: r4(meanOf(lined.map((o) => Math.abs(o.line - o.actual)))), maeP50OnLined: r4(meanOf(lined.map((o) => Math.abs(o.p50 - o.actual)))), attemptsMaeVsActual: r4(meanOf(out.map((o) => Math.abs(o.attMean - o.actualAtt)))), bySeason: Object.fromEntries(Object.entries(bySeason).map(([k, v]) => [k, blk(v)])) };
}
const results = [];
for (const R of GRID.R) for (const CV of GRID.CV) results.push(evaluate(R, CV));
const bars = { maeBeatsRolling4: "maeP50OnLined < maeRolling4", maeBeatsEstimate: "maeP50 < 65.3 (the live ESTIMATE's dev MAE, design note)", coverageBand: [0.72, 0.88], eceMax: 0.05, levelBand: [0.92, 1.08], minimumN: 300 };
const verdicts = results.map((r) => ({ R: r.R, CV: r.CV, maeBeatsRolling4: r.maeP50OnLined < r.maeRolling4, maeBeatsEstimate: r.maeP50 < 65.3, coverageOk: r.coverage >= 0.72 && r.coverage <= 0.88, eceOk: r.ece <= 0.05, levelOk: r.level >= 0.92 && r.level <= 1.08, nOk: r.n >= 300 }));
const report = { schemaVersion: 1, artifact: "nfl-passing-yards-decomposed-dev", dataClass: "PRIVATE_RESEARCH", program: "318", generatedAt: new Date().toISOString(), status: "DEV_ONLY — seasons 2022–2025 of player-games-v1; no registration, no held-out or forward look", constants: { HL, SD, PRIOR_TEAM, PRIOR_YPA, MIN_SHARE, DRAWS, GRID }, population: { devTeamGames: ordered.filter((g) => g.season >= DEV[0]).length, scored: scored.length, voids, teamGamesWithoutCandidate: candidatesNoQb }, bars, results, verdicts };
fs.mkdirSync(path.dirname(rel(OUT)), { recursive: true });
fs.writeFileSync(rel(OUT), JSON.stringify(report, null, 2) + "\n");
console.log("population", JSON.stringify(report.population));
for (const r of results) console.log(`R ${r.R} CV ${r.CV}: n ${r.n} MAE p50 ${r.maeP50} (lined ${r.maeP50OnLined} vs rolling-4 ${r.maeRolling4}) level ${r.level} cov80 ${r.coverage} width ${r.width} cov50 ${r.coverP25P75} ECE ${r.ece} (n ${r.linedN}) att-MAE ${r.attemptsMaeVsActual}`);
console.log("by season (R25 CV0.3):", JSON.stringify(results.find((r) => r.R === 25 && r.CV === 0.3).bySeason));
