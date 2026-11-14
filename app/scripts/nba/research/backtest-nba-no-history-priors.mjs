/**
 * RESEARCH_NOT_PUBLISHED — historical backtest of the two NBA "no-history" gaps (returners, rookies) on corpus seasons only.
 * NBA REGULAR SEASON — RESEARCH · dataClass PRIVATE_RESEARCH · productEligible: false. Evidence for founder decisions D1
 * (arm the v0.4 lagged role prior?) and D2 (a preseason-role prior for rookies, option C?). It decides, arms and tunes nothing.
 *
 *   cd app && npx tsx scripts/nba/research/backtest-nba-no-history-priors.mjs [--json <file outside the repository>]
 *
 * INPUTS (committed, read-only, no network): data/internal/research/nba/corpus-v1.json and the corpus box scores
 * data/internal/research/nba/boxscores/<providerEventId>.json. Only the box scores of corpus rows in seasons 2024–2026
 * (2023-24 … 2025-26) are opened, and every opened doc must be dated before HISTORY_END_UTC (the first instant of the
 * 2026-27 corpus season) or the run throws. No 2026-27 box score, roster, injury feed, line or outcome is read.
 *
 * DESIGN (docs/nba/NBA_PROJECTION_COVERAGE_GAP_2026-10-22.md §12):
 *   - Backtest seasons S = 2025 (2024-25) and S = 2026 (2025-26). For each team, its first FIRST_N regular-season (phase 2)
 *     games; each is forecast at that game's dateUtc with box scores strictly before it (the models' own cutoff rule).
 *   - PROXY ROSTER = every athlete listed for that team in that game's box score, DNPs included. It is biased: it knows who
 *     dressed (or was at least listed) that night, which a pre-tip roster capture does not; it never contains a player who
 *     was waived before tip. It is passed to the real pools as a roster capture with asOf = the forecast instant; injuries null.
 *   - The REAL pools run unchanged: gatePool (v0.1, reference), gatePoolV03, gatePoolV04, then prepareRoster /
 *     prepareRosterV03 (the team normalisation the engines apply). Nothing is re-implemented.
 *   - CLASSES (relative to S, appearance = a box-score line with integer minutes > 0, not DNP):
 *       ROOKIE_PROXY  no appearance in any corpus season < S, any phase (S = 2025 is contaminated: 2023-24 is the only
 *                     earlier corpus season, so a player who missed 2023-24 looks like a rookie; S = 2026 is primary);
 *       RETURNER      < MIN_GAMES_FOR_RATES (3) regular-season appearances in S−1 and >= 3 in S−2 (exactly v0.4's lag
 *                     condition at MAX_PRIOR_LAG = 2; S = 2025 has none by construction, 2022-23 is not in the corpus);
 *       VETERAN       everyone else (category c).
 *   - OUTCOME: actual minutes; a COACH'S DECISION DNP = 0; any other DNP (injury, illness, rest, suspension, not with team,
 *     did not dress …) and non-integer minutes are EXCLUDED from errors and counted.
 *   - FORECASTS scored: "uncond" = normalised expectedMinutes × playRate (the v0.3/v0.4 engine's expected minutes including
 *     its coach's-decision probability, the like-for-like target for CD = 0); "cond" = normalised expectedMinutes
 *     (conditional on playing, what the product displays). v0.1 has no play rate: its normalised minutes only.
 *     D2's predictor is the raw preseason minutes per appearance (a PROXY for a preseason prior's information, not a model).
 *   - INTERVALS: percentile bootstrap, BOOTSTRAP.resamples resamples, clustered by athlete within a season (first-5 rows of
 *     one athlete are resampled together), one mulberry32 stream per metric seeded seed XOR fnv1a32(metric label).
 *     A difference is described as a difference only when its 95 % interval excludes 0.
 *   - No constant here was chosen from these results: MIN_GAMES_FOR_RATES and MAX_PRIOR_LAG are the models' own, the rookie
 *     rule (>= 2 preseason appearances at >= 15 mpg) is measure-nba-projection-coverage.mjs's PRIMARY rookie branch, and
 *     FIRST_N / the bootstrap settings were fixed in the task brief before any result was computed.
 *
 * Output: a text report on stdout; --json writes the same report as JSON. Neither contains a wall-clock value.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { indexRoleHistory, gatePoolV03 } from "../../../src/lib/sports/nba/minutes-model-v03.mjs";
import { indexRoleHistoryV04, gatePoolV04, PARAMS_V04 } from "../../../src/lib/sports/nba/minutes-model-v04.mjs";
import { gatePool } from "../../../src/lib/sports/nba/roster-gated-pool.mjs";
import { MIN_GAMES_FOR_RATES } from "../../../src/lib/sports/nba/minutes-model.mjs";
import { prepareRoster, fnv1a32, mulberry32 } from "../../../src/lib/sports/nba/game-sim.mjs";
import { prepareRosterV03 } from "../../../src/lib/sports/nba/game-sim-v03.mjs";
import { inPopulation, corpusSeasonOfDate } from "../../../src/lib/sports/nba/sim-v1-profile.mjs";

export const BACKTEST_VERSION = "nba-no-history-priors-backtest-1";
export const HISTORICAL_SEASONS = Object.freeze([2024, 2025, 2026]);
/** First instant of corpus season 2027 (2026-27) under corpusSeasonOfDate (September → next season). Nothing at or after it is read. */
export const HISTORY_END_UTC = "2026-09-01T00:00:00.000Z";
export const BACKTEST_SEASONS = Object.freeze([2025, 2026]);
export const FIRST_N = 5;
/** The coverage-gap doc's rotation rule for a player with no qualifying season (measure-nba-projection-coverage.mjs, PRIMARY). */
export const ROOKIE_PRESEASON_RULE = Object.freeze({ minApps: 2, minMpg: 15 });
export const BOOTSTRAP = Object.freeze({ resamples: 2000, seed: 1729, level: 0.95, cluster: "athlete within season" });
/**
 * REPORTING CONVENTION (not a model constant; it can only suppress a claim, never create one): no interval below 2
 * clusters; below 10 clusters the interval is printed but flagged unreliable and never read as a difference. Set after
 * seeing that 2025-26 has only 4 returners, where a 4-cluster percentile bootstrap is not a usable interval.
 */
