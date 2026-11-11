#!/usr/bin/env node
/**
 * NBA M2b — RESEARCH CANDIDATE `nba-sim-v1-availability-wowy` (UNARMED, replay-only; founder P0E 2026-11-11 ~20:40Z).
 * dataClass PRIVATE_RESEARCH · productEligible: false. Nothing here writes to a lane, receipt, ledger, workflow or public
 * file; tonight's games are never read (corpus-v1 and its box scores only).
 *
 * M1/M2 valued an absence with v1's own machinery: the absent player's minutes are water-filled to teammates who keep
 * their own per-minute rates, and team defence is unchanged. M2b replaces that with ACTUAL HISTORICAL REDISTRIBUTION
 * from comparable with/without situations ("WOWY"): for each absent player X of team T, the team's own earlier games
 * with X on the roster are split into X played (in) vs X injury-DNP (out), and
 *   PLAYER LEVEL  each available teammate Y's minutes, shot attempts (FGA), FTA, points, rebounds, assists, steals+blocks
 *                 (per 240 team player-minutes; a coach's-decision DNP counts as 0) shift by mean(out) − mean(in), over
 *                 the games Y was available, shrunk by n_out / (n_out + K_PLAYER);
 *   GAME LEVEL    the team's Elo-adjusted residuals shift by mean(out) − mean(in), shrunk by n_out / (n_out + K_GAME):
 *                 offence residual (points for − expected), defence residual (points against − expected) and their
 *                 difference, the margin residual. Expected = v1's own HCA + ELO_TO_MARGIN·ΔElo margin around the
 *                 season's league points per team game; pregame Elo = team-rating.mjs walk-forward (onFold).
 * Several absentees add. History: regular season, the same team, the current and previous corpus season, strictly
 * before the game. The absences are the same TIP-TIME PROXY as M1/M2 (injury-type DNP of a roster-proxy pool player).
 *
 *   --fit   2023-24: K_PLAYER by grid (minutes SSE over teammates in absence team-games) and K_GAME by grid (SSE of the
 *           regulation-margin residual after the shift), from committed data; a recompute test pins both.
 *   --dev   2024-25, EXPLORATORY: player level — WOWY vs v1's water-fill expectation for every available teammate who
 *           played (MAE per stat, paired by game); game level — v1 with marginShift = the WOWY margin shift vs v1
 *           (shift 0) vs walk-forward Elo (2000 paired sims, game bootstrap B 2000 seed 20261020). 2025-26 never loaded.
 *
 * Run (from app/): node scripts/nba/research-v1-availability-wowy.mjs --fit|--dev [--sims 2000] [--games N] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildTeamRatings, ratingFor, winProbability } from "../../src/lib/sports/nba/team-rating.mjs";
import { indexBoxscores, leagueMeans, buildSideProfile, historicalRosterProxy } from "../../src/lib/sports/nba/sim-v1-profile.mjs";
import { simulateGameV1, waterFill, V1_PARAMS, REGULATION_MINUTES, PLAYER_CAP_REGULATION } from "../../src/lib/sports/nba/game-sim-v1.mjs";
import { bootstrapStatistic, clusterBootstrap } from "../../src/lib/sports/nba/bootstrap.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const MODE = argv.includes("--fit") ? "fit" : argv.includes("--dev") ? "dev" : null;
if (!MODE) { console.error("--fit | --dev required"); process.exit(2); }
const SEASON = MODE === "fit" ? 2024 : 2025;
const SIMS = Number(opt("--sims", 2000));
const GAMES = Number(opt("--games", 1e9));
const MIN_DAYS = 30;
const REPORT_FIT = path.join(NBA, "reports", "v1-availability-wowy-fit-2024.json");
const REPORT_DEV = path.join(NBA, "reports", "v1-availability-wowy-dev-2025.json");
/** The grid is fixed before any number is seen: Fibonacci-spaced pseudo-games of shrinkage, 1 … 89. */
export const K_GRID = Object.freeze([1, 2, 3, 5, 8, 13, 21, 34, 55, 89]);
export const STATS = Object.freeze(["minutes", "fga", "fta", "pts", "reb", "ast", "stocks"]);

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

