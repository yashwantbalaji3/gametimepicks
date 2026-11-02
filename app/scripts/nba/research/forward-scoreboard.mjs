/**
 * RESEARCH_NOT_PUBLISHED — NBA FORWARD SCOREBOARD. dataClass PRIVATE_RESEARCH · productEligible: false · REPORT ONLY.
 *
 *   npx tsx scripts/nba/research/forward-scoreboard.mjs [--from 2026-10-22] [--to YYYY-MM-DD]
 *       [--families v0.1,v0.3,v1,v0.2,v0] [--root <fixture or checkout>] [--out <file.md>]
 *
 * Compares the champion (the first family named, v0.1 by default) with each other family that has write-once forward
 * receipts, on IDENTICAL games and IDENTICAL player rows. It promotes nothing: champion-challenger.mjs + preregistration
 * §6/§7 + a founder record decide that, and this report changes no forecast, lane, ledger or receipt.
 *
 * READS ONLY COMMITTED FILES (no network, no git history, no wall clock):
 *   receipts   data/internal/research/nba/<family dir>/forecasts/<date>.json   (each game's receipt is re-verified)
 *   box scores data/internal/research/nba/<dir>/boxscores/<eventId>.json       (final, regular season)
 *   finals     app/public/data/nba/results/finals-2026-27.json
 * Writes one .md and one .json: under the system temp directory by default, or at --out. Never under data/ or app/public/.
 * Output is a pure function of the input bytes: no generatedAt, fixed ordering, seeded bootstrap.
 *
 * POPULATIONS.
 *   played rows   the player played (minutes > 0) and BOTH families listed him. Minutes, medians and ranges are scored
 *                 here. v0.3 / v1 minutes and quantiles are conditional on playing, so this is the like-for-like row set.
 *   all rows      every player in the box score or listed by either family, on each team. A DNP is 0 actual minutes and
 *                 an unlisted player 0 projected minutes; a family's projected minutes are expected × playRate. This
 *                 charges each family for who it put on the floor, which played rows cannot see.
 *   starters /    the box score's starter flag; the sixth man is the bench player with the most minutes (ties: lowest
 *   sixth man     athlete id). Listed = a row with expected minutes > 0, not ruled out. Rotation = expected × playRate
 *                 ≥ the lane's own 10-minute publish cut (experimental-public-lane.mjs MIN_EXPECTED_MINUTES).
 *
 * PARTICIPATION. Brier of P(played) over all rows. v0.3 and v1 store a playRate. v0, v0.1 and v0.2 store none, so their
 * probability is IMPLIED: 1 for a listed player, 0 otherwise. That is what those rows assert, not a calibrated forecast.
 *
 * WORDS. Every loss is lower-is-better; every difference is challenger − champion on the same rows, with a game-clustered
 * percentile bootstrap. IMPROVES / WORSE need the 95% interval to exclude 0 over at least FEW_CLUSTERS_BELOW games
 * (champion-challenger.mjs, prereg §14 reporting note). Otherwise: NOT ESTABLISHED, or FEW GAMES (no claim). The overall
 * line is built from metric groups and never rests on one metric. Intervals are per metric, unadjusted for the number of
 * metrics; the report prints how many excluded 0 beside how many that many looks would produce by chance.
 *
 * FORWARD vs SEEN. A game is FORWARD for a pair only when its slate is on or after both families' armed dates (ARMED_FROM).
 * Anything earlier is SEEN, scored in its own block and never pooled with forward evidence.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

import { BOOTSTRAP_DEFAULTS, FEW_CLUSTERS_BELOW, clusterBootstrap, clustersSupportClaim, mulberry32 } from "../../../src/lib/sports/nba/champion-challenger.mjs";
import { coverageInterval } from "../../../src/lib/sports/nba/model-diagnostics.mjs";
import { boxscorePointsCheck, underReviewIds } from "../../../src/lib/sports/nba/experimental-grading-ledger.mjs";
import { receiptIntegrity } from "../../../src/lib/sports/nba/forecast-receipt.mjs";
import { MIN_EXPECTED_MINUTES } from "../../../src/lib/sports/nba/experimental-public-lane.mjs";
import { PREREG } from "../../../src/lib/sports/nba/grader-metrics.mjs";
import { protectedRoots } from "./report-nba-model-disagreement.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const REPO_ROOT = path.resolve(APP, "..");

export const SCOREBOARD_SCHEMA = "nba-forward-scoreboard@1";
export const DEFAULT_FROM = "2026-10-22"; // v0.3's armed start (prereg look 8, §14)
export const LARGE_ERROR_MINUTES = 15;
export const NOMINAL_COVERAGE = 0.8;
export const FAMILY_DIR = Object.freeze({ v0: "experimental", "v0.1": "experimental-v0.1", "v0.2": "experimental-v0.2", v1: "experimental-v1", "v0.3": "experimental-v0.3" });
export const DEFAULT_FAMILIES = Object.freeze(["v0.1", "v0.3", "v1", "v0.2", "v0"]);
/**
 * First slate each family's forward evidence can come from. 2026-10-20 is the first regular-season slate; every family
 * below except v0.3 was registered before it (prereg looks 3 and 4). v0.3 was armed for 2026-10-22 (look 8, §14), and the
 * look that designed it read the 2026-10-20 outcomes, so those slates are SEEN for any pair that includes v0.3.
 */