export const REPORTING = Object.freeze({ minClustersForInterval: 2, fewClustersBelow: 10 });
export const CLASSES = Object.freeze({ ROOKIE: "ROOKIE_PROXY", RETURNER: "RETURNER", VETERAN: "VETERAN" });

const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(3)));
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const played = (p) => !p.didNotPlay && Number.isInteger(p.minutes) && p.minutes > 0;

/* ───────────────────────────── inputs ───────────────────────────── */

/** Throws unless the doc is a historical (<= 2025-26) box score. The single gate every opened doc passes. */
export function assertHistorical(d) {
  const t = Date.parse(d?.dateUtc ?? "");
  if (!Number.isFinite(t)) throw new Error(`backtest: box score ${d?.providerEventId} has no dateUtc`);
  const s = Number.isInteger(d.season) ? d.season : corpusSeasonOfDate(d.dateUtc);
  if (t >= Date.parse(HISTORY_END_UTC) || !HISTORICAL_SEASONS.includes(s) || corpusSeasonOfDate(d.dateUtc) > HISTORICAL_SEASONS.at(-1)) {
    throw new Error(`backtest: box score ${d.providerEventId} (${d.dateUtc}, season ${d.season}) is not historical — 2026-27 data is never read`);
  }
  return d;
}

/**
 * Read corpus-v1 and ONLY the box scores of its 2024–2026 rows, in id order. A file for any other event (e.g. a 2026-27
 * game) is never opened. Returns the docs plus a deterministic input fingerprint (no paths, no times).
 */
export function loadHistoricalInputs(nbaDir) {
  const corpusBuf = fs.readFileSync(path.join(nbaDir, "corpus-v1.json"));
  const corpus = JSON.parse(corpusBuf.toString("utf8"));
  const rows = (corpus.rows ?? []).filter((r) => HISTORICAL_SEASONS.includes(r.season));
  const ids = [...new Set(rows.map((r) => String(r.providerEventId)))].sort(byStr);
  const h = crypto.createHash("sha256");
  const docs = [], missing = [], opened = [];
  for (const id of ids) {
    const f = path.join(nbaDir, "boxscores", `${id}.json`);
    if (!fs.existsSync(f)) { missing.push(id); continue; }
    const buf = fs.readFileSync(f);
    opened.push(id);
    h.update(id).update("\0").update(buf);
    docs.push(assertHistorical(JSON.parse(buf.toString("utf8"))));
  }
  const maxDateUtc = docs.reduce((m, d) => (Date.parse(d.dateUtc) > Date.parse(m ?? "1970-01-01T00:00Z") ? d.dateUtc : m), null);
  return {
    boxscores: docs,
    opened,
    inputs: {
      corpusSha256: crypto.createHash("sha256").update(corpusBuf).digest("hex"),
      corpusRowsHistorical: rows.length,
      corpusRowsOtherSeasons: (corpus.rows ?? []).length - rows.length,
      boxscoresRead: docs.length,
      boxscoresMissing: missing,
      boxscoresSha256: h.digest("hex"),
      maxDateUtcRead: maxDateUtc,
    },
  };
}

/* ───────────────────────────── classification ───────────────────────────── */

/** athleteId → { name, playedSeasons: Set (any phase), regApps: { season: n } }. Pure. */
export function buildHistory(boxscores) {
  const m = new Map();
  for (const d of boxscores) {
    if (!d?.boxscoreAvailable) continue;
    for (const p of d.players ?? []) {
      if (p?.providerAthleteId == null || !played(p)) continue;
      const id = String(p.providerAthleteId);
      let rec = m.get(id);
      if (!rec) { rec = { name: p.name ?? null, playedSeasons: new Set(), regApps: {} }; m.set(id, rec); }
      rec.playedSeasons.add(d.season);
      if (inPopulation(d.phase, "regular")) rec.regApps[d.season] = (rec.regApps[d.season] ?? 0) + 1;
    }
  }
  return m;
}

