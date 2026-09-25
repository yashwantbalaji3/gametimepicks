#!/usr/bin/env node
/**
 * TEAM-LEVEL AVAILABILITY CEILING — WALK-FORWARD REPLAY
 *
 * Executes data/internal/research/nfl/reports/team-availability-ceiling-preregistration.json.
 *
 *   --validate            fit traces on the warmup season only; computes NO held-out metric.
 *   --score --now <ISO>   the ONE look. Refuses unless the registration is committed and unmodified,
 *                         and refuses if the evaluation file already exists.
 *
 * ⚠ THIS MEASURES A CEILING. It conditions on OBSERVED snaps, which nobody has at forecast time. It
 * therefore cannot measure an implementable feature — only the best a perfect availability oracle
 * could do. A ceiling that fails refuses the whole idea cheaply; a ceiling that clears is permission
 * to design the real pregame feature, nothing more.
 *
 * ⚠ AND IT SCORES THE PRODUCTION INCUMBENT, NOT A REIMPLEMENTATION. The win and margin numbers come
 * from replayWinMarginHeads in app/src/lib/sports/nfl/win-margin-heads.mjs — the same walk-forward
 * the published forecasts use, gated by the same receipt. The candidate is applied as a shift to the
 * rating difference that fold produced, so the two differ by the availability term and nothing else.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { replayWinMarginHeads, winMarginGate } from "../../../app/src/lib/sports/nfl/win-margin-heads.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const PREREG = "data/internal/research/nfl/reports/team-availability-ceiling-preregistration.json";
const OUT = "data/internal/research/nfl/reports/team-availability-ceiling-evaluation.json";
const GAMES = "data/internal/research/nfl/raw/nflverse/games.csv";
const WM_RECEIPT = "data/internal/research/nfl/reports/win-margin-historical-replay-evaluation.json";
const WM_PREREG = "data/internal/research/nfl/reports/win-margin-historical-replay-preregistration.json";

const argv = process.argv.slice(2);
const MODE = argv.includes("--score") ? "score" : argv.includes("--validate") ? "validate" : null;
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };
if (!MODE) refuse("usage: --validate | --score --now <ISO>");

const prereg = JSON.parse(fs.readFileSync(rel(PREREG), "utf8"));
const PIN = prereg.amendedBeforeAnyLook.inputPin.gamesCsvSha256;
const SCORED_SEASONS = [2023, 2024, 2025];
const WARMUP_SEASON = 2022;

// ── ONE LOOK, and the registration must be committed and unmodified ──────────────────────────────
if (MODE === "score") {
  if (!argOf("--now")) refuse("--score requires --now <ISO>");
  if (fs.existsSync(rel(OUT))) refuse(`${OUT} already exists — this registration permits ONE look`);
  const status = execFileSync("git", ["status", "--porcelain", "--", PREREG], { cwd: ROOT, encoding: "utf8" }).trim();
  if (status) refuse(`the registration has uncommitted changes (${status}) — it must be frozen before it is scored`);
}
const gamesBytes = fs.readFileSync(rel(GAMES));
if (crypto.createHash("sha256").update(gamesBytes).digest("hex") !== PIN) refuse("games.csv does not match the pinned hash");

// ── inputs ───────────────────────────────────────────────────────────────────────────────────────
function parseCsvLine(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur); return out;
}
const wmPrereg = JSON.parse(fs.readFileSync(rel(WM_PREREG), "utf8"));
const gate = winMarginGate(JSON.parse(fs.readFileSync(rel(WM_RECEIPT), "utf8")), wmPrereg);
if (gate.win.state !== "READY" || gate.margin.state !== "READY") refuse(`the incumbent heads are not READY (${gate.win.state}/${gate.margin.state})`);
const franchise = (t) => gate.frozen.franchiseMap[t] ?? t;

const lines = gamesBytes.toString("utf8").replace(/\r/g, "").trim().split("\n");
const header = parseCsvLine(lines[0]);
const col = Object.fromEntries(header.map((h, i) => [h, i]));
/* The fold needs history BEFORE the warmup season or every rating starts at the mean, so games are
   read from the same warmup the incumbent's own registration uses. Only 2023-2025 are ever scored. */
