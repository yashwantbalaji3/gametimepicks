#!/usr/bin/env node
/**
 * NFL STARTING-QB PROJECTION · TIER (b) WALK-FORWARD BACKTEST (founder decision 2026-11-11). $0, committed data only.
 *
 *   node scripts/research/nfl/backtest-qb-starter-tier-b.mjs [--write]
 *
 * Question: when a team's starting quarterback's passing history WITH THAT CLUB is not a starter's (traded, or a
 * backup now starting — the cases the 0.75 passer-share floor withheld), does projecting him from his own verified
 * all-club NFL passing in the current team's context (tier b) beat (1) a league-average starter in the same team
 * context and (2) the existing club-share projection?
 *
 * RULE, FIXED BEFORE ANY RESULT WAS SEEN (every constant from a committed file):
 *   data        player-games-v1 (2013–2025) + player-games-2026-v1 (through its committed week), folded walk-forward
 *               by date exactly as P300 folds (UNKNOWN participation skipped); each date's games are scored on the
 *               state BEFORE that date, then folded
 *   STARTER_SHARE  mean share of team pass attempts thrown by the game's leading passer, REG 2013–2017 (never scored)
 *   population  REG games 2018–2026; the team's leading passer (most attempts, position QB) whose pre-game club share
 *               is below PASSER_STARTER_SHARE_FLOOR (0.75, board-roster-integrity.mjs) and whose pre-game career
 *               attempts across all clubs are ≥ F.rate.priorTrials (25) — tier (b) eligibility
 *   metric      mean pinball loss over q ∈ {.1,.25,.5,.75,.9} (lower is better), paired per game
 *   bootstrap   2000 resamples (F.bootstrap), seed F.bootstrap.seed, clustered by season-week (the prereg's season unit
 *               gives only 9 clusters here; few-cluster intervals are not quoted)
 *   bars        n ≥ F.bars.minimumN; paired 95% CI of (tier b − league starter) and of (tier b − club share) both
 *               entirely below 0; 80% interval coverage inside F.bars.coverageBand; level (Σ actual / Σ mean) inside
 *               F.bars.levelBand. All four → TIER_B_PASSED; otherwise TIER_B_FAILED with the bar(s) named.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { createQbState, clubShare, tierBProjection, leagueStarterProjection, clubShareProjection, pinball } from "../../../app/src/lib/sports/nfl/qb-starter-projection.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const PREREG = "data/internal/research/nfl/reports/player-props-share-level-preregistration.json";
const SECOND_LOOK = "data/internal/research/nfl/reports/player-props-share-level-second-look.json";
const TABLES = ["data/internal/research/nfl/replay/player-games-v1.json.gz", "data/internal/research/nfl/replay/player-games-2026-v1.json.gz"];
const OUT = "data/internal/research/nfl/reports/qb-starter-tier-b-backtest.json";
const FLOOR = 0.75; // PASSER_STARTER_SHARE_FLOOR, app/src/lib/sports/nfl/board-roster-integrity.mjs
const SHARE_SEASONS = [2013, 2017];
const EVAL_FROM = 2018;
/* The committed 2026 table's throughWeek when this rule was fixed (2026-11-11): later weekly refreshes of that table
   never move the backtest (the report recomputes byte-for-byte; a new look is a new, dated report). */
const THROUGH_2026_WEEK = 9;

const F = JSON.parse(fs.readFileSync(rel(PREREG), "utf8")).frozen;
const scale = JSON.parse(fs.readFileSync(rel(SECOND_LOOK), "utf8")).devDispersionScales[`player_pass_yds|${F.candidates[0]}`];
if (!Number.isFinite(scale)) throw new Error("no dev dispersion scale for player_pass_yds");