export const ARMED_FROM = Object.freeze({ v0: "2026-10-20", "v0.1": "2026-10-20", "v0.2": "2026-10-20", v1: "2026-10-20", "v0.3": "2026-10-22" });
const BOX_DIRS = ["experimental", "experimental-v0.1", "experimental-v0.2", "experimental-v1", "experimental-v0.3"];
const FINALS_FILE = "app/public/data/nba/results/finals-2026-27.json";
const STATS = [["pts", "pts"], ["reb", "reb"], ["ast", "ast"]];
const RANGE_MARKETS = ["pts", "reb", "ast", "minutes"];

export const WORD = Object.freeze({ IMPROVES: "IMPROVES", WORSE: "WORSE", NOT_ESTABLISHED: "NOT ESTABLISHED", FEW: "FEW GAMES, NO CLAIM", NONE: "NO INTERVAL" });
const GROUPS = Object.freeze({ minutes: "minutes accuracy", medians: "pts/reb/ast medians", participation: "participation", ranges: "range calibration", coverage: "starter and sixth-man coverage" });

/** kind: loss = lower wins; gain = higher wins; closer = |mean − target| lower wins (a bias or a calibration gap). */
export const METRICS = Object.freeze([
  { key: "minutesMae", label: "minutes MAE, played rows", kind: "loss", group: "minutes" },
  { key: "minutesBias", label: "minutes bias, distance from 0, played rows", kind: "closer", target: 0, group: "minutes" },
  { key: "largeError", label: `large-error rate (≥${LARGE_ERROR_MINUTES} min), played rows`, kind: "loss", group: "minutes" },
  { key: "minutesMaeAll", label: "minutes MAE, all rows (DNP + unlisted count)", kind: "loss", group: "minutes" },
  { key: "largeErrorAll", label: `large-error rate (≥${LARGE_ERROR_MINUTES} min), all rows`, kind: "loss", group: "minutes" },
  ...STATS.map(([k]) => ({ key: `${k}Mae`, label: `${k} median MAE, played rows`, kind: "loss", group: "medians" })),
  { key: "participationBrier", label: "participation Brier, all rows", kind: "loss", group: "participation" },
  ...RANGE_MARKETS.map((k) => ({ key: `${k}Range`, label: `${k} p10–p90 coverage, distance from ${NOMINAL_COVERAGE.toFixed(2)}`, kind: "closer", target: NOMINAL_COVERAGE, group: "ranges" })),
  { key: "starterListed", label: "starter coverage, listed", kind: "gain", group: "coverage" },
  { key: "starterRotation", label: `starter coverage, rotation (≥${MIN_EXPECTED_MINUTES} min)`, kind: "gain", group: "coverage" },
  { key: "sixthListed", label: "sixth-man coverage, listed", kind: "gain", group: "coverage" },
  { key: "sixthRotation", label: `sixth-man coverage, rotation (≥${MIN_EXPECTED_MINUTES} min)`, kind: "gain", group: "coverage" },
]);

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (x) => (isNum(x) ? Number(x.toFixed(4)) : null);
const meanOf = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

const listed = (r) => !!r && isNum(r.expectedMinutes) && r.expectedMinutes > 0 && r.availability !== "out";
/** P(played): the stored playRate, else what the row asserts (1 if listed), else 0. */
export const participationOf = (r) => (!listed(r) ? 0 : isNum(r.playRate) ? r.playRate : 1);
/** Projected minutes before knowing whether he plays: expected × playRate (conditional families), else expected. */
export const unconditionalMinutes = (r) => (listed(r) ? r.expectedMinutes * (isNum(r.playRate) ? r.playRate : 1) : 0);
const inside80 = (q, y) => (isNum(q?.p10) && isNum(q?.p90) ? (y >= q.p10 && y <= q.p90 ? 1 : 0) : null);

