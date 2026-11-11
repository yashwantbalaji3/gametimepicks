/**
 * NBA M1 — RESEARCH CANDIDATE `nba-sim-v1-availability-margin` (UNARMED, replay-only; founder priority 2026-11-11, audit
 * ~/gtp-evidence/nba-injury-aware-engine-audit-2026-11-11.md §4). dataClass PRIVATE_RESEARCH · productEligible: false.
 * Nothing here writes to a lane, receipt, ledger, workflow or public file.
 *
 * ONE change to v1 (`nba-sim-v1-coherent`): the expected regulation margin gains
 *     λ · [ (O_h,avail − O_h,ref) − (O_a,avail − O_a,ref) ]
 * where O is v1's own pool offence (expectedSidePoints), O_ref the historical roster proxy pool (players who appeared in
 * the team's last 10 games — absences Elo's recent results already reflect are not in it), and O_avail the same pool
 * with this game's absences removed. No absence ⇒ the shift is exactly 0 ⇒ v1 byte for byte (game-sim-v1.mjs).
 *
 * HISTORICAL AVAILABILITY = TIP-TIME PROXY: a player in the pool with an injury-type DNP in the game's box score (any
 * dnpReason that is not a coach's decision) is "out". It stands in for the pregame inactive list; it is ex-post text,
 * known at tip, NOT at an earlier freeze. Coach's-decision DNPs are role (v1's playRate), never inputs.
 *
 *   --fit   2023-24 (corpus season 2024; v1's fit season): λ by OLS (no intercept) of the regulation-margin residual
 *           (regulation margin − v1's frozen HCA·home − ELO_TO_MARGIN·ΔElo) on the availability difference — the same
 *           method as calibrate-sim-v1.mjs's margin fit, extended by one regressor; v1's own parameters stay fixed.
 *           λ needs founder approval before any arming (methodology-constants rule); this only reports it.
 *   --dev   2024-25 (corpus season 2025; v1's development season) — EXPLORATORY: candidate vs v1 with λ = 0 (paired, same
 *           seed per game) vs walk-forward Elo (the official rule). Log loss, Brier, ECE, margin MAE / bias / cov80, total
 *           MAE; paired differences with a game-level bootstrap (one row per game: B 2000, seed 20261020, bootstrap.mjs).
 *   The 2025-26 season (the single preregistered look) is never loaded here.
 *
 * Run (from app/): node scripts/nba/research-v1-availability-margin.mjs --fit|--dev [--sims 2000] [--games N] [--out <dir>]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildTeamRatings, ratingFor, winProbability } from "../../src/lib/sports/nba/team-rating.mjs";
import { indexBoxscores, leagueMeans, buildSideProfile, historicalRosterProxy } from "../../src/lib/sports/nba/sim-v1-profile.mjs";
import { expectedSidePoints, simulateGameV1, V1_PARAMS } from "../../src/lib/sports/nba/game-sim-v1.mjs";
import { bootstrapStatistic } from "../../src/lib/sports/nba/bootstrap.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const MODE = argv.includes("--fit") ? "fit" : argv.includes("--dev") ? "dev" : null;
if (!MODE) { console.error("--fit or --dev required"); process.exit(2); }
const SEASON = MODE === "fit" ? 2024 : 2025;
const SIMS = Number(opt("--sims", 2000));
const GAMES = Number(opt("--games", 1e9));
const OUT = path.resolve(opt("--out", path.join(NBA, "reports")));
const MIN_DAYS = 30;
const REPORT_FIT = path.join(NBA, "reports", "v1-availability-margin-fit-2024.json");

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const corpus = readJson(path.join(NBA, "corpus-v1.json"));
const corpusRows = (corpus.rows ?? []).filter((r) => r.season <= SEASON);
const box = fs.readdirSync(path.join(NBA, "boxscores")).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(NBA, "boxscores", f))).filter((d) => d.season <= SEASON);
const index = indexBoxscores(box);
const boxById = new Map(box.map((d) => [String(d.providerEventId), d]));
const lines = new Map();
for (const f of fs.readdirSync(path.join(NBA, "raw")).filter((x) => /^espn-.*\.json$/.test(x))) {
  for (const e of readJson(path.join(NBA, "raw", f)).events ?? []) {
    if (e?.season?.year !== SEASON || e?.season?.type !== 2) continue;
    const comp = e.competitions?.[0]; if (!comp) continue;
    const side = (ha) => comp.competitors.find((c) => c.homeAway === ha);
    const per = (c) => (c?.linescores ?? []).slice().sort((x, y) => x.period - y.period).map((x) => Number(x.value));
    lines.set(String(e.id), { home: per(side("home")), away: per(side("away")) });
  }
}
const rows = corpusRows.filter((r) => r.season === SEASON && r.phase === 2).sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
const start = Date.parse(rows[0].dateUtc);
const sample = rows.filter((r) => Date.parse(r.dateUtc) >= start + MIN_DAYS * 86400_000 && boxById.get(String(r.providerEventId))?.boxscoreAvailable && lines.has(String(r.providerEventId))).slice(0, GAMES);

/** The tip-time availability proxy: pool players with an injury-type DNP in this game's box score. */
export function injuryDnpIds(doc, teamId) {
  return new Set((doc.players ?? []).filter((p) => String(p.providerTeamId) === String(teamId) && p.didNotPlay === true && !/COACH/i.test(String(p.dnpReason ?? ""))).map((p) => String(p.providerAthleteId)));
}

