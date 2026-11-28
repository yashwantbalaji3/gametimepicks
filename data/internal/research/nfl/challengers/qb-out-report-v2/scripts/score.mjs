#!/usr/bin/env node
/**
 * Scorer for qb-out-report-elo-shift-v2 (arm A) and qb-out-report-quality-shift-v2 (arm B).
 * Registration: ../PREREGISTRATION.md (sha256 in PREREGISTRATION.md.sha256; refuses on mismatch).
 * Incumbent: the PRODUCTION replay (replayWinMarginHeads + winMarginGate), imported read-only from the worktree.
 * Usage: node score.mjs  (reads ../results/features.json from build_features.py; writes ../results/evaluation.json)
 */
import fs from "node:fs";
import crypto from "node:crypto";

const WT = "/Users/yashwantbalaji/Downloads/gametimepicks/.claude/worktrees/gametimepicks-program-director-e36970";
const RAW = "/Users/yashwantbalaji/Downloads/gametimepicks/data/internal/research/nfl/raw/nflverse";
const QB = "/Users/yashwantbalaji/gtp-evidence/nfl-markets-20261115/qb";
const { replayWinMarginHeads, winMarginGate } = await import(`${WT}/app/src/lib/sports/nfl/win-margin-heads.mjs`);

const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const refuse = (w) => { console.error(`REFUSED: ${w}`); process.exit(1); };
if (sha(`${QB}/PREREGISTRATION.md`) !== fs.readFileSync(`${QB}/PREREGISTRATION.md.sha256`, "utf8").split(/\s+/)[0]) refuse("preregistration hash mismatch");
const PINS = {
  [`${RAW}/games.csv`]: "cf8632c85fdc82c8915c7866d0bd16465a88946052bccfbf83b44bee87d5d65e",
  [`${WT}/app/src/lib/sports/nfl/win-margin-heads.mjs`]: "6baf596694456e256081a35bccb95f0476fc4a359e6c09ea6c04e1d31fffa92e",
  [`${WT}/data/internal/research/nfl/reports/win-margin-historical-replay-evaluation.json`]: "ec17e1837bb9d8018cdbc2a6fb365903fafcc910683d39405b9f3378c1809166",
};
for (const [p, h] of Object.entries(PINS)) if (sha(p) !== h) refuse(`pin mismatch ${p}`);

const wmPrereg = JSON.parse(fs.readFileSync(`${WT}/data/internal/research/nfl/reports/win-margin-historical-replay-preregistration.json`, "utf8"));
const gate = winMarginGate(JSON.parse(fs.readFileSync(`${WT}/data/internal/research/nfl/reports/win-margin-historical-replay-evaluation.json`, "utf8")), wmPrereg);
if (gate.win.state !== "READY" || gate.margin.state !== "READY") refuse("incumbent heads not READY");
const franchise = (t) => gate.frozen.franchiseMap[t] ?? t;

// games.csv — same parse as the ceiling scorer
function parseCsvLine(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur); return out;
}
const lines = fs.readFileSync(`${RAW}/games.csv`, "utf8").replace(/\r/g, "").trim().split("\n");
const header = parseCsvLine(lines[0]); const col = Object.fromEntries(header.map((h, i) => [h, i]));
const FOLD_FROM = wmPrereg.frozen.seasons.warmup[0];
const games = [];
for (const line of lines.slice(1)) {
  const r = parseCsvLine(line); if (r.length !== header.length) continue;
  const season = Number(r[col.season]); if (season < FOLD_FROM || season > 2025) continue;
  if (r[col.home_score] === "" || r[col.away_score] === "") continue;
  const ml = (v) => (v === "" ? null : Number(v));
  games.push({ gameId: r[col.game_id], season, date: r[col.gameday], home: franchise(r[col.home_team]), away: franchise(r[col.away_team]),
    neutral: r[col.location] === "Neutral", homeScore: Number(r[col.home_score]), awayScore: Number(r[col.away_score]),
    week: Number(r[col.week]), gameType: r[col.game_type], mlHome: ml(r[col.home_moneyline]), mlAway: ml(r[col.away_moneyline]) });
}
const pre = new Map();
replayWinMarginHeads({ games, gate, onGame: (g, x) => pre.set(g.gameId, x) });

const feat = JSON.parse(fs.readFileSync(`${QB}/results/features.json`, "utf8"));
const fById = new Map(feat.games.map((g) => [g.gameId, g]));