/* ── per-(event, team) facts: player-minutes, pregame expectation, residuals ── */
const pre = new Map();
buildTeamRatings(corpusRows, { throughDateUtc: "2100-01-01T00:00:00Z", onFold: (o) => { if (o.population === "regular") pre.set(String(o.providerEventId), o); } });
const corpusById = new Map(corpusRows.map((r) => [String(r.providerEventId), r]));
const leaguePerTeam = new Map();
for (const s of new Set(corpusRows.map((r) => r.season))) { const g = corpusRows.filter((r) => r.season === s && r.phase === 2); leaguePerTeam.set(s, g.reduce((a, r) => a + r.ftHome + r.ftAway, 0) / (2 * g.length)); }
const teamFacts = new Map(); // `${eventId}:${teamId}` → { playerMinutes, offRes, defRes, marRes }
for (const d of box) {
  if (!d.boxscoreAvailable || d.phase !== 2) continue;
  const id = String(d.providerEventId), row = corpusById.get(id), o = pre.get(id);
  if (!row || !o) continue;
  const home = d.teams.find((t) => t.homeAway === "home"), away = d.teams.find((t) => t.homeAway === "away");
  if (!home || !away) continue;
  const mHome = (row.neutralSite === true ? 0 : V1_PARAMS.HCA_POINTS) + V1_PARAMS.ELO_TO_MARGIN * (o.ratingHome - o.ratingAway);
  const L = leaguePerTeam.get(row.season);
  for (const [t, isHome] of [[home, true], [away, false]]) {
    const pm = (d.players ?? []).filter((p) => String(p.providerTeamId) === String(t.providerTeamId) && !p.didNotPlay && Number.isInteger(p.minutes)).reduce((s, p) => s + p.minutes, 0);
    const pf = isHome ? row.ftHome : row.ftAway, pa = isHome ? row.ftAway : row.ftHome, m = isHome ? mHome : -mHome;
    teamFacts.set(`${id}:${t.providerTeamId}`, { playerMinutes: pm, offRes: pf - (L + m / 2), defRes: pa - (L - m / 2), marRes: pf - pa - m });
  }
}
const rowsByAthleteEvent = new Map();
const athleteRow = (pid, eid) => {
  if (!rowsByAthleteEvent.has(pid)) rowsByAthleteEvent.set(pid, new Map((index.byAthlete.get(pid) ?? []).map((r) => [r.eventId, r])));
  return rowsByAthleteEvent.get(pid).get(eid);
};
const rawById = new Map();
for (const d of box) for (const p of d.players ?? []) rawById.set(`${d.providerEventId}:${p.providerAthleteId}`, p);
/** A teammate's normalized line (per 240 team player-minutes); 0s for a coach's DNP; null when unavailable (injury DNP / absent). */
function lineOf(eid, pid, teamId) {
  const r = athleteRow(pid, eid);
  if (!r || r.teamId !== String(teamId)) return null;
  if (!r.played) return r.coachDnp ? Object.fromEntries(STATS.map((k) => [k, 0])) : null;
  const f = teamFacts.get(`${eid}:${teamId}`); const raw = rawById.get(`${eid}:${pid}`);
  if (!f || !f.playerMinutes || !raw) return null;
  const s = REGULATION_MINUTES / f.playerMinutes;
  return { minutes: raw.minutes * s, fga: (raw.fga ?? 0) * s, fta: (raw.fta ?? 0) * s, pts: (raw.pts ?? 0) * s, reb: (raw.reb ?? 0) * s, ast: (raw.ast ?? 0) * s, stocks: ((raw.stl ?? 0) + (raw.blk ?? 0)) * s };
}

/** The tip-time availability proxy (as M1/M2). */
const injuryDnpIds = (doc, teamId) => new Set((doc.players ?? []).filter((p) => String(p.providerTeamId) === String(teamId) && p.didNotPlay === true && !/COACH/i.test(String(p.dnpReason ?? ""))).map((p) => String(p.providerAthleteId)));

