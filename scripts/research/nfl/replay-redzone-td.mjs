#!/usr/bin/env node
/**
 * NFL-004 — RED-ZONE TD SHARE, DEVELOPMENT LOOK (second look at 2014–2021, disclosed).
 *
 * Executes data/internal/research/nfl/reports/nfl-004-redzone-td-preregistration.json. The engine is P301's
 * replay-anytime-td.mjs (walk-forward, gate, team TD form, league constants from the 2013 warm-up, clip, metrics —
 * copied verbatim, constants read from P301's own preregistration). The incumbent opportunityTd is recomputed in-run
 * and must reproduce P301's held-out log loss, or the run refuses.
 *
 * rzTdV1 replaces the incumbent's overall share × TD-rate factor with an inside-N share (play-by-play red-zone
 * carries/targets, player-redzone-v1) shrunk toward the overall share with strength k, then applies the NFL-003
 * active-set reallocation (rho) with a 0.02 OTHER floor.
 *
 *   --validate            DEV seasons only (2022–2025): grid selection and dev metrics.
 *   --score --now <ISO>   the one development look at 2014–2021 (refuses unless the registration is committed and
 *                         unmodified, and if the output exists).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const PREREG_PATH = "data/internal/research/nfl/reports/nfl-004-redzone-td-preregistration.json";
const OUT_PATH = "data/internal/research/nfl/reports/nfl-004-redzone-td-development.json";
const P301_PREREG = "data/internal/research/nfl/reports/anytime-td-historical-replay-preregistration.json";
const P301_RECEIPT = "data/internal/research/nfl/reports/anytime-td-historical-replay-evaluation.json";
const TABLE_PATH = "data/internal/research/nfl/replay/player-games-v2.json.gz";
const RZ_PATH = "data/internal/research/nfl/replay/player-redzone-v1.json.gz";

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
const F = JSON.parse(fs.readFileSync(rel(P301_PREREG), "utf8")).frozen;
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(rel(p))).digest("hex");
if (sha(TABLE_PATH) !== G.inputs.playerGamesSha256) refuse("player-games-v2 does not match the registered hash");
if (sha(RZ_PATH) !== G.inputs.redZoneSha256) refuse("player-redzone-v1 does not match the registered hash");
if (sha("scripts/research/nfl/build-player-redzone-v1.mjs") !== G.inputs.redZoneBuilderSha256) refuse("the red-zone builder changed since registration");
if (sha("scripts/research/nfl/replay-anytime-td.mjs") !== G.inputs.p301EngineSha256) refuse("the P301 engine changed since registration");

const table = JSON.parse(zlib.gunzipSync(fs.readFileSync(rel(TABLE_PATH))));
const C = Object.fromEntries(table.columns.map((c, i) => [c, i]));
const rzDoc = JSON.parse(zlib.gunzipSync(fs.readFileSync(rel(RZ_PATH))));
const RZC = Object.fromEntries(rzDoc.columns.map((c, i) => [c, i]));
const rzRow = new Map(rzDoc.rows.map((r) => [`${r[0]}|${r[1]}|${r[2]}`, r]));
const RZ_IDX = { 20: { c: "c20", t: "t20" }, 10: { c: "c10", t: "t10" }, 5: { c: "c5", t: "t5" } };
const RZ_TEAM_IDX = Object.fromEntries(rzDoc.teamTotalsColumns.map((c, i) => [c, i]));
const inSeasons = (s, [a, b]) => s >= a && s <= b;

// ── P301 constants and estimators (verbatim) ───────────────────────────────────────────────────────
const warm = table.rows.filter((r) => inSeasons(r[C.season], F.seasons.warmup) && r[C.participation] !== "UNKNOWN");
const sum = (rows, f) => rows.reduce((a, r) => a + f(r), 0);
const warmTeamGames = Object.entries(table.teamTotals).filter(([k]) => Number(k.slice(0, 4)) >= F.seasons.warmup[0] && Number(k.slice(0, 4)) <= F.seasons.warmup[1]).map(([, v]) => v);
const anyTd = (r) => (r[C.rushTd] + r[C.recTd] + r[C.otherTd] > 0 ? 1 : 0);
const touched = warm.filter((r) => r[C.carries] + r[C.targets] > 0);
const LEAGUE = {
  rushTdPerCarry: sum(warm, (r) => r[C.rushTd]) / sum(warm, (r) => r[C.carries]),
  recTdPerTarget: sum(warm, (r) => r[C.recTd]) / sum(warm, (r) => r[C.targets]),
  teamRushTd: sum(warmTeamGames, (v) => v[3]) / warmTeamGames.length,
  teamRecTd: sum(warmTeamGames, (v) => v[4]) / warmTeamGames.length,
  otherTdPerPlayerGame: sum(touched, (r) => r[C.otherTd]) / touched.length,
  anytimeRate: sum(touched, anyTd) / touched.length,
};
const weight = (idxNow, idx, seasonNow, season, hl, bd) => 0.5 ** ((idxNow - idx) / hl) * bd ** Math.max(0, seasonNow - season);
function share(st, fam, season, shrinkK) {
  let num = 0;
  let den = 0;
  for (const o of st.obs[fam]) { const w = weight(st.games, o.idx, season, o.season, F.share.halfLifeGames, F.share.boundaryDecay); num += w * o.share; den += w; }
  return den > 0 ? num / (den + shrinkK) : 0;
}
function shrunkRate(st, key, league, season, priorTrials) {
  let num = 0;
  let den = 0;
  for (const o of st.rates[key]) { const w = weight(st.games, o.idx, season, o.season, F.rate.halfLifeGames, F.rate.boundaryDecay); num += w * o.num; den += w * o.den; }
  return (num + priorTrials * league) / (den + priorTrials);
}
const clip = (p) => Math.min(1 - F.probabilityClip, Math.max(F.probabilityClip, p));
const poissonAny = (mu) => clip(1 - Math.exp(-mu));

/** Red-zone share: (Σ w·num + k·overall) / (Σ w·den + k), with P301's share weights. */
function rzShare(st, kind, N, k, overall, season) {
  let num = 0;
  let den = 0;
  for (const o of st.rz[kind][N]) { const w = weight(st.games, o.idx, season, o.season, F.share.halfLifeGames, F.share.boundaryDecay); num += w * o.num; den += w * o.den; }
  return (num + k * overall) / (den + k);
}
function reallocate(s, a, v, rho, floor = G.otherFloor) {
  if (!(a > 0)) return s;
  const named = a + rho * v;
  return s * (named / a) * Math.min(1, (1 - floor) / named);
}
const COMBOS = G.insideNGrid.flatMap((N) => G.kGrid.map((k) => ({ N, k, id: `${N}|${k}` })));