/** Game-clustered percentile bootstrap of |mean(b) − t| − |mean(a) − t|, resampling games, as clusterBootstrap does. */
export function closerBootstrap(clusters, target, { B = BOOTSTRAP_DEFAULTS.B, seed = BOOTSTRAP_DEFAULTS.seed, alpha = BOOTSTRAP_DEFAULTS.alpha } = {}) {
  const cs = clusters.map((c) => c.filter(([x, y]) => isNum(x) && isNum(y))).filter((c) => c.length);
  const sa = cs.map((c) => c.reduce((s, [x]) => s + x, 0));
  const sb = cs.map((c) => c.reduce((s, [, y]) => s + y, 0));
  const ns = cs.map((c) => c.length);
  const n = ns.reduce((s, x) => s + x, 0);
  if (!cs.length) return { n: 0, clusters: 0, a: null, b: null, mean: null, lo: null, hi: null };
  const sumOf = (xs) => xs.reduce((s, x) => s + x, 0);
  const a = sumOf(sa) / n, b = sumOf(sb) / n;
  const gap = (x, y) => Math.abs(y - target) - Math.abs(x - target);
  const base = { n, clusters: cs.length, a: r4(a), b: r4(b), mean: r4(gap(a, b)) };
  if (cs.length < 2) return { ...base, lo: null, hi: null };
  const rnd = mulberry32(seed);
  const stats = new Float64Array(B);
  for (let i = 0; i < B; i += 1) {
    let x = 0, y = 0, k = 0;
    for (let c = 0; c < cs.length; c += 1) { const j = Math.floor(rnd() * cs.length); x += sa[j]; y += sb[j]; k += ns[j]; }
    stats[i] = gap(x / k, y / k);
  }
  stats.sort();
  const q = (p) => stats[Math.min(B - 1, Math.max(0, Math.floor(p * B)))];
  return { ...base, lo: r4(q(alpha / 2)), hi: r4(q(1 - alpha / 2)) };
}

/** Verdict word from a challenger − champion interval. Lower wins for loss and closer; higher wins for gain. */
export function verdictOf({ lo, hi, clusters }, kind, opts = {}) {
  if (lo == null || hi == null) return WORD.NONE;
  if (!clustersSupportClaim(clusters, opts)) return WORD.FEW;
  const better = kind === "gain" ? lo > 0 : hi < 0;
  const worse = kind === "gain" ? hi < 0 : lo > 0;
  return better ? WORD.IMPROVES : worse ? WORD.WORSE : WORD.NOT_ESTABLISHED;
}

function metricResult(m, clusters, opts) {
  const pairs = clusters.map((c) => c.filter(([x, y]) => isNum(x) && isNum(y)));
  const base = { key: m.key, label: m.label, kind: m.kind, group: m.group };
  if (m.kind === "closer") {
    const ci = closerBootstrap(pairs, m.target, opts);
    return { ...base, target: m.target, n: ci.n, games: ci.clusters, champion: ci.a, challenger: ci.b, diff: ci.mean, ci95: [ci.lo, ci.hi], word: verdictOf(ci, m.kind, opts) };
  }
  const ci = clusterBootstrap(pairs.map((c) => c.map(([x, y]) => y - x)), opts);
  const flat = pairs.flat();
  return { ...base, n: ci.n, games: ci.clusters, champion: r4(meanOf(flat.map(([x]) => x))), challenger: r4(meanOf(flat.map(([, y]) => y))), diff: ci.mean, ci95: [ci.lo, ci.hi], word: verdictOf(ci, m.kind, opts) };
}