/** X's with/without history for team T strictly before `t`: event ids split into in (X played) and out (X injury DNP). */
function splits(pid, teamId, t, season) {
  const inn = [], out = [];
  for (const r of index.byAthlete.get(pid) ?? []) {
    if (!(r.t < t) || r.phase !== 2 || r.teamId !== String(teamId) || (r.season !== season && r.season !== season - 1)) continue;
    if (!teamFacts.has(`${r.eventId}:${teamId}`)) continue;
    if (r.played) inn.push(r.eventId); else if (!r.coachDnp) out.push(r.eventId);
  }
  return { inn, out };
}
const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Raw (unshrunk) WOWY deltas for one absentee: team residuals and each available teammate's stats, with counts. */
function wowy(pid, teamId, t, season, teammates) {
  const { inn, out } = splits(pid, teamId, t, season);
  const tf = (ids, k) => avg(ids.map((e) => teamFacts.get(`${e}:${teamId}`)[k]));
  const team = inn.length && out.length ? { nOut: out.length, nIn: inn.length, off: tf(out, "offRes") - tf(inn, "offRes"), def: tf(out, "defRes") - tf(inn, "defRes"), mar: tf(out, "marRes") - tf(inn, "marRes") } : null;
  const players = {};
  for (const y of teammates) {
    const li = inn.map((e) => lineOf(e, y, teamId)).filter(Boolean), lo = out.map((e) => lineOf(e, y, teamId)).filter(Boolean);
    if (!li.length || !lo.length) continue;
    players[y] = { nOut: lo.length, d: Object.fromEntries(STATS.map((k) => [k, avg(lo.map((l) => l[k])) - avg(li.map((l) => l[k]))])) };
  }
  return { team, players };
}

/** v1's expected per-player line for a pool: water-filled minutes (raw^MINUTES_POWER weights, as the engine) × own rates. */
function v1Lines(profile) {
  const ps = profile.players;
  const raw = ps.map((p) => Math.pow(Math.max(0, p.minutesMean * p.playRate), V1_PARAMS.MINUTES_POWER));
  const shares = waterFill(raw, REGULATION_MINUTES, PLAYER_CAP_REGULATION);
  /* the engine fills draws of minutes; the expected minutes are approximated by filling the expected raw minutes */
  return new Map(ps.map((p, i) => { const m = shares[i]; const r = p.rates; return [p.providerAthleteId, { minutes: m, fga: m * ((r.threePa ?? 0) + (r.twoPa ?? 0)), fta: m * (r.fta ?? 0), pts: m * r.pts, reb: m * r.reb, ast: m * r.ast, stocks: null }]; }));
}