const clamp = (p) => Math.min(1 - 1e-9, Math.max(1e-9, p));
const ll = (p, y) => -(y * Math.log(clamp(p)) + (1 - y) * Math.log(1 - clamp(p)));
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const dOf = (p) => -400 * Math.log10(1 / clamp(p) - 1);
const pOf = (d) => 1 / (1 + 10 ** (-d / 400));
const amer = (m) => (m > 0 ? 100 / (m + 100) : -m / (-m + 100));
const noVig = (g) => (g.mlHome == null || g.mlAway == null ? null : amer(g.mlHome) / (amer(g.mlHome) + amer(g.mlAway)));
function ece(ps, ys, bins = 10) {
  const b = Array.from({ length: bins }, () => ({ n: 0, p: 0, y: 0 }));
  ps.forEach((p, i) => { const k = b[Math.min(bins - 1, Math.floor(p * bins))]; k.n += 1; k.p += p; k.y += ys[i]; });
  return b.reduce((s, k) => s + (k.n ? (k.n / ps.length) * Math.abs(k.p / k.n - k.y / k.n) : 0), 0);
}
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function bootCI(ds) {
  if (!ds.length) return null;
  const rand = mulberry32(20261115); const means = [];
  for (let b = 0; b < 10000; b += 1) { let s = 0; for (let i = 0; i < ds.length; i += 1) s += ds[Math.floor(rand() * ds.length)]; means.push(s / ds.length); }
  means.sort((x, y) => x - y);
  return [means[Math.floor(0.025 * 9999)], means[Math.floor(0.975 * 9999)]];
}

const rows = [];
let missingFeat = 0;
for (const g of games) {
  if (g.season < 2022) continue;
  const x = pre.get(g.gameId); if (!x || x.pHome == null || x.marginMean == null) continue;
  const f = fById.get(g.gameId); if (!f) { missingFeat += 1; continue; }
  if (f.flagHome === null || f.flagAway === null) continue; // UNKNOWN primary
  rows.push({ gameId: g.gameId, season: g.season, week: g.week, gameType: g.gameType, pHome: x.pHome, marginMean: x.marginMean,
    y: g.homeScore === g.awayScore ? null : g.homeScore > g.awayScore ? 1 : 0, margin: g.homeScore - g.awayScore, market: noVig(g),
    flagHome: f.flagHome, flagAway: f.flagAway, net: f.flagAway - f.flagHome,
    qnet: f.flagAway * f.gapAway - f.flagHome * f.gapHome });
}

const fitA = (rs) => { const d = rs.filter((r) => r.y !== null && r.net !== 0); let best = 0, bl = Infinity;
  for (let s = -200; s <= 200; s += 5) { const v = avg(d.map((r) => ll(pOf(dOf(r.pHome) + s * r.net), r.y))); if (v < bl) { bl = v; best = s; } }
  return { shift: best, n: d.length, logLossAtFit: bl }; };
const fitB = (rs) => { const d = rs.filter((r) => r.y !== null && r.qnet !== 0); let best = 0, bl = Infinity;
  for (let k = 0; k <= 2000; k += 25) { const v = avg(d.map((r) => ll(pOf(dOf(r.pHome) + k * r.qnet), r.y))); if (v < bl) { bl = v; best = k; } }
  return { k: best, n: d.length, logLossAtFit: bl }; };

const fits = {};
for (const S of [2023, 2024, 2025]) { const prior = rows.filter((r) => r.season < S); fits[S] = { A: fitA(prior), B: fitB(prior) }; }
const applyFit = fitA(rows.filter((r) => r.season <= 2024)); // latest leakage-proven fit (2022-2024)
const applyFitB = fitB(rows.filter((r) => r.season <= 2024));

for (const r of rows) {
  if (r.season < 2023) continue;
  const f = fits[r.season];
  r.shiftA = f.A.shift * r.net; r.shiftB = f.B.k * r.qnet;
  r.A_p = pOf(dOf(r.pHome) + r.shiftA); r.B_p = pOf(dOf(r.pHome) + r.shiftB);
  r.A_mm = gate.margin.slope * (r.marginMean / gate.margin.slope + r.shiftA);
  r.B_mm = gate.margin.slope * (r.marginMean / gate.margin.slope + r.shiftB);
}