/** Every paired row of one game, for one champion/challenger pair. */
export function scoreGame(a, b, box) {
  const out = Object.fromEntries(METRICS.map((m) => [m.key, []]));
  const counts = { playedRows: 0, listedByBoth: 0, listedChampionOnly: 0, listedChallengerOnly: 0, listedByNeither: 0, allRows: 0, nullMinutes: 0 };
  for (const side of ["home", "away"]) {
    const teamId = String(a[side]?.providerTeamId);
    const boxRows = (box.players ?? []).filter((p) => String(p.providerTeamId) === teamId);
    const A = new Map((a.forecast?.players?.[side] ?? []).map((p) => [String(p.providerAthleteId), p]));
    const B = new Map((b.forecast?.players?.[side] ?? []).map((p) => [String(p.providerAthleteId), p]));
    const X = new Map(boxRows.map((p) => [String(p.providerAthleteId), p]));
    const played = (x) => !!x && x.didNotPlay !== true && Number.isInteger(x.minutes) && x.minutes > 0;
    for (const id of [...new Set([...X.keys(), ...A.keys(), ...B.keys()])].sort()) {
      const x = X.get(id) ?? null, ra = A.get(id) ?? null, rb = B.get(id) ?? null;
      if (x && x.didNotPlay !== true && !Number.isInteger(x.minutes)) { counts.nullMinutes += 1; continue; }
      const y = played(x) ? 1 : 0, actual = y ? x.minutes : 0;
      counts.allRows += 1;
      const ua = unconditionalMinutes(ra), ub = unconditionalMinutes(rb);
      out.minutesMaeAll.push([Math.abs(ua - actual), Math.abs(ub - actual)]);
      out.largeErrorAll.push([Math.abs(ua - actual) >= LARGE_ERROR_MINUTES ? 1 : 0, Math.abs(ub - actual) >= LARGE_ERROR_MINUTES ? 1 : 0]);
      out.participationBrier.push([(participationOf(ra) - y) ** 2, (participationOf(rb) - y) ** 2]);
      if (!y) continue;
      counts.playedRows += 1;
      const la = listed(ra), lb = listed(rb);
      if (la && lb) counts.listedByBoth += 1; else if (la) counts.listedChampionOnly += 1; else if (lb) counts.listedChallengerOnly += 1; else counts.listedByNeither += 1;
      if (!(la && lb)) continue;
      out.minutesMae.push([Math.abs(ra.expectedMinutes - actual), Math.abs(rb.expectedMinutes - actual)]);
      out.minutesBias.push([ra.expectedMinutes - actual, rb.expectedMinutes - actual]);
      out.largeError.push([Math.abs(ra.expectedMinutes - actual) >= LARGE_ERROR_MINUTES ? 1 : 0, Math.abs(rb.expectedMinutes - actual) >= LARGE_ERROR_MINUTES ? 1 : 0]);
      for (const [k] of STATS) if (Number.isInteger(x[k])) out[`${k}Mae`].push([isNum(ra[k]?.p50) ? Math.abs(ra[k].p50 - x[k]) : null, isNum(rb[k]?.p50) ? Math.abs(rb[k].p50 - x[k]) : null]);
      for (const k of RANGE_MARKETS) { const v = k === "minutes" ? x.minutes : x[k]; if (Number.isInteger(v)) out[`${k}Range`].push([inside80(ra[k], v), inside80(rb[k], v)]); }
    }
    const starters = boxRows.filter((p) => p.starter === true && played(p));
    const bench = boxRows.filter((p) => p.starter !== true && played(p)).sort((p, q) => q.minutes - p.minutes || String(p.providerAthleteId).localeCompare(String(q.providerAthleteId)));
    const rotation = (r) => (unconditionalMinutes(r) >= MIN_EXPECTED_MINUTES ? 1 : 0);
    const cover = (rows, keyListed, keyRot) => {
      for (const p of rows) {
        const id = String(p.providerAthleteId), ra = A.get(id), rb = B.get(id);
        out[keyListed].push([listed(ra) ? 1 : 0, listed(rb) ? 1 : 0]);
        out[keyRot].push([rotation(ra), rotation(rb)]);
      }
    };
    cover(starters, "starterListed", "starterRotation");
    cover(bench.slice(0, 1), "sixthListed", "sixthRotation");
  }
  return { rows: out, counts };
}

/** Each family's own level on the paired rows: bias vs 0 and p10–p90 coverage vs nominal, with their intervals. */
function familyDetail(scored, side, opts) {
  const pick = (key) => scored.map((g) => g.rows[key].map((p) => p[side]).filter(isNum));
  const bias = clusterBootstrap(pick("minutesBias"), opts);
  const biasWord = bias.lo == null ? WORD.NONE : !clustersSupportClaim(bias.clusters, opts) ? WORD.FEW : bias.hi < 0 ? "TOO LOW" : bias.lo > 0 ? "TOO HIGH" : WORD.NOT_ESTABLISHED;
  const ranges = {};
  for (const k of RANGE_MARKETS) {
    const ci = coverageInterval(pick(`${k}Range`), opts);
    ranges[k] = {
      n: ci.n, games: ci.clusters, coverage: ci.mean, ci95: [ci.lo, ci.hi],
      word: !ci.n ? "NO RANGE" : ci.lo == null ? WORD.NONE : !clustersSupportClaim(ci.clusters, opts) ? WORD.FEW : ci.hi < NOMINAL_COVERAGE ? "UNDER-COVERS" : ci.lo > NOMINAL_COVERAGE ? "OVER-COVERS" : "NOMINAL NOT EXCLUDED",
    };
  }
  return { minutesBias: { n: bias.n, games: bias.clusters, mean: bias.mean, ci95: [bias.lo, bias.hi], word: biasWord }, ranges };
}