/* ── per-game inputs ── */
const sched = corpusRows.filter((r) => r.season === SEASON && r.phase === 2).sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
const start = Date.parse(sched[0].dateUtc);
const sample = sched.filter((r) => Date.parse(r.dateUtc) >= start + MIN_DAYS * 86400_000 && boxById.get(String(r.providerEventId))?.boxscoreAvailable && lines.has(String(r.providerEventId))).slice(0, GAMES);
const t0 = Date.now();
const recs = [];
for (const g of sample) {
  const id = String(g.providerEventId), doc = boxById.get(id), now = g.dateUtc, t = Date.parse(now);
  const homeId = doc.teams.find((x) => x.homeAway === "home")?.providerTeamId, awayId = doc.teams.find((x) => x.homeAway === "away")?.providerTeamId;
  if (!homeId || !awayId) continue;
  const ratings = buildTeamRatings(corpusRows, { throughDateUtc: now, targetSeason: SEASON });
  const rh = ratingFor(ratings, g.home).rating, ra = ratingFor(ratings, g.away).rating;
  const league = leagueMeans(index, { asOf: now });
  const side = (tid) => {
    const proxy = historicalRosterProxy(index, tid, { asOf: now });
    const out = injuryDnpIds(doc, tid);
    const absent = proxy.filter((p) => out.has(p));
    const ref = buildSideProfile(index, { teamId: tid, rosterRows: proxy.map((p) => ({ providerAthleteId: p, availability: "unknown" })), asOf: now, league });
    const avail = buildSideProfile(index, { teamId: tid, rosterRows: proxy.map((p) => ({ providerAthleteId: p, availability: out.has(p) ? "out" : "unknown" })), asOf: now, league });
    const mates = avail.players.map((p) => p.providerAthleteId);
    const effects = absent.map((x) => ({ x, ...wowy(x, tid, t, SEASON, mates) }));
    const actual = new Map(mates.map((y) => [y, lineOf(id, y, tid)]).filter(([, l]) => l && l.minutes > 0));
    return { tid, absent, ref, avail, effects, actual };
  };
  let H, A;
  try { H = side(homeId); A = side(awayId); if (H.avail.players.length < 5 || A.avail.players.length < 5) continue; } catch { continue; }
  const ls = lines.get(id);
  const regH = ls.home.slice(0, 4).reduce((s, x) => s + x, 0), regA = ls.away.slice(0, 4).reduce((s, x) => s + x, 0);
  recs.push({ id, g, now, homeId, awayId, rh, ra, league, H, A, home: g.neutralSite === true ? 0 : 1, regMargin: regH - regA, ftHome: g.ftHome, ftAway: g.ftAway });
}
console.log(`${MODE} season ${SEASON}: ${recs.length} games · with an absence ${recs.filter((r) => r.H.absent.length || r.A.absent.length).length} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);

const shrink = (n, k) => n / (n + k);
const teamShift = (s, k) => s.effects.reduce((a, e) => (e.team ? { off: a.off + shrink(e.team.nOut, k) * e.team.off, def: a.def + shrink(e.team.nOut, k) * e.team.def, mar: a.mar + shrink(e.team.nOut, k) * e.team.mar } : a), { off: 0, def: 0, mar: 0 });
const marginShift = (r, k) => teamShift(r.H, k).mar - teamShift(r.A, k).mar;
/** Player-level predictions for every available teammate who played: v1 (avail water-fill) vs WOWY (ref water-fill + shrunk deltas). */
function playerRows(r, k) {
  const out = [];
  for (const s of [r.H, r.A]) {
    if (!s.absent.length) continue;
    const v1 = v1Lines(s.avail), ref = v1Lines(s.ref);
    for (const [y, act] of s.actual) {
      const b = v1.get(y), base = ref.get(y); if (!b || !base) continue;
      const w = {};
      for (const st of STATS) {
        if (st === "stocks") continue;
        let v = base[st];
        for (const e of s.effects) { const p = e.players[y]; if (p) v += shrink(p.nOut, k) * p.d[st]; }
        w[st] = Math.max(0, v);
      }
      out.push({ game: r.id, y, act, v1: b, wowy: w });
    }
  }
  return out;
}
const r4 = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(4)));
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

if (MODE === "fit") {
  const resid = recs.map((r) => r.regMargin - (r.home * V1_PARAMS.HCA_POINTS + V1_PARAMS.ELO_TO_MARGIN * (r.rh - r.ra)));
  const gameGrid = K_GRID.map((k) => ({ k, sse: r4(recs.reduce((s, r, i) => s + (resid[i] - marginShift(r, k)) ** 2, 0)) }));
  const playerGrid = K_GRID.map((k) => { const rows = recs.flatMap((r) => playerRows(r, k)); return { k, n: rows.length, sseMinutes: r4(rows.reduce((s, x) => s + (x.act.minutes - x.wowy.minutes) ** 2, 0)) }; });
  const kGame = gameGrid.reduce((a, b) => (b.sse < a.sse ? b : a)).k, kPlayer = playerGrid.reduce((a, b) => (b.sseMinutes < a.sseMinutes ? b : a)).k;
  const report = {
    schemaVersion: 1, artifact: "nba-v1-availability-wowy-fit", dataClass: "PRIVATE_RESEARCH", candidate: "nba-sim-v1-availability-wowy (M2b)", armed: false,
    fitSeason: "2023-24 (corpus season 2024), regular season, ≥ 30 days in",
    method: "empirical with/without (same team, current + previous corpus season, strictly before the game): team Elo-adjusted residuals and teammates' per-240 lines, mean(out) − mean(in), shrunk n_out/(n_out+K); K by grid over K_GRID (fixed before any number was seen)",
    availabilityProxy: "TIP-TIME PROXY — injury-type DNP in the box score (as M1/M2)",
    n: recs.length, gamesWithAbsence: recs.filter((r) => r.H.absent.length || r.A.absent.length).length,
    noShiftSSE: r4(resid.reduce((s, x) => s + x * x, 0)),
    K_GRID, gameGrid, playerGrid, K_GAME: kGame, K_PLAYER: kPlayer,
    gameLevelBeatsNoShift: Math.min(...gameGrid.map((x) => x.sse)) < r4(resid.reduce((s, x) => s + x * x, 0)),
    playerMinutesSSE_noShift: r4(recs.flatMap((r) => playerRows(r, Infinity)).reduce((s, x) => s + (x.act.minutes - x.wowy.minutes) ** 2, 0)),
    reading: "K_GAME at the grid's edge with gameLevelBeatsNoShift false means every shrinkage on the grid made the margin worse than no shift: the team-level with/without effect is not supported on the fit season",
    approval: "PENDING — research only; any arming needs founder approval (methodology-constants rule)",
  };
  console.log(JSON.stringify(report, null, 1));
  if (argv.includes("--write")) fs.writeFileSync(REPORT_FIT, JSON.stringify(report, null, 1) + "\n");
  process.exit(0);
}

/* ── dev (exploratory) ── */
const FIT = readJson(REPORT_FIT);
const kG = FIT.K_GAME, kP = FIT.K_PLAYER;
/* player level */
const prow = recs.flatMap((r) => playerRows(r, kP));
const byGame = new Map(); for (const x of prow) { if (!byGame.has(x.game)) byGame.set(x.game, []); byGame.get(x.game).push(x); }
const playerLevel = Object.fromEntries(STATS.filter((s) => s !== "stocks").map((st) => {
  const e = (x, arm) => Math.abs(x.act[st] - x[arm][st]);
  const diff = clusterBootstrap([...byGame.values()].map((xs) => xs.map((x) => e(x, "wowy") - e(x, "v1"))));
  return [st, { n: prow.length, games: byGame.size, maeV1: r4(mean(prow.map((x) => e(x, "v1")))), maeWowy: r4(mean(prow.map((x) => e(x, "wowy")))), absErr_wowy_minus_v1: { mean: diff.mean, ci95: [diff.lo, diff.hi] } }];
}));
/* game level */
const items = [];
let k = 0;
for (const r of recs) {
  const Hs = { name: r.g.home, providerTeamId: r.homeId, rating: { rating: r.rh }, profile: r.H.avail };
  const As = { name: r.g.away, providerTeamId: r.awayId, rating: { rating: r.ra }, profile: r.A.avail };
  const eloP = winProbability(r.rh, r.ra, { neutralSite: r.g.neutralSite === true });
  const common = { providerEventId: r.id, inputAsOf: r.now, neutralSite: r.g.neutralSite === true, home: Hs, away: As, league: r.league, eloWinProbability: eloP, simulations: SIMS, seed: `m1-${r.id}` };
  const shift = marginShift(r, kG);
  let base, cand;
  try { base = simulateGameV1(common); cand = shift === 0 ? base : simulateGameV1({ ...common, marginShift: shift }); } catch { continue; }
  const row = (o) => ({ p: o.sim.pHome, mMean: o.sim.margin.mean });
  items.push({ y: r.ftHome > r.ftAway ? 1 : 0, am: r.ftHome - r.ftAway, shift, eloP, b: row(base), c: row(cand), hOff: teamShift(r.H, kG).off, hDef: teamShift(r.H, kG).def, aOff: teamShift(r.A, kG).off, aDef: teamShift(r.A, kG).def });
  if (++k % 100 === 0) console.log(`  ${k}/${recs.length} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
const clampP = (p) => Math.min(1 - 1e-12, Math.max(1e-12, p));
const ll = (p, y) => -(y ? Math.log(clampP(p)) : Math.log(1 - clampP(p)));
const ece = (xs, get) => { const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 })); xs.forEach((it) => { const q = get(it); const bb = bins[Math.min(9, Math.floor(q * 10))]; bb.n++; bb.p += q; bb.y += it.y; }); return bins.reduce((s, bb) => s + (bb.n ? (bb.n / xs.length) * Math.abs(bb.p / bb.n - bb.y / bb.n) : 0), 0); };
const metricsOf = (get) => ({ n: items.length, logLoss: r4(mean(items.map((it) => ll(get(it), it.y)))), brier: r4(mean(items.map((it) => (get(it) - it.y) ** 2))), ece: r4(ece(items, get)) });
const paired = (xs, f) => { const bs = bootstrapStatistic(xs, (ys) => mean(ys.map(f))); return { mean: r4(mean(xs.map(f))), ci95: [bs.lo, bs.hi] }; };
const shifted = items.filter((it) => it.shift !== 0);
const report = {
  schemaVersion: 1, artifact: "nba-v1-availability-wowy-dev", dataClass: "PRIVATE_RESEARCH", label: "EXPLORATORY — development season 2024-25; not evidence for arming",
  candidate: "nba-sim-v1-availability-wowy (M2b)", armed: false, K_GAME: kG, K_PLAYER: kP, kSource: path.relative(path.resolve(APP, ".."), REPORT_FIT),
  availabilityProxy: "TIP-TIME PROXY (injury-type DNP in the box score)",
  playerLevel: { population: "available teammates who played, on sides with ≥ 1 pool absence; lines per 240 team player-minutes", v1Baseline: "water-filled expected minutes (raw^MINUTES_POWER) × own per-minute rates — an approximation of the engine's draw mean", stats: playerLevel },
  gameLevel: {
    simulations: SIMS, seedPolicy: "explicit m1-<eventId>, identical for both v1 arms (paired)",
    n: items.length, gamesShifted: shifted.length,
    shiftSummary: { meanAbs: r4(mean(shifted.map((it) => Math.abs(it.shift)))), p90Abs: r4([...shifted.map((it) => Math.abs(it.shift))].sort((a, b) => a - b)[Math.floor(0.9 * shifted.length)] ?? 0) },
    decomposition: { meanOffenceShift: r4(mean(shifted.map((it) => it.hOff - it.aOff))), meanDefenceShift: r4(mean(shifted.map((it) => it.hDef - it.aDef))), note: "home minus away; margin shift = offence − defence" },
    winner: { candidate: metricsOf((it) => it.c.p), v1Shift0: metricsOf((it) => it.b.p), elo: metricsOf((it) => it.eloP) },
    pairedDiffs: {
      logLoss_candidate_minus_v1: paired(items, (it) => ll(it.c.p, it.y) - ll(it.b.p, it.y)),
      logLoss_candidate_minus_elo: paired(items, (it) => ll(it.c.p, it.y) - ll(it.eloP, it.y)),
      brier_candidate_minus_v1: paired(items, (it) => (it.c.p - it.y) ** 2 - (it.b.p - it.y) ** 2),
      marginAbsErr_candidate_minus_v1: paired(items, (it) => Math.abs(it.c.mMean - it.am) - Math.abs(it.b.mMean - it.am)),
    },
    shiftedGamesOnly: { n: shifted.length, logLoss_candidate_minus_v1: paired(shifted, (it) => ll(it.c.p, it.y) - ll(it.b.p, it.y)), marginAbsErr_candidate_minus_v1: paired(shifted, (it) => Math.abs(it.c.mMean - it.am) - Math.abs(it.b.mMean - it.am)) },
  },
  note: "Lower is better for every loss. A direction is claimed only where the 95% interval excludes 0. Development data only; 2025-26 never loaded.",
};
console.log(JSON.stringify(report, null, 1));
if (argv.includes("--write")) fs.writeFileSync(REPORT_DEV, JSON.stringify(report, null, 1) + "\n");