const FOLD_FROM = wmPrereg.frozen.seasons.warmup[0];
const games = [];
for (const line of lines.slice(1)) {
  const r = parseCsvLine(line);
  if (r.length !== header.length) continue;
  const season = Number(r[col.season]);
  if (season < FOLD_FROM || season > 2025) continue;
  if (r[col.home_score] === "" || r[col.away_score] === "") continue;
  const ml = (v) => (v === "" ? null : Number(v));
  games.push({
    gameId: r[col.game_id], season, date: r[col.gameday],
    home: franchise(r[col.home_team]), away: franchise(r[col.away_team]),
    neutral: r[col.location] === "Neutral",
    homeScore: Number(r[col.home_score]), awayScore: Number(r[col.away_score]),
    week: Number(r[col.week]), gameType: r[col.game_type],
    mlHome: ml(r[col.home_moneyline]), mlAway: ml(r[col.away_moneyline]),
  });
}

// ── the feature: did the club's primary quarterback take a snap? ─────────────────────────────────
const qbRows = [];
for (const y of [2022, 2023, 2024, 2025]) {
  const f = rel(`data/internal/research/nfl/nflverse/participation-${y}.jsonl`);
  if (!fs.existsSync(f)) refuse(`participation-${y}.jsonl missing`);
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (r.position === "QB") qbRows.push(r);
  }
}
const seasonTotals = new Map();
for (const r of qbRows) {
  const k = `${r.season}|${r.team}`;
  const m = seasonTotals.get(k) ?? new Map();
  m.set(r.gsisId, (m.get(r.gsisId) ?? 0) + (r.offenseSnaps ?? 0));
  seasonTotals.set(k, m);
}
const primaryQb = new Map();
for (const [k, m] of seasonTotals) { let best = null, bv = -1; for (const [id, v] of m) if (v > bv) { bv = v; best = id; } primaryQb.set(k, best); }
const playedInGame = new Map();
for (const r of qbRows) {
  const k = `${r.season}|${r.team}|${r.gameId}`;
  const s = playedInGame.get(k) ?? new Set();
  if ((r.offenseSnaps ?? 0) > 0) s.add(r.gsisId);
  playedInGame.set(k, s);
}
/** nflverse gameId is `{season}_{week:02}_{away}_{home}` — the same key the participation rows use. */
const gidOf = (g) => `${g.season}_${String(g.week).padStart(2, "0")}_${g.away}_${g.home}`;
function qbAbsent(g, side) {
  const team = side === "home" ? g.home : g.away;
  const p = primaryQb.get(`${g.season}|${team}`);
  if (!p) return null;                                  // no QB data for this club-season: UNKNOWN, never false
  const played = playedInGame.get(`${g.season}|${team}|${gidOf(g)}`);
  if (!played) return null;
  return !played.has(p);
}

// ── metrics, mirroring the incumbent's registration ──────────────────────────────────────────────
const clamp = (p) => Math.min(1 - 1e-9, Math.max(1e-9, p));
const ll = (p, y) => -(y * Math.log(clamp(p)) + (1 - y) * Math.log(1 - clamp(p)));
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const dOf = (p) => -400 * Math.log10(1 / clamp(p) - 1);
const pOf = (d) => 1 / (1 + 10 ** (-d / 400));
function eceOf(ps, ys, bins = 10) {
  const b = Array.from({ length: bins }, () => ({ n: 0, p: 0, y: 0 }));
  ps.forEach((p, i) => { const k = b[Math.min(bins - 1, Math.floor(p * bins))]; k.n += 1; k.p += p; k.y += ys[i]; });
  return b.reduce((s, k) => s + (k.n ? (k.n / ps.length) * Math.abs(k.p / k.n - k.y / k.n) : 0), 0);
}
const amer = (m) => (m > 0 ? 100 / (m + 100) : -m / (-m + 100));
function noVigHome(g) {
  if (g.mlHome == null || g.mlAway == null) return null;
  const h = amer(g.mlHome), a = amer(g.mlAway);
  return h + a > 0 ? h / (h + a) : null;
}
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Season-block bootstrap of mean(candidate − incumbent) log loss. */
function bootstrapUpper95(rows) {
  const bySeason = new Map();
  for (const r of rows) { const a = bySeason.get(r.season) ?? []; a.push(r.dLL); bySeason.set(r.season, a); }
  const blocks = [...bySeason.values()];
  const rand = mulberry32(20260925);
  const means = [];
  for (let b = 0; b < 2000; b += 1) {
    const pick = [];
    for (let i = 0; i < blocks.length; i += 1) pick.push(...blocks[Math.floor(rand() * blocks.length)]);
    means.push(avg(pick));
  }
  means.sort((x, y) => x - y);
  return means[Math.floor(0.95 * (means.length - 1))];
}

// ── replay the incumbent, then apply the candidate to its rating difference ──────────────────────
const pre = new Map();
replayWinMarginHeads({ games, gate, onGame: (g, x) => pre.set(g.gameId, x) });