/** The one-line overall word. Built from metric GROUPS, so no single metric can carry it. */
export function overallVerdict(metrics, opts = {}) {
  const games = Math.max(0, ...metrics.map((m) => m.games ?? 0));
  const inGroups = (word) => [...new Set(metrics.filter((m) => m.word === word).map((m) => m.group))];
  const up = inGroups(WORD.IMPROVES), down = inGroups(WORD.WORSE);
  const names = (g) => g.map((x) => GROUPS[x]).join(", ");
  if (!clustersSupportClaim(games, opts)) return { word: "NO CLAIM", text: `${games} games is below the ${opts.fewClustersBelow ?? FEW_CLUSTERS_BELOW}-game floor for reading any interval.`, ahead: [], behind: [] };
  const word = up.length && down.length ? "MIXED"
    : up.length >= 2 ? "AHEAD ON SEVERAL GROUPS, BEHIND ON NONE"
    : up.length === 1 ? "AHEAD ON ONE GROUP ONLY, NO OVERALL CLAIM"
    : down.length >= 2 ? "BEHIND ON SEVERAL GROUPS, AHEAD ON NONE"
    : down.length === 1 ? "BEHIND ON ONE GROUP ONLY, NO OVERALL CLAIM"
    : "NOT ESTABLISHED";
  const parts = [up.length ? `ahead: ${names(up)}` : null, down.length ? `behind: ${names(down)}` : null].filter(Boolean);
  return { word, text: parts.length ? `${parts.join("; ")}.` : "no metric's interval excludes 0.", ahead: up, behind: down };
}

function blockFor(games, opts) {
  const scored = games.map((g) => g.scored);
  const metrics = METRICS.map((m) => metricResult(m, scored.map((s) => s.rows[m.key]), opts));
  const decided = metrics.filter((m) => m.word === WORD.IMPROVES || m.word === WORD.WORSE).length;
  const sum = (k) => scored.reduce((s, g) => s + g.counts[k], 0);
  const bySlate = [...new Set(games.map((g) => g.date))].sort().map((date) => {
    const gs = games.filter((g) => g.date === date);
    const rows = gs.flatMap((g) => g.scored.rows.minutesMae);
    return { date, games: gs.length, playedRows: rows.length, championMinutesMae: r4(meanOf(rows.map(([x]) => x))), challengerMinutesMae: r4(meanOf(rows.map(([, y]) => y))) };
  });
  return {
    games: games.length, metrics, overall: overallVerdict(metrics, opts),
    intervalsExcluding0: { decided, of: metrics.length, expectedByChance: r4(metrics.length * (opts.alpha ?? BOOTSTRAP_DEFAULTS.alpha)) },
    rows: { playedRows: sum("playedRows"), listedByBoth: sum("listedByBoth"), listedChampionOnly: sum("listedChampionOnly"), listedChallengerOnly: sum("listedChallengerOnly"), listedByNeither: sum("listedByNeither"), allRows: sum("allRows"), nullMinutes: sum("nullMinutes") },
    champion: familyDetail(scored, 0, opts), challenger: familyDetail(scored, 1, opts), bySlate,
  };
}

/**
 * Pure: the whole scoreboard from loaded documents.
 * @param {{ from: string, to?: string|null, families: string[], forecasts: Record<string, object[]>, boxscores: Map<string, object>,
 *           finalsDoc?: object|null, sources?: object, armed?: Record<string,string>, bootstrap?: object }} input
 *   forecasts: family → that family's day documents; boxscores: event id → the final box score.
 */