/** One game's inputs: ref and avail profiles per side and the availability difference x = ΔO_h − ΔO_a. */
function gameInputs(g) {
  const id = String(g.providerEventId);
  const doc = boxById.get(id);
  const homeId = doc.teams.find((t) => t.homeAway === "home")?.providerTeamId, awayId = doc.teams.find((t) => t.homeAway === "away")?.providerTeamId;
  if (!homeId || !awayId) return null;
  const now = g.dateUtc;
  const ratings = buildTeamRatings(corpusRows, { throughDateUtc: now, targetSeason: SEASON });
  const rh = ratingFor(ratings, g.home).rating, ra = ratingFor(ratings, g.away).rating;
  const league = leagueMeans(index, { asOf: now });
  const side = (tid) => {
    const proxy = historicalRosterProxy(index, tid, { asOf: now });
    const out = injuryDnpIds(doc, tid);
    const ref = buildSideProfile(index, { teamId: tid, rosterRows: proxy.map((pid) => ({ providerAthleteId: pid, availability: "unknown" })), asOf: now, league });
    const avail = buildSideProfile(index, { teamId: tid, rosterRows: proxy.map((pid) => ({ providerAthleteId: pid, availability: out.has(pid) ? "out" : "unknown" })), asOf: now, league });
    const oRef = expectedSidePoints(ref).offence, oAvail = expectedSidePoints(avail).offence;
    return { ref, avail, outInPool: proxy.filter((pid) => out.has(pid)).length, delta: Number.isFinite(oRef) && Number.isFinite(oAvail) ? oAvail - oRef : null };
  };
  const H = side(homeId), A = side(awayId);
  if (H.delta == null || A.delta == null) return null;
  const ls = lines.get(id);
  const regH = ls.home.slice(0, 4).reduce((s, x) => s + x, 0), regA = ls.away.slice(0, 4).reduce((s, x) => s + x, 0);
  return { id, now, g, doc, homeId, awayId, rh, ra, league, H, A, x: H.delta - A.delta, home: g.neutralSite === true ? 0 : 1, regMargin: regH - regA, ftHome: g.ftHome, ftAway: g.ftAway };
}