/** All scoreable rows, with the incumbent's pre-game numbers and the availability indicator. */
const all = [];
for (const g of games) {
  if (g.season < WARMUP_SEASON) continue;
  const x = pre.get(g.gameId);
  if (!x || x.pHome == null || x.marginMean == null) continue;
  const hAbs = qbAbsent(g, "home");
  const aAbs = qbAbsent(g, "away");
  if (hAbs === null || aAbs === null) continue;         // UNKNOWN is excluded, never treated as present
  all.push({
    gameId: g.gameId, season: g.season, week: g.week, gameType: g.gameType,
    pHome: x.pHome, marginMean: x.marginMean,
    y: g.homeScore === g.awayScore ? null : (g.homeScore > g.awayScore ? 1 : 0),
    margin: g.homeScore - g.awayScore,
    hAbs, aAbs, net: (aAbs ? 1 : 0) - (hAbs ? 1 : 0),   // +1 favours home
    market: noVigHome(g),
  });
}

/** Fit one rating shift on the given rows by minimising log loss over a declared grid. */
function fitShift(rows) {
  const decisive = rows.filter((r) => r.y !== null && r.net !== 0);
  if (!decisive.length) return { shift: 0, n: 0, note: "no games with a one-sided absence to fit on" };
  let best = 0, bestLL = Infinity;
  for (let s = -200; s <= 200; s += 5) {
    const v = avg(decisive.map((r) => ll(pOf(dOf(r.pHome) + s * r.net), r.y)));
    if (v < bestLL) { bestLL = v; best = s; }
  }
  return { shift: best, n: decisive.length, logLossAtFit: bestLL };
}
/** Fit the margin sigma widening factor by maximising interval-coverage fidelity to 0.80. */
function fitWiden(rows) {
  const affected = rows.filter((r) => r.net !== 0);
  if (!affected.length) return { factor: 1, n: 0 };
  let best = 1, bestErr = Infinity;
  for (let f = 1; f <= 2.0; f += 0.05) {
    const cov = avg(affected.map((r) => (Math.abs(r.margin - r.marginMean) <= 1.2816 * gate.margin.sigma * f ? 1 : 0)));
    const err = Math.abs(cov - 0.8);
    if (err < bestErr) { bestErr = err; best = f; }
  }
  return { factor: Number(best.toFixed(2)), n: affected.length };
}

function scoreSet(rows, label, C) {
  const decisive = rows.filter((r) => r.y !== null);
  const ys = decisive.map((r) => r.y);
  const out = { label, games: rows.length, decisive: decisive.length };
  out.incumbent = { logLoss: avg(decisive.map((r) => ll(r.pHome, r.y))), ece: eceOf(decisive.map((r) => r.pHome), ys) };
  out.candidate = { logLoss: avg(decisive.map((r) => ll(r[`${C}_p`], r.y))), ece: eceOf(decisive.map((r) => r[`${C}_p`]), ys) };
  out.deltaLogLoss = out.candidate.logLoss - out.incumbent.logLoss;
  const withMkt = decisive.filter((r) => r.market != null);
  out.market = withMkt.length ? { n: withMkt.length, logLoss: avg(withMkt.map((r) => ll(r.market, r.y))), candidateLogLoss: avg(withMkt.map((r) => ll(r[`${C}_p`], r.y))) } : null;
  const covOf = (meanKey, facKey) => avg(rows.map((r) => (Math.abs(r.margin - r[meanKey]) <= 1.2816 * gate.margin.sigma * (facKey ? r[facKey] : 1) ? 1 : 0)));
  out.margin = {
    incumbent: { mae: avg(rows.map((r) => Math.abs(r.margin - r.marginMean))), coverage80: covOf("marginMean", null) },
    candidate: { mae: avg(rows.map((r) => Math.abs(r.margin - r[`${C}_marginMean`]))), coverage80: covOf(`${C}_marginMean`, `${C}_sigmaFactor`) },
  };
  return out;
}

/** Walk-forward: every scored season uses a shift fitted only on strictly earlier seasons. */
const fits = {};
for (const s of SCORED_SEASONS) {
  const priorRows = all.filter((r) => r.season < s);
  fits[s] = { win: fitShift(priorRows), margin: fitWiden(priorRows) };
}
/*
 * ⚠ TWO CANDIDATES, SCORED SEPARATELY, BECAUSE THE REGISTRATION DECLARES TWO.
 *
 *   A · qb-absent-elo-shift-v1     one fitted rating shift; moves the win head AND the margin mean.
 *   B · qb-absent-margin-widen-v1  the same indicator widening the margin sigma; WIN HEAD UNCHANGED.
 *
 * My first pass applied the shift and the widening together and reported one verdict. That is not
 * what was registered, and a combined candidate cannot be refused or adopted per head — which is
 * exactly what the decision rule asks for.
 */