/** The class of one athlete relative to backtest season S. Pure. */
export function classifyAthlete(hist, S) {
  if (!hist || ![...hist.playedSeasons].some((s) => s < S)) return CLASSES.ROOKIE;
  const a1 = hist.regApps[S - 1] ?? 0, a2 = hist.regApps[S - 2] ?? 0;
  if (a1 < MIN_GAMES_FOR_RATES && a2 >= MIN_GAMES_FOR_RATES) return CLASSES.RETURNER;
  return CLASSES.VETERAN;
}

/** Scored outcome of one box-score line: CD DNP → 0; any other DNP / null minutes → excluded. Pure. */
export function outcomeOf(p) {
  if (p.didNotPlay) return /COACH/i.test(String(p.dnpReason ?? "")) ? { actual: 0, kind: "dnp-coach" } : { actual: null, kind: "dnp-other" };
  if (!Number.isInteger(p.minutes)) return { actual: null, kind: "null-minutes" };
  return { actual: p.minutes, kind: "played" };
}

/** Does a preseason record meet the doc's rookie rotation rule? */
export const qualifiesPreseason = (pre) => pre.apps >= ROOKIE_PRESEASON_RULE.minApps && pre.mpg != null && pre.mpg >= ROOKIE_PRESEASON_RULE.minMpg;

/* ───────────────────────────── statistics ───────────────────────────── */

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const streamFor = (label) => mulberry32((BOOTSTRAP.seed ^ Number.parseInt(fnv1a32(label), 16)) >>> 0);
const clustersOf = (rows) => {
  const m = new Map();
  for (const r of rows) { if (!m.has(r.c)) m.set(r.c, []); m.get(r.c).push(r.v); }
  return [...m.keys()].sort(byStr).map((k) => m.get(k));
};
function bootstrap(groups, stat, label) {
  // groups: arrays of clusters; each resample draws every group's clusters independently, with replacement
  const rng = streamFor(label);
  const out = [];
  for (let b = 0; b < BOOTSTRAP.resamples; b += 1) {
    const draws = groups.map((cl) => { const v = []; for (let i = 0; i < cl.length; i += 1) v.push(...cl[Math.floor(rng() * cl.length)]); return v; });
    out.push(stat(...draws));
  }
  out.sort((a, b) => a - b);
  const a = (1 - BOOTSTRAP.level) / 2;
  return [r3(quantile(out, a)), r3(quantile(out, 1 - a))];
}
const mae = (v) => mean(v.map(Math.abs));
const excludesZero = (ci) => ci[0] != null && (ci[0] > 0 || ci[1] < 0);
const NO_CI = [null, null];
const few = (k) => k < REPORTING.fewClustersBelow;

/** rows [{ c: cluster, v: error = forecast − actual }] → n, MAE and mean signed error with cluster-bootstrap intervals. */
export function errorStats(rows, label) {
  const cl = clustersOf(rows);
  const v = rows.map((r) => r.v);
  if (!v.length) return { n: 0, clusters: 0, fewClusters: true, mae: null, maeCi: NO_CI, bias: null, biasCi: NO_CI };
  const ok = cl.length >= REPORTING.minClustersForInterval;
  return { n: v.length, clusters: cl.length, fewClusters: few(cl.length), mae: r3(mae(v)), maeCi: ok ? bootstrap([cl], mae, `${label}|mae`) : NO_CI, bias: r3(mean(v)), biasCi: ok ? bootstrap([cl], mean, `${label}|bias`) : NO_CI };
}
/** Paired: rows [{ c, v: |e_A| − |e_B| }] → mean with interval. */
function pairedStats(rows, label) {
  const cl = clustersOf(rows);
  const v = rows.map((r) => r.v);
  if (!v.length) return { n: 0, clusters: 0, fewClusters: true, meanAbsErrDiff: null, ci: NO_CI, distinguishable: false };
  const ci = cl.length >= REPORTING.minClustersForInterval ? bootstrap([cl], mean, `${label}|paired`) : NO_CI;
  return { n: v.length, clusters: cl.length, fewClusters: few(cl.length), meanAbsErrDiff: r3(mean(v)), ci, distinguishable: !few(cl.length) && excludesZero(ci) };
}
/** Unpaired: MAE(A) − MAE(B), independent cluster resampling of each group. */
function maeDiff(rowsA, rowsB, label) {
  const cA = clustersOf(rowsA), cB = clustersOf(rowsB);
  const base = { nA: rowsA.length, nB: rowsB.length, clustersA: cA.length, clustersB: cB.length, fewClusters: few(Math.min(cA.length, cB.length)) };
  if (!rowsA.length || !rowsB.length) return { ...base, maeDiff: null, ci: NO_CI, distinguishable: false };
  const ci = Math.min(cA.length, cB.length) >= REPORTING.minClustersForInterval ? bootstrap([cA, cB], (a, b) => mae(a) - mae(b), `${label}|maediff`) : NO_CI;
  return { ...base, maeDiff: r3(mae(rowsA.map((r) => r.v)) - mae(rowsB.map((r) => r.v))), ci, distinguishable: !base.fewClusters && excludesZero(ci) };
}
const dist = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, median: r3(quantile(s, 0.5)), p25: r3(quantile(s, 0.25)), p75: r3(quantile(s, 0.75)), min: r3(s[0] ?? null), max: r3(s.at(-1) ?? null) };
};
const countBy = (xs, f) => xs.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => byStr(a, b)));