/** Rows of both tables as objects, sorted by date then game then team then player; team totals by "gameId|team". */
export function loadRows() {
  const rows = [];
  const totals = new Map();
  for (const f of TABLES) {
    const t = JSON.parse(zlib.gunzipSync(fs.readFileSync(rel(f))));
    const C = Object.fromEntries(t.columns.map((c, i) => [c, i]));
    for (const [k, v] of Object.entries(t.teamTotals)) totals.set(k, v);
    for (const r of t.rows) {
      if (r[C.season] === 2026 && r[C.week] > THROUGH_2026_WEEK) continue;
      rows.push({ gameId: r[C.gameId], season: r[C.season], week: r[C.week], date: r[C.date], type: r[C.seasonType], team: r[C.team], opponent: r[C.opponent], id: String(r[C.playerId]), name: r[C.name], position: r[C.position], participation: r[C.participation], passAtt: r[C.passAtt], passCmp: r[C.passCmp], passYds: r[C.passYds] });
    }
  }
  rows.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.gameId !== b.gameId ? (a.gameId < b.gameId ? -1 : 1) : a.team !== b.team ? (a.team < b.team ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { rows, totals };
}

/** STARTER_SHARE: mean leading-passer share of team attempts, REG games in SHARE_SEASONS. */
export function starterShareFrom(rows, totals, [a, b] = SHARE_SEASONS) {
  const lead = new Map();
  for (const r of rows) {
    if (r.type !== "REG" || r.season < a || r.season > b || r.position !== "QB") continue;
    const k = `${r.gameId}|${r.team}`;
    if (!lead.has(k) || r.passAtt > lead.get(k)) lead.set(k, r.passAtt);
  }
  let s = 0, n = 0;
  for (const [k, att] of lead) { const T = totals.get(k)?.[0] ?? 0; if (T > 0 && att > 0) { s += att / T; n += 1; } }
  return { value: Number((s / n).toFixed(4)), games: n };
}

function rng(seed) { let x = seed >>> 0; return () => { x = (x + 0x6d2b79f5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pairedCi(events, key, resamples, seed) {
  const byCluster = new Map();
  for (const e of events) { const c = `${e.season}-${e.week}`; if (!byCluster.has(c)) byCluster.set(c, []); byCluster.get(c).push(e[key]); }
  const clusters = [...byCluster.values()];
  const mean = events.reduce((a, e) => a + e[key], 0) / events.length;
  const r = rng(seed);
  const stats = [];
  for (let i = 0; i < resamples; i += 1) {
    let s = 0, n = 0;
    for (let j = 0; j < clusters.length; j += 1) { const c = clusters[Math.floor(r() * clusters.length)]; for (const v of c) { s += v; n += 1; } }
    stats.push(s / n);
  }
  stats.sort((a, b) => a - b);
  return { mean: Number(mean.toFixed(3)), lo: Number(stats[Math.floor(0.025 * resamples)].toFixed(3)), hi: Number(stats[Math.ceil(0.975 * resamples) - 1].toFixed(3)), clusters: clusters.length };
}

function main() {
  const { rows, totals } = loadRows();
  const S = starterShareFrom(rows, totals);
  const state = createQbState(F);
  const events = [];
  const limited = [];
  let i = 0;
  while (i < rows.length) {
    const date = rows[i].date;
    let j = i;
    while (j < rows.length && rows[j].date === date) j += 1;
    const day = rows.slice(i, j);
    /* score: the day's REG team-games from EVAL_FROM, on the state before this date */
    const leaders = new Map();
    for (const r of day) {
      if (r.type !== "REG" || r.season < EVAL_FROM || r.position !== "QB" || r.participation === "UNKNOWN") continue;
      const k = `${r.gameId}|${r.team}`;
      const cur = leaders.get(k);
      if (!cur || r.passAtt > cur.passAtt || (r.passAtt === cur.passAtt && r.id < cur.id)) leaders.set(k, r);
    }
    for (const [k, r] of leaders) {
      if (!(r.passAtt > 0)) continue;
      const st = state.players.get(r.id);
      const share = st && st.team === r.team ? clubShare(st, r.season, F) : 0;
      if (share >= FLOOR) continue; // an established starter: tier (a), not this population
      const career = st?.careerAtt ?? 0;
      if (career < F.rate.priorTrials) { limited.push({ key: k, name: r.name, career }); continue; }
      const args = { st: st.team === r.team ? st : { ...st, clubObs: [] }, team: r.team, season: r.season, state, F, scale, starterShare: S.value };
      const b = tierBProjection(args);
      const l = leagueStarterProjection(args);
      const a = clubShareProjection(args);
      const y = r.passYds;
      events.push({ key: k, season: r.season, week: r.week, name: r.name, team: r.team, y, career, clubShare: Number(share.toFixed(3)), b: b.q, bMean: b.mean, lossB: pinball(b.q, y), lossL: pinball(l.q, y), lossA: pinball(a.q, y), dBL: pinball(b.q, y) - pinball(l.q, y), dBA: pinball(b.q, y) - pinball(a.q, y) });
    }
    /* fold the day */
    for (const r of day) {
      if (r.participation === "UNKNOWN") continue;
      state.fold({ id: r.id, name: r.name, team: r.team, season: r.season, gameKey: `${r.gameId}|${r.team}`, passAtt: r.passAtt, passCmp: r.passCmp, passYds: r.passYds }, totals.get(`${r.gameId}|${r.team}`)?.[0] ?? 0);
    }
    i = j;
  }
  const n = events.length;
  const mean = (k) => Number((events.reduce((a, e) => a + e[k], 0) / n).toFixed(3));
  const ciBL = pairedCi(events, "dBL", F.bootstrap.resamples, F.bootstrap.seed);
  const ciBA = pairedCi(events, "dBA", F.bootstrap.resamples, F.bootstrap.seed + 1);
  const coverage = Number((events.filter((e) => e.y >= e.b[0.1] && e.y <= e.b[0.9]).length / n).toFixed(4));
  const level = Number((events.reduce((a, e) => a + e.y, 0) / events.reduce((a, e) => a + e.bMean, 0)).toFixed(4));
  const bars = {
    minimumN: { need: F.bars.minimumN, got: n, pass: n >= F.bars.minimumN },
    beatsLeagueStarter: { ci95: ciBL, pass: ciBL.hi < 0 },
    beatsClubShare: { ci95: ciBA, pass: ciBA.hi < 0 },
    coverage80: { band: F.bars.coverageBand, got: coverage, pass: coverage >= F.bars.coverageBand[0] && coverage <= F.bars.coverageBand[1] },
    level: { band: F.bars.levelBand, got: level, pass: level >= F.bars.levelBand[0] && level <= F.bars.levelBand[1] },
  };
  const failed = Object.entries(bars).filter(([, v]) => !v.pass).map(([k]) => k);
  const report = {
    schemaVersion: 1,
    artifact: "nfl-qb-starter-tier-b-backtest",
    dataClass: "PRIVATE_RESEARCH",
    rule: "see scripts/research/nfl/backtest-qb-starter-tier-b.mjs header (fixed before any result was seen)",
    inputs: { tables: TABLES, through2026Week: THROUGH_2026_WEEK, preregistration: PREREG, secondLook: SECOND_LOOK, floor: FLOOR, priorTrials: F.rate.priorTrials, dispersionScale: scale },
    starterShare: { ...S, seasons: SHARE_SEASONS, definition: "mean share of team pass attempts thrown by the game's leading passer (position QB), REG" },
    population: { from: EVAL_FROM, n, limitedHistoryExcluded: limited.length },
    meanPinball: { tierB: mean("lossB"), leagueStarter: mean("lossL"), clubShare: mean("lossA") },
    bars,
    verdict: failed.length ? "TIER_B_FAILED" : "TIER_B_PASSED",
    failedBars: failed,
  };
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--write")) fs.writeFileSync(rel(OUT), JSON.stringify(report, null, 2) + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