export function buildScoreboard({ from, to = null, families, forecasts, boxscores, finalsDoc = null, sources = {}, armed = ARMED_FROM, bootstrap = {} }) {
  const opts = { ...BOOTSTRAP_DEFAULTS, ...bootstrap };
  const [champion, ...challengers] = families;
  const finals = new Map((finalsDoc?.finals ?? []).map((f) => [String(f.providerEventId), f]));
  const disputed = underReviewIds({ current: finalsDoc });
  const gamesOf = (fam) => {
    const out = new Map();
    for (const doc of forecasts[fam] ?? []) for (const g of doc.games ?? []) {
      const date = g.etDate ?? doc.date;
      if (date >= from && (!to || date <= to) && g.seasonType === 2) out.set(String(g.providerEventId), { game: g, date });
    }
    return out;
  };
  const truth = (id, game) => {
    const box = boxscores.get(id) ?? null;
    if (!box) return { reason: "NO_FINAL_BOX_SCORE" };
    const fin = finals.get(id) ?? null;
    if (!fin || !Number.isInteger(fin.ftHome) || !Number.isInteger(fin.ftAway)) return { reason: "NO_RECORDED_FINAL" };
    if (disputed.has(id)) return { reason: "FINAL_UNDER_REVIEW" };
    const pts = boxscorePointsCheck(box, { homeTeamId: game.home?.providerTeamId, awayTeamId: game.away?.providerTeamId, ftHome: fin.ftHome, ftAway: fin.ftAway });
    if (pts?.agrees === false) return { reason: "BOX_POINTS_DISAGREE_WITH_FINAL" };
    return { box };
  };
  const champ = gamesOf(champion);
  const comparisons = [];
  for (const chal of challengers) {
    const other = gamesOf(chal);
    const forwardFrom = [armed[champion], armed[chal]].sort().at(-1);
    const excluded = {};
    const skip = (r) => { excluded[r] = (excluded[r] ?? 0) + 1; };
    const pending = [];
    const paired = [];
    let sameInstant = 0;
    const lagsMin = [];
    for (const id of [...new Set([...champ.keys(), ...other.keys()])].sort()) {
      const a = champ.get(id), b = other.get(id);
      if (!a || !b) { skip(a ? "CHAMPION_ONLY" : "CHALLENGER_ONLY"); continue; }
      if (receiptIntegrity(a.game).state !== "OK" || receiptIntegrity(b.game).state !== "OK") { skip("RECEIPT_NOT_VERIFIED"); continue; }
      const t = truth(id, a.game);
      if (!t.box) { if (t.reason === "NO_FINAL_BOX_SCORE" || t.reason === "NO_RECORDED_FINAL") pending.push(id); else skip(t.reason); continue; }
      const lag = (Date.parse(b.game.receipt.generatedAt) - Date.parse(a.game.receipt.generatedAt)) / 60000;
      if (lag === 0) sameInstant += 1;
      lagsMin.push(lag);
      paired.push({ id, date: a.date, matchup: `${a.game.away?.abbr}@${a.game.home?.abbr}`, scored: scoreGame(a.game, b.game, t.box) });
    }
    paired.sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id));
    const forward = paired.filter((g) => g.date >= forwardFrom);
    const seen = paired.filter((g) => g.date < forwardFrom);
    lagsMin.sort((x, y) => x - y);
    comparisons.push({
      champion, challenger: chal, forwardFrom,
      freeze: { sameInstant, paired: paired.length, medianChallengerLagMinutes: lagsMin.length ? Math.round(lagsMin[Math.floor(lagsMin.length / 2)]) : null },
      pendingGames: pending.length, excluded,
      forward: forward.length ? { evidence: "FORWARD", ...blockFor(forward, opts) } : null,
      seen: seen.length ? { evidence: "SEEN", ...blockFor(seen, opts) } : null,
    });
  }
  return {
    schema: SCOREBOARD_SCHEMA, marker: "RESEARCH_NOT_PUBLISHED", dataClass: "PRIVATE_RESEARCH", productEligible: false, promotes: false,
    from, to, families: [...families], armedFrom: Object.fromEntries(families.map((f) => [f, armed[f] ?? null])),
    bootstrap: { B: opts.B, seed: opts.seed, alpha: opts.alpha, fewClustersBelow: opts.fewClustersBelow ?? FEW_CLUSTERS_BELOW, method: "game-clustered percentile bootstrap" },
    preregMinimums: { pts: PREREG.player.pts.minN, reb: PREREG.player.reb.minN, ast: PREREG.player.ast.minN, note: "player rows with expected minutes ≥ 20 in both families (§6); this report's rows are wider and do not meet or miss that test" },
    comparisons, sources,
  };
}