function table(rs, C) {
  const dec = rs.filter((r) => r.y !== null); const ys = dec.map((r) => r.y);
  const ds = dec.map((r) => ll(r[`${C}_p`], r.y) - ll(r.pHome, r.y));
  const mk = dec.filter((r) => r.market != null);
  return {
    games: rs.length, decisive: dec.length, seasonClusters: new Set(rs.map((r) => r.season)).size,
    incumbent: { logLoss: avg(dec.map((r) => ll(r.pHome, r.y))), brier: avg(dec.map((r) => (r.pHome - r.y) ** 2)), ece: ece(dec.map((r) => r.pHome), ys), marginMae: avg(rs.map((r) => Math.abs(r.margin - r.marginMean))) },
    candidate: { logLoss: avg(dec.map((r) => ll(r[`${C}_p`], r.y))), brier: avg(dec.map((r) => (r[`${C}_p`] - r.y) ** 2)), ece: ece(dec.map((r) => r[`${C}_p`]), ys), marginMae: avg(rs.map((r) => Math.abs(r.margin - r[`${C}_mm`]))) },
    deltaLogLoss: avg(ds), deltaLogLossCI95: bootCI(ds),
    marketBenchmark: mk.length ? { n: mk.length, marketLogLoss: avg(mk.map((r) => ll(r.market, r.y))), incumbentLogLoss: avg(mk.map((r) => ll(r.pHome, r.y))), candidateLogLoss: avg(mk.map((r) => ll(r[`${C}_p`], r.y))) } : null,
  };
}
const sub = (rs) => rs.filter((r) => r.flagHome || r.flagAway);
const oneSided = (rs) => rs.filter((r) => r.net !== 0);
const noW18 = (rs) => rs.filter((r) => !(r.gameType === "REG" && r.week === 18));
function block(rs) {
  const o = {};
  for (const C of ["A", "B"]) {
    o[C] = { overall: table(rs, C), subgroupAnyFlag: table(sub(rs), C), subgroupOneSided: table(oneSided(rs), C),
      excludingWeek18: { overall: table(noW18(rs), C), subgroupAnyFlag: table(sub(noW18(rs)), C) },
      bySeason: Object.fromEntries([...new Set(rs.map((r) => r.season))].map((s) => [s, { overall: table(rs.filter((r) => r.season === s), C), subgroupAnyFlag: table(sub(rs.filter((r) => r.season === s)), C) }])) };
    const t = o[C];
    t.bars = {
      subgroupCIExcludesZero: { required: "subgroup Δlog loss 95% CI upper < 0", got: t.subgroupAnyFlag.deltaLogLossCI95, pass: t.subgroupAnyFlag.deltaLogLossCI95[1] < 0 },
      overallNotWorse: { required: "overall Δlog loss point ≤ 0", got: t.overall.deltaLogLoss, pass: t.overall.deltaLogLoss <= 0 },
    };
    t.verdict = Object.values(t.bars).every((b) => b.pass) ? "PASSES_PREREGISTERED_BARS" : "FAILS";
  }
  return o;
}
const primary = rows.filter((r) => r.season === 2023 || r.season === 2024);
const desc2025 = rows.filter((r) => r.season === 2025);
const evaluation = {
  artifact: "qb-out-report-v2-evaluation", dataClass: "PRIVATE_RESEARCH", generatedAt: new Date().toISOString(),
  preregistrationSha256: fs.readFileSync(`${QB}/PREREGISTRATION.md.sha256`, "utf8").split(/\s+/)[0],
  incumbent: { receipt: gate.win.receiptStamp, heads: ["nfl-win-elo-mov-v1", "nfl-margin-elo-hfa-v1"], via: "replayWinMarginHeads (production)" },
  population: { rows2022to2025: rows.length, missingFeatureRows: missingFeat },
  fits, applicationFit2022to2024: { A: applyFit, B: applyFitB }, league: feat.league,
  primary_2023_2024: block(primary),
  descriptive_2025_UNSTAMPED_NOT_LEAKAGE_PROVEN: block(desc2025),
  subgroupGames: primary.concat(desc2025).filter((r) => r.flagHome || r.flagAway).map((r) => ({ gameId: r.gameId, net: r.net, qnet: r.qnet, pHome: r.pHome, A_p: r.A_p, B_p: r.B_p, y: r.y, market: r.market })),
};
fs.writeFileSync(`${QB}/results/evaluation.json`, `${JSON.stringify(evaluation, null, 1)}\n`);
const f5 = (x) => (x == null ? "null" : x.toFixed(5));
console.log("fits", JSON.stringify(fits), "apply", JSON.stringify({ A: applyFit, B: applyFitB }));
for (const [lab, b] of [["PRIMARY 2023-2024", evaluation.primary_2023_2024], ["DESCRIPTIVE 2025 (unstamped)", evaluation.descriptive_2025_UNSTAMPED_NOT_LEAKAGE_PROVEN]]) {
  for (const C of ["A", "B"]) {
    console.log(`\n== ${lab} arm ${C}: ${b[C].verdict}`);
    for (const k of ["overall", "subgroupAnyFlag", "subgroupOneSided"]) {
      const t = b[C][k];
      console.log(`  ${k}: n=${t.games} dec=${t.decisive} LL ${f5(t.incumbent.logLoss)} -> ${f5(t.candidate.logLoss)} Δ ${f5(t.deltaLogLoss)} CI [${t.deltaLogLossCI95?.map(f5)}] Brier ${f5(t.incumbent.brier)}->${f5(t.candidate.brier)} ECE ${f5(t.incumbent.ece)}->${f5(t.candidate.ece)} MAE ${t.incumbent.marginMae.toFixed(3)}->${t.candidate.marginMae.toFixed(3)} mkt ${f5(t.marketBenchmark?.marketLogLoss)} (n=${t.marketBenchmark?.n})`);
    }
    const w = b[C].excludingWeek18;
    console.log(`  exclW18 overall Δ ${f5(w.overall.deltaLogLoss)} CI [${w.overall.deltaLogLossCI95?.map(f5)}]; subgroup n=${w.subgroupAnyFlag.games} Δ ${f5(w.subgroupAnyFlag.deltaLogLoss)} CI [${w.subgroupAnyFlag.deltaLogLossCI95?.map(f5)}]`);
    for (const [s, v] of Object.entries(b[C].bySeason)) console.log(`  ${s}: overall Δ ${f5(v.overall.deltaLogLoss)}; subgroup n=${v.subgroupAnyFlag.games} Δ ${f5(v.subgroupAnyFlag.deltaLogLoss)}`);
  }
}