// ── walk-forward ───────────────────────────────────────────────────────────────────────────────────
const players = new Map();
const byTeam = new Map();
const teamForm = new Map();
const ST = (id) => {
  if (!players.has(id)) players.set(id, { team: null, games: 0, obs: { rush: [], targets: [], td: [] }, rates: { rushTd: [], recTd: [] }, rz: { c: { 20: [], 10: [], 5: [] }, t: { 20: [], 10: [], 5: [] } } });
  return players.get(id);
};
function teamTd(team, season) {
  const t = teamForm.get(team);
  if (!t) return { rush: LEAGUE.teamRushTd, rec: LEAGUE.teamRecTd };
  const bd = F.teamForm.boundaryDecay ** Math.max(0, season - t.season);
  return { rush: LEAGUE.teamRushTd + (t.rush - LEAGUE.teamRushTd) * bd, rec: LEAGUE.teamRecTd + (t.rec - LEAGUE.teamRecTd) * bd };
}
function foldTeam(team, season, totals) {
  const alpha = 1 - 0.5 ** (1 / F.teamForm.halfLifeGames);
  const cur = teamTd(team, season);
  teamForm.set(team, { rush: cur.rush + alpha * (totals[3] - cur.rush), rec: cur.rec + alpha * (totals[4] - cur.rec), season });
}