/* ── rendering ───────────────────────────────────────────────────────────────────────────────────────────────── */
const row = (cells) => `| ${cells.join(" | ")} |`;
const table = (head, rows) => [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n");
const f4 = (x) => (x == null ? "—" : x.toFixed(4));
const sg = (x) => (x == null ? "—" : `${x > 0 ? "+" : ""}${x.toFixed(4)}`);
const ci = ([lo, hi]) => (lo == null ? "—" : `${sg(lo)} to ${sg(hi)}`);
const ciPlain = ([lo, hi]) => (lo == null ? "—" : `${f4(lo)} to ${f4(hi)}`);

function renderBlock(out, c, b) {
  out.push(`### ${c.challenger} vs ${c.champion}: ${b.evidence}, ${b.games} games`);
  out.push("");
  out.push(`**Overall: ${b.overall.word}.** ${b.overall.text} Report only; this promotes nothing.`);
  out.push("");
  out.push(table(["metric", "better", "n", "games", c.champion, c.challenger, "diff", "95% CI", "verdict"], b.metrics.map((m) => [m.label, m.kind === "gain" ? "higher" : "lower", m.n, m.games, f4(m.champion), f4(m.challenger), sg(m.diff), ci(m.ci95), m.word])));
  out.push("");
  out.push(`diff = ${c.challenger} − ${c.champion} on identical rows. On a "distance from" row the two columns are the raw bias or coverage, and diff is the change in distance from the target.`);
  out.push(`${b.intervalsExcluding0.decided} of ${b.intervalsExcluding0.of} intervals exclude 0 with enough games; unadjusted, about ${b.intervalsExcluding0.expectedByChance} would by chance if nothing differed.`);
  out.push("");
  const r = b.rows;
  out.push(`Rows: ${r.playedRows} played; listed by both ${r.listedByBoth}, ${c.champion} only ${r.listedChampionOnly}, ${c.challenger} only ${r.listedChallengerOnly}, neither ${r.listedByNeither}. All rows ${r.allRows}.${r.nullMinutes ? ` ${r.nullMinutes} box rows had no minutes and were skipped.` : ""}`);
  out.push("");
  const fam = [[c.champion, b.champion], [c.challenger, b.challenger]];
  out.push(table(["family", "market", "n", "games", "level", "95% CI", "read"], fam.flatMap(([name, d]) => [
    [name, "minutes bias (expected − actual)", d.minutesBias.n, d.minutesBias.games, sg(d.minutesBias.mean), ci(d.minutesBias.ci95), d.minutesBias.word],
    ...RANGE_MARKETS.map((k) => { const x = d.ranges[k]; return [name, `${k} p10–p90 coverage (nominal ${NOMINAL_COVERAGE.toFixed(2)})`, x.n, x.games, f4(x.coverage), ciPlain(x.ci95), x.word]; }),
  ])));
  out.push("");
  out.push(table(["slate", "games", "played rows", `${c.champion} minutes MAE`, `${c.challenger} minutes MAE`], b.bySlate.map((s) => [s.date, s.games, s.playedRows, f4(s.championMinutesMae), f4(s.challengerMinutesMae)])));
  out.push("");
}

export function renderMarkdown(rep) {
  const out = [];
  out.push(`<!-- generated by app/scripts/nba/research/forward-scoreboard.mjs · ${rep.schema} · deterministic -->`);
  out.push(`RESEARCH_NOT_PUBLISHED · dataClass ${rep.dataClass} · productEligible ${rep.productEligible} · promotes nothing`);
  out.push("");
  out.push(`# NBA forward scoreboard, slates from ${rep.from}${rep.to ? ` to ${rep.to}` : ""}`);
  out.push("");
  out.push(`Intervals: ${rep.bootstrap.method}, ${rep.bootstrap.B} resamples, seed ${rep.bootstrap.seed}. IMPROVES or WORSE only when the 95% interval excludes 0 over at least ${rep.bootstrap.fewClustersBelow} games.`);
  out.push(`Prereg §6 row minimums are pts ${rep.preregMinimums.pts}, reb ${rep.preregMinimums.reb}, ast ${rep.preregMinimums.ast}, on a narrower row set than these tables (${rep.preregMinimums.note.split(";")[0]}).`);
  out.push("");
  out.push(table(["pair", "evidence from", "paired games", "same freeze instant", "median challenger lag (min)", "pending", "excluded"], rep.comparisons.map((c) => [
    `${c.challenger} vs ${c.champion}`, c.forwardFrom, c.freeze.paired, `${c.freeze.sameInstant}/${c.freeze.paired}`, c.freeze.medianChallengerLagMinutes ?? "—", c.pendingGames,
    Object.entries(c.excluded).sort(([x], [y]) => x.localeCompare(y)).map(([k, v]) => `${k} ${v}`).join(", ") || "none",
  ])));
  out.push("");
  out.push("A challenger that freezes later than the champion saw later injury and roster news, so its lead is not all model. Pending = no recorded final or final box score yet.");
  out.push("");
  for (const c of rep.comparisons) {
    if (c.forward) renderBlock(out, c, c.forward);
    if (c.seen) renderBlock(out, c, c.seen);
    if (!c.forward && !c.seen) { out.push(`### ${c.challenger} vs ${c.champion}: no graded paired games`); out.push(""); }
  }
  out.push("Inputs (sha256 of the committed bytes read):");
  out.push("");
  for (const [k, v] of Object.entries(rep.sources)) out.push(`- \`${k}\`: ${v}`);
  out.push("");
  return out.join("\n");
}

/* ── loading + CLI ───────────────────────────────────────────────────────────────────────────────────────────── */
const shaOf = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

export function loadInputs(root, { from, to = null, families }) {
  const sources = {};
  const read = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return null;
    const buf = fs.readFileSync(abs);
    sources[rel] = shaOf(buf);
    return JSON.parse(buf.toString("utf8"));
  };
  const forecasts = {};
  const ids = new Set();
  for (const fam of families) {
    const dir = `data/internal/research/nba/${FAMILY_DIR[fam]}/forecasts`;
    const abs = path.join(root, dir);
    const days = fs.existsSync(abs) ? fs.readdirSync(abs).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
    forecasts[fam] = days.filter((f) => f.slice(0, 10) >= from && (!to || f.slice(0, 10) <= to)).map((f) => read(`${dir}/${f}`));
    for (const d of forecasts[fam]) for (const g of d.games ?? []) ids.add(String(g.providerEventId));
  }
  const boxscores = new Map();
  for (const id of [...ids].sort()) {
    for (const dir of BOX_DIRS) {
      const rel = `data/internal/research/nba/${dir}/boxscores/${id}.json`;
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) continue;
      const buf = fs.readFileSync(abs);
      const doc = JSON.parse(buf.toString("utf8"));
      if (doc.boxscoreAvailable && doc.status === "STATUS_FINAL" && doc.phase === 2) { sources[rel] = shaOf(buf); boxscores.set(id, doc); break; }
    }
  }
  const finalsDoc = read(FINALS_FILE);
  return { forecasts, boxscores, finalsDoc, sources: Object.fromEntries(Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))) };
}