/* ───────────────────────────── the backtest ───────────────────────────── */

const stripLag = ({ priorSeasonUsed, priorLagSeasons, ...rest }) => rest;
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Every athlete-game record of the backtest (pure over the given docs). */
export function buildRecords(boxscores, { seasons = BACKTEST_SEASONS, firstN = FIRST_N } = {}) {
  boxscores.forEach(assertHistorical);
  const docs = boxscores.filter((d) => d?.boxscoreAvailable)
    .slice().sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || byStr(String(a.providerEventId), String(b.providerEventId)));
  const history = buildHistory(docs);
  const records = [], identity = { rowsCompared: 0, rowMismatches: [], teamGamesWithoutLagged: 0, normalisedIdenticalWithoutLagged: 0, laggedVsReturnerMismatches: [] };
  const teamGames = [];
  for (const S of seasons) {
    const pre = new Map(); // athleteId → [{ t, minutes }] for S's preseason
    for (const d of docs) {
      if (d.season !== S || d.phase !== 1) continue;
      for (const p of d.players ?? []) if (p?.providerAthleteId != null && played(p)) {
        const id = String(p.providerAthleteId);
        if (!pre.has(id)) pre.set(id, []);
        pre.get(id).push({ t: Date.parse(d.dateUtc), minutes: p.minutes });
      }
    }
    const byTeam = new Map();
    for (const d of docs) {
      if (d.season !== S || d.phase !== 2) continue;
      for (const t of d.teams ?? []) { const id = String(t.providerTeamId); if (!byTeam.has(id)) byTeam.set(id, []); byTeam.get(id).push(d); }
    }
    for (const teamId of [...byTeam.keys()].sort((a, b) => Number(a) - Number(b))) {
      byTeam.get(teamId).slice(0, firstN).forEach((d, i) => teamGames.push({ S, teamId, game: i + 1, doc: d, pre }));
    }
  }
  const cache = new Map(); // instant → indexes
  for (const tg of teamGames) {
    const { S, teamId, game, doc, pre } = tg;
    const instant = doc.dateUtc;
    if (!cache.has(instant)) cache.set(instant, { i3: indexRoleHistory(docs, { asOfDateUtc: instant }), i4: indexRoleHistoryV04(docs, { asOfDateUtc: instant }), v01: new Map() });
    const c = cache.get(instant);
    const seen = new Set();
    const lines = (doc.players ?? []).filter((p) => p?.providerAthleteId != null && String(p.providerTeamId) === teamId && !seen.has(String(p.providerAthleteId)) && seen.add(String(p.providerAthleteId)));
    const rosters = { artifact: "backtest-proxy-roster", asOf: instant, teams: [{ providerTeamId: teamId, state: "CAPTURED", capturedAt: instant, players: lines.map((p) => ({ providerAthleteId: String(p.providerAthleteId), displayName: p.name ?? null, position: null, experienceYears: null })) }] };
    const args = { rosters, providerTeamId: teamId, boxscores: docs, asOfDateUtc: instant, injuries: null };
    const g1 = gatePool({ ...args, teamMinutesCache: c.v01 });
    const g3 = gatePoolV03({ ...args, roleIndex: c.i3 });
    const g4 = gatePoolV04({ ...args, roleIndex: c.i4 });
    for (const g of [g1, g3, g4]) if (g.state !== "GATED") throw new Error(`backtest: ${teamId} @ ${instant} pool ${g.state} ${g.reason}`);
    const p1 = new Map(prepareRoster(g1).players.map((p) => [p.providerAthleteId, p]));
    const q3 = prepareRosterV03(g3).players, q4 = prepareRosterV03(g4).players;
    const p3 = new Map(q3.map((p) => [p.providerAthleteId, p])), p4 = new Map(q4.map((p) => [p.providerAthleteId, p]));
    const rows3 = new Map(g3.rows.map((r) => [r.providerAthleteId, r]));
    const rows4 = new Map(g4.rows.map((r) => [r.providerAthleteId, r]));
    const laggedHere = new Set(g4.rows.filter((r) => r.priorLagSeasons > 1).map((r) => r.providerAthleteId));
    // v0.4 == v0.3 for every non-lagged athlete (raw pool row), and, in a team-game with no lagged athlete, after normalisation too
    for (const [id, r4] of rows4) {
      if (laggedHere.has(id)) continue;
      identity.rowsCompared += 1;
      if (!sameJson(stripLag(r4), rows3.get(id))) identity.rowMismatches.push({ S, teamId, instant, id });
    }
    if (!laggedHere.size) { identity.teamGamesWithoutLagged += 1; if (sameJson(q3, q4)) identity.normalisedIdenticalWithoutLagged += 1; }
    const t = Date.parse(instant);
    for (const p of lines) {
      const id = String(p.providerAthleteId);
      const cls = classifyAthlete(history.get(id), S);
      if ((cls === CLASSES.RETURNER) !== laggedHere.has(id)) identity.laggedVsReturnerMismatches.push({ S, teamId, instant, id, cls, lagged: laggedHere.has(id) });
      const ps = (pre.get(id) ?? []).filter((x) => x.t < t);
      const preRec = { apps: ps.length, mpg: ps.length ? r3(ps.reduce((s, x) => s + x.minutes, 0) / ps.length) : null };
      const fam = (m, withPlayRate) => {
        const x = m.get(id);
        if (!x) return { projected: false, cond: null, uncond: null };
        return { projected: true, cond: x.expectedMinutes, uncond: withPlayRate ? r3(x.expectedMinutes * x.playRate) : null, playRate: withPlayRate ? x.playRate : null, role: x.roleMinutes ?? null };
      };
      const h = history.get(id);
      records.push({
        S, teamId, game, eventId: String(doc.providerEventId), instant, id, name: p.name ?? null, cls,
        regAppsPrior: h?.regApps?.[S - 1] ?? 0, regAppsPrior2: h?.regApps?.[S - 2] ?? 0,
        ...outcomeOf(p), dnpReason: p.didNotPlay ? (p.dnpReason ?? null) : null,
        v01: fam(p1, false), v03: fam(p3, true), v04: { ...fam(p4, true), lagged: laggedHere.has(id), priorSeasonUsed: rows4.get(id)?.priorSeasonUsed ?? null },
        teamHasLagged: laggedHere.size > 0,
        pre: preRec, preQualifies: qualifiesPreseason(preRec),
      });
    }
  }
  return { records, identity, teamGames: teamGames.length, instants: cache.size };
}