for (const r of all) {
  if (!SCORED_SEASONS.includes(r.season)) continue;
  const f = fits[r.season];
  r.shift = f.win.shift;
  r.widen = f.margin.factor;
  // A: the rating shift
  r.A_p = pOf(dOf(r.pHome) + r.shift * r.net);
  r.A_marginMean = gate.margin.slope * ((r.marginMean / gate.margin.slope) + r.shift * r.net);
  r.A_sigmaFactor = 1;
  r.A_dLL = r.y === null ? null : ll(r.A_p, r.y) - ll(r.pHome, r.y);
  // B: sigma widening only — the win head is untouched, so its log loss is the incumbent's
  r.B_p = r.pHome;
  r.B_marginMean = r.marginMean;
  r.B_sigmaFactor = r.net !== 0 ? r.widen : 1;
  r.B_dLL = 0;
}
const scored = all.filter((r) => SCORED_SEASONS.includes(r.season));

if (MODE === "validate") {
  console.log(`warmup ${WARMUP_SEASON}: ${all.filter((r) => r.season === WARMUP_SEASON).length} rows`);
  for (const s of SCORED_SEASONS) console.log(`fit for ${s}: shift ${fits[s].win.shift} (n=${fits[s].win.n})  widen x${fits[s].margin.factor} (n=${fits[s].margin.n})`);
  console.log(`scoreable rows ${scored.length}; one-sided absences ${scored.filter((r) => r.net !== 0).length}`);
  console.log("\nNO held-out metric computed in --validate.");
  process.exit(0);
}

// ── THE ONE LOOK ─────────────────────────────────────────────────────────────────────────────────
function verdictFor(rows, label, C) {
  const overall = scoreSet(rows, label, C);
  const bySeason = {};
  for (const s of SCORED_SEASONS) {
    const r = rows.filter((x) => x.season === s);
    if (r.length) bySeason[s] = scoreSet(r, String(s), C);
  }
  const boot = bootstrapUpper95(rows.filter((r) => r[`${C}_dLL`] !== null).map((r) => ({ season: r.season, dLL: r[`${C}_dLL`] })));
  const bars = {
    logLossImprovement: { required: "<= -0.005", got: Number(overall.deltaLogLoss.toFixed(5)), pass: overall.deltaLogLoss <= -0.005 },
    improvementIsNotNoise: { required: "bootstrap 95% upper bound < 0", got: Number(boot.toFixed(5)), pass: boot < 0 },
    everySeason: { required: "candidate log loss below incumbent in every scored season", got: Object.fromEntries(Object.entries(bySeason).map(([k, v]) => [k, Number(v.deltaLogLoss.toFixed(5))])), pass: Object.values(bySeason).every((v) => v.deltaLogLoss < 0) },
    marketHardStop: overall.market ? { required: "< market log loss + 0.02", got: Number((overall.market.candidateLogLoss - overall.market.logLoss).toFixed(5)), pass: overall.market.candidateLogLoss - overall.market.logLoss < 0.02 } : { required: "< market + 0.02", got: null, pass: false, note: "no moneylines available" },
    calibration: { required: "candidate ece <= incumbent ece + 0.01", got: Number((overall.candidate.ece - overall.incumbent.ece).toFixed(5)), pass: overall.candidate.ece - overall.incumbent.ece <= 0.01 },
  };
  const marginBars = {
    coverageBand: { required: "[0.75, 0.85] overall and every season", overall: Number(overall.margin.candidate.coverage80.toFixed(4)), bySeason: Object.fromEntries(Object.entries(bySeason).map(([k, v]) => [k, Number(v.margin.candidate.coverage80.toFixed(4))])), pass: overall.margin.candidate.coverage80 >= 0.75 && overall.margin.candidate.coverage80 <= 0.85 && Object.values(bySeason).every((v) => v.margin.candidate.coverage80 >= 0.75 && v.margin.candidate.coverage80 <= 0.85) },
    mae: { required: "not worse by > 0.5 AND better on the point estimate", incumbent: Number(overall.margin.incumbent.mae.toFixed(3)), candidate: Number(overall.margin.candidate.mae.toFixed(3)), pass: overall.margin.candidate.mae <= overall.margin.incumbent.mae + 0.5 && overall.margin.candidate.mae < overall.margin.incumbent.mae },
  };
  return { candidate: C === "A" ? "qb-absent-elo-shift-v1" : "qb-absent-margin-widen-v1", overall, bySeason, bars, marginBars, winVerdict: Object.values(bars).every((b) => b.pass) ? "ELIGIBLE" : "REJECTED", marginVerdict: Object.values(marginBars).every((b) => b.pass) ? "ELIGIBLE" : "REJECTED" };
}