/** A report never lands where a build or a publisher reads: under data/ or app/public/ of this checkout or the main one. */
export function forbiddenOut(p, roots = protectedRoots()) {
  const abs = path.resolve(p);
  return roots.some((r) => [path.join(r, "data"), path.join(r, "app", "public")].some((d) => abs === d || abs.startsWith(d + path.sep)));
}

function main(argv) {
  const arg = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
  const refuse = (m) => { console.error(`REFUSED: ${m}`); process.exit(1); };
  const from = arg("--from") ?? DEFAULT_FROM;
  const to = arg("--to");
  const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!isDate(from) || (to && !isDate(to))) refuse("--from / --to take YYYY-MM-DD");
  const families = (arg("--families") ?? DEFAULT_FAMILIES.join(",")).split(",").filter(Boolean);
  if (families.length < 2 || families.some((f) => !FAMILY_DIR[f])) refuse(`--families needs at least two of ${Object.keys(FAMILY_DIR).join(", ")}; the first is the champion`);
  const root = arg("--root") ? path.resolve(arg("--root")) : REPO_ROOT;
  const outArg = arg("--out");
  if (argv.includes("--out") && !outArg) refuse("--out needs a path");
  const outMd = outArg ? path.resolve(outArg) : path.join(os.tmpdir(), "gtp-nba-forward-scoreboard", `forward-scoreboard-from-${from}.md`);
  if (forbiddenOut(outMd)) refuse(`${outMd} is under data/ or app/public/; a report never lands where a build or a publisher reads`);
  const rep = buildScoreboard({ from, to, families, ...loadInputs(root, { from, to, families }) });
  const md = renderMarkdown(rep);
  fs.mkdirSync(path.dirname(outMd), { recursive: true });
  fs.writeFileSync(outMd, md);
  fs.writeFileSync(outMd.replace(/(\.md)?$/, ".json"), `${JSON.stringify(rep, null, 2)}\n`);
  process.stdout.write(md);
  console.error(`wrote ${outMd} and its .json`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2));