/** Aggregate the records into the D1 / D2 evidence. Pure, deterministic. */
export function summarise({ records, identity, teamGames, instants }, { seasons = BACKTEST_SEASONS } = {}) {
  const scopes = { opener: (r) => r.game === 1, first5: () => true };
  const err = (rows, f) => rows.filter((r) => r.actual != null && f(r) != null).map((r) => ({ c: r.id, v: f(r) - r.actual }));
  const excluded = (rows) => sortObj(countBy(rows.filter((r) => r.actual == null), (r) => r.kind));
  const out = { seasons: {} };
  for (const S of seasons) {
    const rs = records.filter((r) => r.S === S);
    const s = { D1: {}, D2: {}, coverage: {} };
    for (const [scope, keep] of Object.entries(scopes)) {
      const R = rs.filter(keep);
      // coverage by class
      for (const cls of Object.values(CLASSES)) {
        const C = R.filter((r) => r.cls === cls);
        (s.coverage[scope] ??= {})[cls] = { athleteGames: C.length, athletes: new Set(C.map((r) => r.id)).size, v01Projected: C.filter((r) => r.v01.projected).length, v03Projected: C.filter((r) => r.v03.projected).length, v04Projected: C.filter((r) => r.v04.projected).length };
      }
      // D1: returners under v0.4, veterans as benchmark, paired v0.4 vs v0.3
      const ret = R.filter((r) => r.cls === CLASSES.RETURNER), vet = R.filter((r) => r.cls === CLASSES.VETERAN);
      const ret4 = ret.filter((r) => r.v04.projected), vet4 = vet.filter((r) => r.v04.projected);
      const d1 = {
        returnerAthleteGames: ret.length,
        returnersLaggedByV04: ret.filter((r) => r.v04.lagged).length,
        v03Projected: ret.filter((r) => r.v03.projected).length,
        v04Projected: ret4.length,
        excludedReturner: excluded(ret4), excludedVeteran: excluded(vet4),
        returnerV04: { uncond: errorStats(err(ret4, (r) => r.v04.uncond), `${S}|${scope}|ret|v04|uncond`), cond: errorStats(err(ret4, (r) => r.v04.cond), `${S}|${scope}|ret|v04|cond`) },
        veteranV04: { uncond: errorStats(err(vet4, (r) => r.v04.uncond), `${S}|${scope}|vet|v04|uncond`), cond: errorStats(err(vet4, (r) => r.v04.cond), `${S}|${scope}|vet|v04|cond`) },
        veteranV01Cond: errorStats(err(vet.filter((r) => r.v01.projected), (r) => r.v01.cond), `${S}|${scope}|vet|v01|cond`),
        returnerMinusVeteranMae: { uncond: maeDiff(err(ret4, (r) => r.v04.uncond), err(vet4, (r) => r.v04.uncond), `${S}|${scope}|retvet|uncond`), cond: maeDiff(err(ret4, (r) => r.v04.cond), err(vet4, (r) => r.v04.cond), `${S}|${scope}|retvet|cond`) },
      };
      const both = ret.filter((r) => r.actual != null && r.v03.projected && r.v04.projected);
      d1.pairedV04MinusV03AbsErr = {
        uncond: pairedStats(both.map((r) => ({ c: r.id, v: Math.abs(r.v04.uncond - r.actual) - Math.abs(r.v03.uncond - r.actual) })), `${S}|${scope}|paired|uncond`),
        cond: pairedStats(both.map((r) => ({ c: r.id, v: Math.abs(r.v04.cond - r.actual) - Math.abs(r.v03.cond - r.actual) })), `${S}|${scope}|paired|cond`),
      };
      const mates = R.filter((r) => r.teamHasLagged && !r.v04.lagged && r.v03.projected && r.v04.projected);
      d1.teammateShift = { teamGamesWithLagged: new Set(R.filter((r) => r.teamHasLagged).map((r) => `${r.teamId}|${r.eventId}`)).size, condMinutes: dist(mates.map((r) => r.v04.cond - r.v03.cond)), uncondMinutes: dist(mates.map((r) => r.v04.uncond - r.v03.uncond)) };
      s.D1[scope] = d1;
      // D2: rookies' preseason mpg as a proxy predictor
      const rk = R.filter((r) => r.cls === CLASSES.ROOKIE), q = rk.filter((r) => r.preQualifies);
      const rkPlayed = rk.filter((r) => r.actual != null);
      const minutesFrom = (f) => rkPlayed.filter(f).reduce((a, r) => a + r.actual, 0);
      const totalMin = minutesFrom(() => true);
      const nonQ = (r) => !r.preQualifies;
      s.D2[scope] = {
        rookieAthleteGames: rk.length, rookieAthletes: new Set(rk.map((r) => r.id)).size,
        preseason: { zeroApps: rk.filter((r) => r.pre.apps === 0).length, oneApp: rk.filter((r) => r.pre.apps === 1).length, twoPlusUnder15: rk.filter((r) => r.pre.apps >= 2 && !r.preQualifies).length, qualifiers: q.length },
        v03Projected: rk.filter((r) => r.v03.projected).length, v04Projected: rk.filter((r) => r.v04.projected).length,
        excludedQualifier: excluded(q),
        qualifierOutcomeKinds: sortObj(countBy(q, (r) => r.kind)),
        qualifierPreseasonMpg: errorStats(err(q, (r) => r.pre.mpg), `${S}|${scope}|rookieq|pre`),
        qualifierMinusVeteranMae: { vsUncond: maeDiff(err(q, (r) => r.pre.mpg), err(vet4, (r) => r.v04.uncond), `${S}|${scope}|rkvet|uncond`), vsCond: maeDiff(err(q, (r) => r.pre.mpg), err(vet4, (r) => r.v04.cond), `${S}|${scope}|rkvet|cond`) },
        rookieActualMinutes: { total: totalMin, fromQualifiers: minutesFrom((r) => r.preQualifies), fromNonQualifiers: minutesFrom(nonQ), nonQualifierShare: totalMin ? r3(minutesFrom(nonQ) / totalMin) : null,
          nonQualifierBreakdown: { zeroApps: minutesFrom((r) => r.pre.apps === 0), oneApp: minutesFrom((r) => r.pre.apps === 1), twoPlusUnder15: minutesFrom((r) => r.pre.apps >= 2 && !r.preQualifies) },
          athleteGamesWithMinutes: { qualifiers: rkPlayed.filter((r) => r.preQualifies && r.actual > 0).length, nonQualifiers: rkPlayed.filter((r) => nonQ(r) && r.actual > 0).length } },
      };
    }
    s.D2.rookieCoverageByGame = [1, 2, 3, 4, 5].map((k) => { const x = rs.filter((r) => r.game === k && r.cls === CLASSES.ROOKIE); return { game: k, rookies: x.length, v03Projected: x.filter((r) => r.v03.projected).length, v04Projected: x.filter((r) => r.v04.projected).length, qualifiers: x.filter((r) => r.preQualifies).length }; });
    const detail = (r) => ({ team: r.teamId, name: r.name, id: r.id, regAppsPrior: r.regAppsPrior, regAppsPrior2: r.regAppsPrior2, priorSeasonUsed: r.v04.priorSeasonUsed, v03Cond: r.v03.cond, v04Cond: r.v04.cond, v04Uncond: r.v04.uncond, actual: r.actual, kind: r.kind, dnpReason: r.dnpReason });
    s.D1.openerReturners = rs.filter((r) => r.game === 1 && r.cls === CLASSES.RETURNER).map(detail);
    s.D1.returnersFirst5 = [...new Set(rs.filter((r) => r.cls === CLASSES.RETURNER).map((r) => r.id))].sort(byStr).map((id) => {
      const x = rs.filter((r) => r.id === id && r.cls === CLASSES.RETURNER), sc = x.filter((r) => r.actual != null);
      const m = (f) => { const v = sc.filter((r) => f(r) != null).map((r) => f(r) - r.actual); return v.length ? r3(mean(v)) : null; };
      return { id, name: x[0].name, team: x[0].teamId, games: x.length, scored: sc.length, actualMean: r3(mean(sc.map((r) => r.actual))), v04UncondMeanErr: m((r) => r.v04.uncond), v04CondMeanErr: m((r) => r.v04.cond), v03ProjectedGames: x.filter((r) => r.v03.projected).length, v03UncondMeanErr: m((r) => r.v03.uncond) };
    });
    s.D2.openerRookies = rs.filter((r) => r.game === 1 && r.cls === CLASSES.ROOKIE).map((r) => ({ team: r.teamId, name: r.name, id: r.id, preApps: r.pre.apps, preMpg: r.pre.mpg, qualifies: r.preQualifies, actual: r.actual, kind: r.kind }));
    out.seasons[S] = s;
  }
  return {
    marker: "RESEARCH_NOT_PUBLISHED", dataClass: "PRIVATE_RESEARCH", productEligible: false, version: BACKTEST_VERSION,
    params: { seasons, firstN: FIRST_N, reporting: { ...REPORTING }, minGamesForRates: MIN_GAMES_FOR_RATES, maxPriorLag: PARAMS_V04.MAX_PRIOR_LAG, rookieRule: { ...ROOKIE_PRESEASON_RULE }, bootstrap: { ...BOOTSTRAP }, historyEndUtc: HISTORY_END_UTC },
    run: { teamGames, instants, athleteGames: records.length },
    identity: { rowsCompared: identity.rowsCompared, rowMismatches: identity.rowMismatches.length, teamGamesWithoutLagged: identity.teamGamesWithoutLagged, normalisedIdenticalWithoutLagged: identity.normalisedIdenticalWithoutLagged, laggedVsReturnerMismatches: identity.laggedVsReturnerMismatches.length, mismatchSamples: identity.rowMismatches.slice(0, 5) },
    ...out,
  };
}