const rows = [...table.rows].sort((a, b) => (a[C.date] !== b[C.date] ? (a[C.date] < b[C.date] ? -1 : 1) : a[C.gameId] < b[C.gameId] ? -1 : a[C.gameId] > b[C.gameId] ? 1 : 0));
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
      if (!tgs.has(k)) tgs.set(k, { gameId: r[C.gameId], team: r[C.team], rows: new Map() });
      tgs.get(k).rows.set(String(r[C.playerId]), r);
    }
    for (const tg of tgs.values()) {
      const lam = teamTd(tg.team, season);
      // pools for reallocation: overall shares and every (N, k) red-zone share, active vs vacated
      const members = [...(byTeam.get(tg.team) ?? [])].map((id) => {
        const st = players.get(id);
        const cs = share(st, "rush", season, 0);
        const ts = share(st, "targets", season, 0);
        const rz = {};
        for (const c of COMBOS) rz[c.id] = { c: rzShare(st, "c", c.N, c.k, cs, season), t: rzShare(st, "t", c.N, c.k, ts, season) };
        return { id, st, active: tg.rows.has(id), cs, ts, rz };
      });
      const pool = { overall: { c: { a: 0, v: 0 }, t: { a: 0, v: 0 } } };
      for (const c of COMBOS) pool[c.id] = { c: { a: 0, v: 0 }, t: { a: 0, v: 0 } };
      for (const m of members) {
        const side = m.active ? "a" : "v";
        pool.overall.c[side] += m.cs; pool.overall.t[side] += m.ts;
        for (const c of COMBOS) { pool[c.id].c[side] += m.rz[c.id].c; pool[c.id].t[side] += m.rz[c.id].t; }
      }
      for (const m of members) {
        if (m.cs < F.gate.carryShare && m.ts < F.gate.targetShare) continue;
        const row = tg.rows.get(m.id) ?? null;
        if (!row || row[C.participation] === "UNKNOWN") continue;
        const effRush = shrunkRate(m.st, "rushTd", LEAGUE.rushTdPerCarry, season, F.opportunityTd.rushPriorCarries) / LEAGUE.rushTdPerCarry;
        const effRec = shrunkRate(m.st, "recTd", LEAGUE.recTdPerTarget, season, F.opportunityTd.recPriorTargets) / LEAGUE.recTdPerTarget;
        scored.push({
          season, key: `${tg.gameId}|${tg.team}`, rowKey: `${tg.gameId}|${tg.team}|${m.id}`, y: anyTd(row), lam,
          cs: m.cs, ts: m.ts, effRush, effRec, rz: m.rz, pool,
          incumbent: poissonAny(m.cs * lam.rush * effRush + m.ts * lam.rec * effRec + LEAGUE.otherTdPerPlayerGame),
        });
      }
    }
  }
  const folded = new Set();
  for (const r of day) {
    if (r[C.participation] === "UNKNOWN") continue;
    const id = String(r[C.playerId]);
    const st = ST(id);
    const totals = table.teamTotals[`${r[C.gameId]}|${r[C.team]}`] ?? [0, 0, 0, 0, 0];
    if (st.team !== r[C.team]) {
      if (st.team) byTeam.get(st.team)?.delete(id);
      st.obs = { rush: [], targets: [], td: [] };
      st.rz = { c: { 20: [], 10: [], 5: [] }, t: { 20: [], 10: [], 5: [] } };
      st.team = r[C.team];
      if (!byTeam.has(st.team)) byTeam.set(st.team, new Set());
      byTeam.get(st.team).add(id);
    }
    const idx = st.games + 1;
    st.obs.rush.push({ share: totals[1] > 0 ? r[C.carries] / totals[1] : 0, idx, season: r[C.season] });
    st.obs.targets.push({ share: totals[2] > 0 ? r[C.targets] / totals[2] : 0, idx, season: r[C.season] });
    const teamScorerTd = totals[3] + totals[4];
    if (teamScorerTd > 0) st.obs.td.push({ share: (r[C.rushTd] + r[C.recTd]) / teamScorerTd, idx, season: r[C.season] });
    if (r[C.carries] > 0) st.rates.rushTd.push({ num: r[C.rushTd], den: r[C.carries], idx, season: r[C.season] });
    if (r[C.targets] > 0) st.rates.recTd.push({ num: r[C.recTd], den: r[C.targets], idx, season: r[C.season] });
    const pr = rzRow.get(`${r[C.gameId]}|${r[C.team]}|${id}`);
    const tt = rzDoc.teamTotals[`${r[C.gameId]}|${r[C.team]}`];
    for (const N of G.insideNGrid) {
      const tc = tt ? tt[RZ_TEAM_IDX[RZ_IDX[N].c]] : 0;
      const tT = tt ? tt[RZ_TEAM_IDX[RZ_IDX[N].t]] : 0;
      if (tc > 0) st.rz.c[N].push({ num: pr ? pr[RZC[RZ_IDX[N].c]] : 0, den: tc, idx, season: r[C.season] });
      if (tT > 0) st.rz.t[N].push({ num: pr ? pr[RZC[RZ_IDX[N].t]] : 0, den: tT, idx, season: r[C.season] });
    }
    st.games = idx;
    const tk = `${r[C.gameId]}|${r[C.team]}`;
    if (!folded.has(tk)) { folded.add(tk); foldTeam(r[C.team], r[C.season], totals); }
  }
  i = j;
}