const r4 = (v) => (v == null ? null : Number(v.toFixed(4)));
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const t0 = Date.now();
const recs = [];
for (const g of sample) { const r = gameInputs(g); if (r) recs.push(r); }
console.log(`${MODE} season ${SEASON}: ${recs.length} games · with an absence in the pool ${recs.filter((r) => r.x !== 0).length} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);

if (MODE === "fit") {
  const resid = recs.map((r) => r.regMargin - (r.home * V1_PARAMS.HCA_POINTS + V1_PARAMS.ELO_TO_MARGIN * (r.rh - r.ra)));
  const sxx = recs.reduce((s, r) => s + r.x * r.x, 0), sxy = recs.reduce((s, r, i) => s + r.x * resid[i], 0);
  const lambda = sxy / sxx;
  const e = recs.map((r, i) => resid[i] - lambda * r.x);
  const s2 = e.reduce((s, x) => s + x * x, 0) / (recs.length - 1);
  const report = {
    schemaVersion: 1, artifact: "nba-v1-availability-margin-fit", dataClass: "PRIVATE_RESEARCH", candidate: "nba-sim-v1-availability-margin", armed: false,
    fitSeason: "2023-24 (corpus season 2024), regular season, ≥ 30 days in",
    method: "OLS, no intercept: (regulation margin − V1 HCA·home − V1 ELO_TO_MARGIN·ΔElo) on (ΔO_home − ΔO_away); v1 parameters fixed",
    availabilityProxy: "TIP-TIME PROXY — injury-type DNP (dnpReason not a coach's decision) in the game's box score, for players in the historical roster proxy pool",
    n: recs.length, gamesWithAbsence: recs.filter((r) => r.x !== 0).length, xSd: r4(Math.sqrt(mean(recs.map((r) => r.x * r.x)))),
    lambda: r4(lambda), lambdaSE: r4(Math.sqrt(s2 / sxx)),
    approval: "PENDING — founder approval required before any arming (methodology-constants rule)",
  };
  console.log(JSON.stringify(report, null, 1));
  if (argv.includes("--write")) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, "v1-availability-margin-fit-2024.json"), JSON.stringify(report, null, 1) + "\n"); }
  process.exit(0);
}

/* ── dev (exploratory) ── */
const lambda = readJson(REPORT_FIT).lambda;
const arms = { candidate: [], v1lambda0: [], elo: [] };
const items = [];
let k = 0;
for (const r of recs) {
  const H = { name: r.g.home, providerTeamId: r.homeId, rating: { rating: r.rh }, profile: r.H.avail };
  const A = { name: r.g.away, providerTeamId: r.awayId, rating: { rating: r.ra }, profile: r.A.avail };
  const eloP = winProbability(r.rh, r.ra, { neutralSite: r.g.neutralSite === true });
  const common = { providerEventId: r.id, inputAsOf: r.now, neutralSite: r.g.neutralSite === true, home: H, away: A, league: r.league, eloWinProbability: eloP, simulations: SIMS, seed: `m1-${r.id}` };
  let base, cand;
  try { base = simulateGameV1(common); cand = simulateGameV1({ ...common, marginShift: lambda * r.x }); } catch { continue; }
  const y = r.ftHome > r.ftAway ? 1 : 0, am = r.ftHome - r.ftAway, at = r.ftHome + r.ftAway;
  const row = (o) => ({ p: o.sim.pHome, mMean: o.sim.margin.mean, m10: o.sim.margin.p10, m90: o.sim.margin.p90, tMean: o.sim.total.mean });
  const b = row(base), c = row(cand);
  items.push({ y, am, at, x: r.x, eloP, b, c });
  if (++k % 100 === 0) console.log(`  ${k}/${recs.length} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
const clampP = (p) => Math.min(1 - 1e-12, Math.max(1e-12, p));
const ll = (p, y) => -(y ? Math.log(clampP(p)) : Math.log(1 - clampP(p)));
const ece = (ps, ys) => { const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 })); ps.forEach((q, i) => { const bb = bins[Math.min(9, Math.floor(q * 10))]; bb.n++; bb.p += q; bb.y += ys[i]; }); return bins.reduce((s, bb) => s + (bb.n ? (bb.n / ps.length) * Math.abs(bb.p / bb.n - bb.y / bb.n) : 0), 0); };
const metricsOf = (get) => {
  const ps = items.map((it) => get(it).p), ys = items.map((it) => it.y);
  return { n: items.length, logLoss: r4(mean(items.map((it) => ll(get(it).p, it.y)))), brier: r4(mean(items.map((it) => (get(it).p - it.y) ** 2))), ece: r4(ece(ps, ys)) };
};
const marginOf = (get) => ({ marginMAE: r4(mean(items.map((it) => Math.abs(get(it).mMean - it.am)))), marginBias: r4(mean(items.map((it) => get(it).mMean - it.am))), marginCov80: r4(mean(items.map((it) => (it.am >= get(it).m10 && it.am <= get(it).m90 ? 1 : 0)))), totalMAE: r4(mean(items.map((it) => Math.abs(get(it).tMean - it.at)))) });
const paired = (f) => { const bs = bootstrapStatistic(items, (xs) => mean(xs.map(f))); return { mean: r4(mean(items.map(f))), ci95: [bs.lo, bs.hi], B: bs.B, seed: bs.seed }; };
const sub = (cond) => items.filter(cond);
const report = {
  schemaVersion: 1, artifact: "nba-v1-availability-margin-dev", dataClass: "PRIVATE_RESEARCH", label: "EXPLORATORY — development season 2024-25; not evidence for arming",
  candidate: "nba-sim-v1-availability-margin", armed: false, lambda, lambdaSource: path.relative(path.resolve(APP, ".."), REPORT_FIT),
  availabilityProxy: "TIP-TIME PROXY (injury-type DNP in the box score) — the forward sample uses hashed pregame snapshots instead",
  simulations: SIMS, seedPolicy: "explicit m1-<eventId>, identical for both v1 arms (paired)",
  n: items.length, gamesWithAbsence: items.filter((it) => it.x !== 0).length,
  winner: { candidate: metricsOf((it) => it.c), v1Lambda0: metricsOf((it) => it.b), elo: { ...metricsOf((it) => ({ p: it.eloP })) } },
  margin: { candidate: marginOf((it) => it.c), v1Lambda0: marginOf((it) => it.b) },
  pairedDiffs: {
    logLoss_candidate_minus_v1Lambda0: paired((it) => ll(it.c.p, it.y) - ll(it.b.p, it.y)),
    logLoss_candidate_minus_elo: paired((it) => ll(it.c.p, it.y) - ll(it.eloP, it.y)),
    brier_candidate_minus_v1Lambda0: paired((it) => (it.c.p - it.y) ** 2 - (it.b.p - it.y) ** 2),
    marginAbsErr_candidate_minus_v1Lambda0: paired((it) => Math.abs(it.c.mMean - it.am) - Math.abs(it.b.mMean - it.am)),
  },
  absenceGamesOnly: (() => { const s = sub((it) => it.x !== 0); return { n: s.length, logLossDiff_vs_v1Lambda0: r4(mean(s.map((it) => ll(it.c.p, it.y) - ll(it.b.p, it.y)))), marginAbsErrDiff_vs_v1Lambda0: r4(mean(s.map((it) => Math.abs(it.c.mMean - it.am) - Math.abs(it.b.mMean - it.am)))) }; })(),
  note: "Lower is better for every loss. A direction is claimed only where the 95% interval excludes 0. Development data only.",
};
console.log(JSON.stringify(report, null, 1));
if (argv.includes("--write")) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, "v1-availability-margin-dev-2025.json"), JSON.stringify(report, null, 1) + "\n"); }