export function runBacktest(boxscores, opts = {}) { return summarise(buildRecords(boxscores, opts), opts); }

/* ───────────────────────────── report ───────────────────────────── */

const FEW = " (FEW CLUSTERS: interval unreliable, no claim)";
const ci = (c) => (c[0] == null ? "[no interval]" : `[${c.join(", ")}]`);
const fmtE = (e) => (e.n ? `n ${e.n} (${e.clusters} athletes) · MAE ${e.mae} ${ci(e.maeCi)} · signed ${e.bias} ${ci(e.biasCi)}${e.fewClusters ? FEW : ""}` : "n 0");
const fmtD = (d) => {
  const n = d.nA != null ? `n ${d.nA} (${d.clustersA} ath) vs ${d.nB} (${d.clustersB} ath)` : `n ${d.n} (${d.clusters} ath)`;
  const v = d.maeDiff !== undefined ? d.maeDiff : d.meanAbsErrDiff;
  if (v == null) return `${n} — not computable`;
  return `${n}: ${v} ${ci(d.ci)} ${d.distinguishable ? "interval excludes 0" : d.fewClusters ? "FEW CLUSTERS, no claim" : "not distinguishable at this n"}`;
};
export function formatReport(rep) {
  const L = [];
  L.push(`${rep.marker} · ${rep.version} · seasons ${rep.params.seasons.join(", ")} · first ${rep.params.firstN} games · bootstrap ${rep.params.bootstrap.resamples} × seed ${rep.params.bootstrap.seed} (${rep.params.bootstrap.cluster})`);
  if (rep.inputs) L.push(`inputs: corpus sha256 ${rep.inputs.corpusSha256.slice(0, 12)} · box scores read ${rep.inputs.boxscoresRead} (sha256 ${rep.inputs.boxscoresSha256.slice(0, 12)}, missing ${rep.inputs.boxscoresMissing.length}) · newest dateUtc read ${rep.inputs.maxDateUtcRead}`);
  L.push(`run: ${rep.run.teamGames} team-games · ${rep.run.instants} instants · ${rep.run.athleteGames} athlete-games`);
  L.push(`identity: v0.4 vs v0.3 non-lagged pool rows compared ${rep.identity.rowsCompared}, mismatches ${rep.identity.rowMismatches}; team-games without a lagged athlete ${rep.identity.teamGamesWithoutLagged}, normalised identical ${rep.identity.normalisedIdenticalWithoutLagged}; RETURNER ≠ v0.4-lagged ${rep.identity.laggedVsReturnerMismatches}`);
  for (const [S, s] of Object.entries(rep.seasons)) {
    L.push(`\n=== S = ${S} (${Number(S) - 1}-${String(S).slice(2)})`);
    for (const scope of ["opener", "first5"]) {
      L.push(`  [${scope}] coverage (athlete-games / athletes · v0.1 · v0.3 · v0.4 projected):`);
      for (const [cls, c] of Object.entries(s.coverage[scope])) L.push(`    ${cls.padEnd(13)} ${c.athleteGames} / ${c.athletes} · ${c.v01Projected} · ${c.v03Projected} · ${c.v04Projected}`);
      const d = s.D1[scope];
      L.push(`  [${scope}] D1 returners ${d.returnerAthleteGames} (lagged ${d.returnersLaggedByV04}) · v0.3 projected ${d.v03Projected} · v0.4 projected ${d.v04Projected} · excluded ${JSON.stringify(d.excludedReturner)}`);
      L.push(`    returner v0.4 uncond ${fmtE(d.returnerV04.uncond)}`);
      L.push(`    returner v0.4 cond   ${fmtE(d.returnerV04.cond)}`);
      L.push(`    veteran  v0.4 uncond ${fmtE(d.veteranV04.uncond)}`);
      L.push(`    veteran  v0.4 cond   ${fmtE(d.veteranV04.cond)}  (excluded ${JSON.stringify(d.excludedVeteran)})`);
      L.push(`    veteran  v0.1 cond   ${fmtE(d.veteranV01Cond)}`);
      L.push(`    MAE returner − veteran: uncond ${fmtD(d.returnerMinusVeteranMae.uncond)} · cond ${fmtD(d.returnerMinusVeteranMae.cond)}`);
      L.push(`    paired |e| v0.4 − v0.3 (returners projected by both): uncond ${fmtD(d.pairedV04MinusV03AbsErr.uncond)} · cond ${fmtD(d.pairedV04MinusV03AbsErr.cond)}`);
      L.push(`    teammates' shift (v0.4 − v0.3, ${d.teammateShift.teamGamesWithLagged} team-games with a lagged athlete): cond ${JSON.stringify(d.teammateShift.condMinutes)} · uncond ${JSON.stringify(d.teammateShift.uncondMinutes)}`);
      const r = s.D2[scope];
      L.push(`  [${scope}] D2 rookies ${r.rookieAthleteGames} (${r.rookieAthletes} athletes) · preseason ${JSON.stringify(r.preseason)} · v0.3 projected ${r.v03Projected} · v0.4 projected ${r.v04Projected} · excluded qualifiers ${JSON.stringify(r.excludedQualifier)} · qualifier outcomes ${JSON.stringify(r.qualifierOutcomeKinds)}`);
      L.push(`    qualifier preseason mpg ${fmtE(r.qualifierPreseasonMpg)}`);
      L.push(`    MAE qualifier − veteran v0.4: vs uncond ${fmtD(r.qualifierMinusVeteranMae.vsUncond)} · vs cond ${fmtD(r.qualifierMinusVeteranMae.vsCond)}`);
      L.push(`    rookie actual minutes ${JSON.stringify(r.rookieActualMinutes)}`);
    }
    L.push(`  rookie coverage by game: ${JSON.stringify(s.D2.rookieCoverageByGame)}`);
    L.push(`  opener returners (${s.D1.openerReturners.length}):`);
    for (const x of s.D1.returnersFirst5) L.push(`    first-5 ${x.team.padStart(2)} ${String(x.name).padEnd(24)} games ${x.games} scored ${x.scored} · actual mean ${x.actualMean} · v0.4 mean err uncond ${x.v04UncondMeanErr} cond ${x.v04CondMeanErr} · v0.3 projected ${x.v03ProjectedGames} mean err uncond ${x.v03UncondMeanErr}`);
    for (const x of s.D1.openerReturners) L.push(`    ${x.team.padStart(2)} ${String(x.name).padEnd(24)} S−1 ${x.regAppsPrior} S−2 ${x.regAppsPrior2} prior ${x.priorSeasonUsed} · v0.3 ${x.v03Cond} · v0.4 cond ${x.v04Cond} uncond ${x.v04Uncond} · actual ${x.actual} (${x.kind}${x.dnpReason ? `: ${x.dnpReason}` : ""})`);
  }
  return L.join("\n");
}

/* ───────────────────────────── CLI ───────────────────────────── */

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const ROOT = path.resolve(APP, "..");
  const i = process.argv.indexOf("--json");
  const jsonOut = i === -1 ? null : path.resolve(process.argv[i + 1] ?? "");
  if (jsonOut && (jsonOut === ROOT || jsonOut.startsWith(ROOT + path.sep))) { console.error(`REFUSED: --json ${jsonOut} is inside the repository`); process.exit(1); }
  const loaded = loadHistoricalInputs(path.join(ROOT, "data", "internal", "research", "nba"));
  const rep = { ...runBacktest(loaded.boxscores), inputs: loaded.inputs };
  console.log(formatReport(rep));
  if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(rep, null, 1) + "\n"); console.log(`\nwrote ${jsonOut} (RESEARCH_NOT_PUBLISHED)`); }
}