const noW18Rows = scored.filter((r) => !(r.gameType === "REG" && r.week === 18));
const results = {};
for (const C of ["A", "B"]) {
  const full = verdictFor(scored, "2023-2025", C);
  const noW18 = verdictFor(noW18Rows, "2023-2025 excl. week 18", C);
  results[full.candidate] = {
    full,
    week18Excluded: noW18,
    /* ⚠ BOTH MUST HOLD. A result carried by Week 18 rest games is a result about resting, not about
       availability, and the registration rejects it. */
    winVerdict: full.winVerdict === "ELIGIBLE" && noW18.winVerdict === "ELIGIBLE" ? "ELIGIBLE" : "REJECTED",
    marginVerdict: full.marginVerdict === "ELIGIBLE" && noW18.marginVerdict === "ELIGIBLE" ? "ELIGIBLE" : "REJECTED",
  };
}
const anyEligible = Object.values(results).some((r) => r.winVerdict === "ELIGIBLE" || r.marginVerdict === "ELIGIBLE");

const evaluation = {
  schemaVersion: 1,
  artifact: "team-availability-ceiling-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  ceiling: true,
  ceilingMeaning: "Conditioned on OBSERVED snaps, which nobody has at forecast time. This is the best a perfect availability oracle could do, not an implementable feature, and no result here may be described as a live improvement.",
  preregistration: PREREG,
  generatedAt: argOf("--now"),
  incumbent: { receipt: gate.win.receiptStamp, heads: ["nfl-win-elo-mov-v1", "nfl-margin-elo-hfa-v1"], note: "scored through the production replay in win-margin-heads.mjs, not a reimplementation" },
  population: {
    scoredSeasons: SCORED_SEASONS, warmupSeason: WARMUP_SEASON,
    games: scored.length,
    oneSidedAbsences: scored.filter((r) => r.net !== 0).length,
    bothAbsent: scored.filter((r) => r.hAbs && r.aAbs).length,
    week18Games: scored.length - noW18Rows.length,
  },
  fits,
  candidates: results,
  verdicts: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { win: v.winVerdict, margin: v.marginVerdict }])),
  consequence: anyEligible
    ? "A ceiling cleared. This authorises NO public change: it is permission to design a pregame-knowable availability feature and register that separately."
    : "The ceiling failed. A perfect availability oracle does not clear the bars the incumbent heads were held to, so a live feature driven by injury reports cannot either. The validated head stays unchanged and the blindness is recorded as a stated limitation.",
};
fs.writeFileSync(rel(OUT), `${JSON.stringify(evaluation, null, 2)}\n`);

console.log(`population: ${scored.length} games · ${evaluation.population.oneSidedAbsences} one-sided QB absences · ${evaluation.population.bothAbsent} both absent · ${evaluation.population.week18Games} week-18 games`);
for (const s of SCORED_SEASONS) console.log(`  fit for ${s}: shift ${fits[s].win.shift} Elo (n=${fits[s].win.n})  widen x${fits[s].margin.factor}`);
for (const [name, r] of Object.entries(results)) {
  console.log(`\n=== ${name}   win=${r.winVerdict}  margin=${r.marginVerdict}`);
  for (const [label, v] of [["FULL", r.full], ["EXCL W18", r.week18Excluded]]) {
    console.log(`  ${label}: logLoss ${v.overall.incumbent.logLoss.toFixed(5)} -> ${v.overall.candidate.logLoss.toFixed(5)}  delta ${v.overall.deltaLogLoss.toFixed(5)}`);
    for (const [k, b] of Object.entries(v.bars)) console.log(`     ${b.pass ? "PASS" : "FAIL"}  ${k}: ${JSON.stringify(b.got)}`);
    console.log(`     ${v.marginBars.mae.pass ? "PASS" : "FAIL"}  margin mae ${v.marginBars.mae.incumbent} -> ${v.marginBars.mae.candidate}`);
    console.log(`     ${v.marginBars.coverageBand.pass ? "PASS" : "FAIL"}  margin coverage ${v.marginBars.coverageBand.overall}`);
  }
}
console.log(`\nVERDICTS: ${JSON.stringify(evaluation.verdicts)}`);
console.log(`wrote ${OUT}`);