// ── models ─────────────────────────────────────────────────────────────────────────────────────────
function pRz(x, combo, rho) {
  const p = x.pool[combo];
  const c = reallocate(x.rz[combo].c, p.c.a, p.c.v, rho);
  const t = reallocate(x.rz[combo].t, p.t.a, p.t.v, rho);
  return poissonAny(c * x.lam.rush + t * x.lam.rec + LEAGUE.otherTdPerPlayerGame);
}
function pIncRealloc(x, rho) {
  const p = x.pool.overall;
  const c = reallocate(x.cs, p.c.a, p.c.v, rho);
  const t = reallocate(x.ts, p.t.a, p.t.v, rho);
  return poissonAny(c * x.lam.rush * x.effRush + t * x.lam.rec * x.effRec + LEAGUE.otherTdPerPlayerGame);
}
const isDev = (s) => inSeasons(s.season, F.seasons.dev);
const ll = (p, y) => -(y ? Math.log(p) : Math.log(1 - p));
const devRows = scored.filter(isDev);
const grid = [];
for (const c of COMBOS) for (const rho of G.rhoGrid) grid.push({ combo: c.id, N: c.N, k: c.k, rho, devLogLoss: devRows.reduce((a, x) => a + ll(pRz(x, c.id, rho), x.y), 0) / devRows.length });
const best = [...grid].sort((a, b) => a.devLogLoss - b.devLogLoss)[0];
const rho0 = [...grid].filter((g) => g.rho === 0).sort((a, b) => a.devLogLoss - b.devLogLoss)[0];
const incRhoTrace = G.rhoGrid.map((rho) => ({ rho, devLogLoss: devRows.reduce((a, x) => a + ll(pIncRealloc(x, rho), x.y), 0) / devRows.length }));
const MODEL = {
  incumbent: (x) => x.incumbent,
  rzTdV1: (x) => pRz(x, best.combo, best.rho),
  rzNoRealloc: (x) => pRz(x, rho0.combo, 0),
  opportunityTdRealloc: (x) => pIncRealloc(x, best.rho),
};
function metrics(list, m) {
  if (MODE === "validate" && list.some((x) => !isDev(x))) throw new Error("a non-dev row reached a metric in --validate");
  const n = list.length;
  let L = 0; let br = 0; let sp = 0; let sy = 0;
  const bins = Array.from({ length: F.bars.eceBins }, () => ({ n: 0, p: 0, y: 0 }));
  const ps = [];
  for (const x of list) {
    const p = MODEL[m](x);
    ps.push([p, x.y]);
    L += ll(p, x.y); br += (p - x.y) ** 2; sp += p; sy += x.y;
    const b = bins[Math.min(F.bars.eceBins - 1, Math.floor(p * F.bars.eceBins))]; b.n += 1; b.p += p; b.y += x.y;
  }
  ps.sort((a, b) => b[0] - a[0]);
  const top = ps.slice(0, Math.max(1, Math.floor(ps.length / 10)));
  return {
    n, logLoss: L / n, brier: br / n, meanPredicted: sp / n, actualRate: sy / n, level: sy > 0 ? sp / sy : null,
    ece: bins.reduce((a, b) => a + (b.n ? (b.n / n) * Math.abs(b.p / b.n - b.y / b.n) : 0), 0),
    topDecile: { n: top.length, meanPredicted: top.reduce((a, t) => a + t[0], 0) / top.length, actualRate: top.reduce((a, t) => a + t[1], 0) / top.length },
    reliability: bins.filter((b) => b.n).map((b) => ({ n: b.n, meanPredicted: b.p / b.n, actualRate: b.y / b.n })),
  };
}
const r5 = (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(5)) : v);
const fmt = (m) => `n ${m.n} · LL ${m.logLoss.toFixed(5)} · ECE ${m.ece.toFixed(4)} · level ${m.level.toFixed(3)} · top10% ${m.topDecile.meanPredicted.toFixed(3)} vs ${m.topDecile.actualRate.toFixed(3)}`;

if (MODE === "validate") {
  console.log("selected:", JSON.stringify(best, r5), "best rho=0:", JSON.stringify(rho0, r5));
  console.log("grid (top 8):", JSON.stringify([...grid].sort((a, b) => a.devLogLoss - b.devLogLoss).slice(0, 8), r5));
  console.log("incumbent realloc rho trace:", JSON.stringify(incRhoTrace, r5));
  for (const m of Object.keys(MODEL)) console.log(`DEV ${m.padEnd(22)} ${fmt(metrics(devRows, m))}`);
  process.exit(0);
}

// ── --score ────────────────────────────────────────────────────────────────────────────────────────
const held = scored.filter((x) => inSeasons(x.season, G.seasons.development));
const p301 = JSON.parse(fs.readFileSync(rel(P301_RECEIPT), "utf8"));
const incHeld = metrics(held, "incumbent");
const checks = { incumbentLogLoss: { expected: p301.results.opportunityTd.overall.logLoss, observed: incHeld.logLoss, n: [p301.results.opportunityTd.overall.n, incHeld.n] } };
checks.incumbentLogLoss.pass = Math.abs(checks.incumbentLogLoss.expected - incHeld.logLoss) <= 1e-4 && incHeld.n === p301.results.opportunityTd.overall.n;
if (!checks.incumbentLogLoss.pass) { console.error(JSON.stringify(checks)); refuse("the recomputed incumbent does not reproduce P301"); }
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const seasons = [...new Set(held.map((x) => x.season))].sort();
const agg = new Map(seasons.map((s) => [s, { sum: 0, n: 0 }]));
for (const x of held) { const o = agg.get(x.season); o.sum += ll(MODEL.rzTdV1(x), x.y) - ll(x.incumbent, x.y); o.n += 1; }
const rand = mulberry32(G.bootstrap.seed);
const stats = [];
for (let b = 0; b < G.bootstrap.resamples; b += 1) { let s = 0; let n = 0; for (let k = 0; k < seasons.length; k += 1) { const o = agg.get(seasons[Math.floor(rand() * seasons.length)]); s += o.sum; n += o.n; } stats.push(s / n); }
stats.sort((a, b) => a - b);
const boot = { point: [...agg.values()].reduce((a, o) => a + o.sum, 0) / held.length, lo95: stats[Math.floor(0.025 * stats.length)], hi95: stats[Math.ceil(0.975 * stats.length) - 1] };
const eraLists = Object.fromEntries(G.eras.map(([a, b]) => [`${a}-${b}`, held.filter((x) => inSeasons(x.season, [a, b]))]));
const results = Object.fromEntries(Object.keys(MODEL).map((m) => [m, { overall: metrics(held, m), eras: Object.fromEntries(Object.entries(eraLists).map(([k, l]) => [k, metrics(l, m)])) }]));
const R = results.rzTdV1;
const I = results.incumbent;
const eras = Object.keys(eraLists);
const [lo, hi] = G.bars.levelBand;
const bars = {
  logLossBelowIncumbent: { pass: R.overall.logLoss < I.overall.logLoss && eras.every((e) => R.eras[e].logLoss < I.eras[e].logLoss), observed: { overall: [R.overall.logLoss, I.overall.logLoss], eras: Object.fromEntries(eras.map((e) => [e, [R.eras[e].logLoss, I.eras[e].logLoss]])) } },
  notNoise: { pass: boot.hi95 < 0, observed: boot },
  calibration: { pass: R.overall.ece <= G.bars.eceMax && eras.every((e) => R.eras[e].ece <= G.bars.eceEraMax), observed: { overall: R.overall.ece, eras: Object.fromEntries(eras.map((e) => [e, R.eras[e].ece])) } },
  level: { pass: R.overall.level >= lo && R.overall.level <= hi && eras.every((e) => R.eras[e].level >= lo && R.eras[e].level <= hi), observed: { overall: R.overall.level, eras: Object.fromEntries(eras.map((e) => [e, R.eras[e].level])) } },
  topDecile: { pass: Math.abs(R.overall.topDecile.meanPredicted - R.overall.topDecile.actualRate) <= Math.abs(I.overall.topDecile.meanPredicted - I.overall.topDecile.actualRate), observed: { rzTdV1: R.overall.topDecile, incumbent: I.overall.topDecile } },
};
const outcome = Object.values(bars).every((b) => b.pass) ? "PROCEED_TO_FORWARD" : "DO_NOT_PROCEED";
const receipt = {
  schemaVersion: 1,
  artifact: "nfl-004-redzone-td-development",
  dataClass: "PRIVATE_RESEARCH",
  evidenceTier: "SECOND_LOOK_DEVELOPMENT — 2014-2021 was scored blind by P301; not a blind result. Only the 2026 forward test can make the model eligible.",
  generatedAt: NOW,
  preregistration: { path: PREREG_PATH, commit: preregCommit },
  scriptSha256: sha("scripts/research/nfl/replay-redzone-td.mjs"),
  implementationChecks: checks,
  devSelection: { selected: best, bestWithoutRealloc: rho0, grid, incumbentReallocTrace: incRhoTrace },
  population: { development: G.seasons.development, scored: held.length, positives: held.reduce((a, x) => a + x.y, 0) },
  results,
  bars,
  outcome,
  consequence: "Nothing publishes from this receipt. PROCEED_TO_FORWARD earns a blind 2026 forward capture under the ATD forward protocol; only a forward pass supports a founder-approved promotion PR.",
};
fs.writeFileSync(rel(OUT_PATH), JSON.stringify(receipt, r5, 1), { flag: "wx" });
console.log(JSON.stringify(checks));
for (const m of Object.keys(MODEL)) console.log(`${m.padEnd(22)} ${fmt(results[m].overall)}`);
console.log(`bootstrap ${JSON.stringify(boot, r5)}\n→ ${outcome} · failed: ${Object.entries(bars).filter(([, b]) => !b.pass).map(([k]) => k).join(", ") || "none"}`);
