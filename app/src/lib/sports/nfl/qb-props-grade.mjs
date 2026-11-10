/**
 * NFL QB PROPS v0 · GRADER (EXPERIMENTAL; engine parity plan §5, PD 2026-11-10). PURE: no fs, no clock, no network.
 *
 * Grades the sim-v2 SHADOW receipts' QB lines against verified finals, forward only, and reports n and metrics with NO
 * verdict — and ONLY under an approved pre-registration (founder ruling 2026-11-10: thresholds are approved before anyone
 * sees graded accuracy). Until then the only output is forwardCounts(): eligible forward rows per family, from the
 * receipts alone, never joined to a final. The scripts refuse to grade unless handed the pre-registration file whose
 * sha256 is listed in APPROVED_PREREG_SHA256 (empty until the founder approves).
 *
 *   WHICH RECEIPT   the receipt of record per event: the latest generated strictly before eventStart (public-receipt.mjs
 *                   rule). An event whose receipts were all generated at/after kickoff is EXCLUDED and counted.
 *   WHICH QB        per team, the receipt player with the largest pass-attempt median (the projected starter).
 *   ACTUALS         the final box score (player-events-v1, ESPN game summary) — only for games the settlement source
 *                   records FINAL and whose team passing yards agree with it (verified); others are excluded and counted.
 *   FAMILIES        passYds, passCmp, passAtt (continuous); passTd, passInt (counts).
 *   MODEL           the receipt's exact run counts (simulation-receipt@2.2), or for the counts its count PMF (@2.1);
 *                   a receipt with neither has no model distribution for that family (counted, never approximated).
 *   BASELINES       qb-props-scores.mjs (frozen): own previous 8 games (yds/cmp/att), team previous-8 Poisson (TD/INT);
 *                   league average secondary.
 *   METRICS         per family: the primary score (yds line log loss; cmp/att CRPS; TD/INT count log loss), cov80, width,
 *                   bias, interval score, ECE at the lines (yds); model − baseline with a game-clustered 95% bootstrap
 *                   interval (deterministic seed); the pre-registered decision (familyOutcome) on CONFIRMATORY rows only.
 *   STRATA          starter match (projected QB = the actual starter, the QB with the most attempts); eligibility@1 state
 *                   at freeze when the contract is available (`eligibilityAt`), else PENDING_ELIGIBILITY_CONTRACT.
 */

import { COUNT_CALIBRATION_LINES, PASS_YDS_LINES, QB_SCORES_SPEC, empirical, fromCountPmf, ece, leagueBaseline, ownTrailingBaseline, scoreRow, teamPoissonBaseline } from "./qb-props-scores.mjs";

export const QB_PROPS_LEDGER_SCHEMA = "gtp.nfl.qb-props-ledger@1";
export const QB_PROPS_COUNTS_SCHEMA = "gtp.nfl.qb-props-forward-counts@1";
/**
 * sha256 of each pre-registration file the founder has APPROVED in writing. v1.3 (docs/NFL_QB_PROPS_PREREGISTRATION_V1_3.md),
 * approved 2026-11-10 (~/gtp-evidence/nov10-founder-qbp-prereg-v13-approval.md); qb-props-grade.test.mjs pins the file's bytes.
 */
export const APPROVED_PREREG_SHA256 = Object.freeze(["718ad39b572c5bb4e6df42146cd717c7876aad78c34a4b37dc5f0a4d9de24a14"]);
/** Weeks looked at before any threshold was approved (disclosed 2026-11-10): permanently exploratory, never confirmatory. */
export const SEEN_EXPLORATORY_WEEKS = Object.freeze([5, 6, 7, 8, 9]);
/** sha256 → the founder's written approval timestamp (ISO). The confirmatory window opens strictly after it. */
export const PREREG_APPROVED_AT = Object.freeze({ "718ad39b572c5bb4e6df42146cd717c7876aad78c34a4b37dc5f0a4d9de24a14": "2026-11-10T18:55:07Z" });
/** May grading run with this pre-registration file? Only when its sha256 is an approved one. */
export const gradingApproved = (preregSha256, approvals = APPROVED_PREREG_SHA256) => typeof preregSha256 === "string" && approvals.includes(preregSha256);
/** Why grade mode refuses (null ⇒ approved and timestamped). Pure, no import beyond this file, so the script checks it first. */
export function gradeRefusal(preregSha256, approvals = APPROVED_PREREG_SHA256, approvedAt = PREREG_APPROVED_AT) {
  if (!gradingApproved(preregSha256, approvals)) return "no approved pre-registration";
  if (!approvedAt[preregSha256]) return "the approved pre-registration has no approval timestamp";
  return null;
}
export const QB_FAMILIES = Object.freeze([
  { family: "passYds", stat: "passYds", actual: "passYds", kind: "continuous", score: "yds" },
  { family: "passCmp", stat: "cmp", actual: "passCmp", kind: "continuous", score: "continuous" },
  { family: "passAtt", stat: "passAtt", actual: "passAtt", kind: "continuous", score: "continuous" },
  { family: "passTd", stat: "passTd", actual: "passTd", kind: "count", score: "count" },
  { family: "passInt", stat: "int", actual: "passInt", kind: "count", score: "count" },
]);
export const FROM_DATE = "2026-10-06";
/** Pre-registration v1 bars (founder decision 4, 2026-11-10), every family. */
export const MIN_PAIRED_N = 300;
export const COV80_RANGE = Object.freeze([0.76, 0.84]);
const SCORE_NAME = { yds: "mean line log loss at 199.5 / 224.5 / 249.5", continuous: "CRPS (integer grid)", count: "count log loss (6+ pooled)" };
export const BOOTSTRAP = Object.freeze({ resamples: 2000, seed: 20261110 });

const ms = (iso) => { const t = Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")); return Number.isFinite(t) ? t : null; };
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** mulberry32 — the deterministic stream for the bootstrap. */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** The receipt of record per event (latest generatedAt < eventStart) and the counted exclusions. */
export function receiptsOfRecord(entries, { from = FROM_DATE } = {}) {
  const byEvent = new Map();
  const excluded = { generatedAtOrAfterStart: 0, beforeFromDate: 0 };
  for (const e of entries) {
    const r = e.receipt;
    if (!r?.eventId) continue;
    if (String(r.generatedAt ?? "").slice(0, 10) < from) { excluded.beforeFromDate += 1; continue; }
    const g = ms(r.generatedAt), k = ms(r.eventStart);
    if (!(g != null && k != null && g < k)) { excluded.generatedAtOrAfterStart += 1; continue; }
    const cur = byEvent.get(String(r.eventId));
    if (!cur || String(r.generatedAt).localeCompare(String(cur.receipt.generatedAt)) > 0 || (r.generatedAt === cur.receipt.generatedAt && e.file > cur.file)) byEvent.set(String(r.eventId), e);
  }
  return { records: [...byEvent.values()].sort((a, b) => String(a.receipt.eventId).localeCompare(String(b.receipt.eventId))), excluded };
}

/**
 * COUNTS ONLY (allowed before approval): the eligible forward rows per family — receipts of record with the projected QB
 * carrying that family's distribution — per ISO week of kickoff and per eligibility stratum. Never reads a final.
 * @param {{ entries: Array<{file:string, receipt:object}>, eligibilityAt?: Function|null, from?: string }} a
 */
export function forwardCounts({ entries, eligibilityAt = null, from = FROM_DATE }) {
  const { records, excluded } = receiptsOfRecord(entries, { from });
  const fams = QB_FAMILIES.map((f) => f.family);
  const byDate = {}; const byElig = {}; const total = Object.fromEntries(fams.map((f) => [f, 0]));
  let qbRows = 0; let withCountPmf = 0;
  const withModelDistribution = Object.fromEntries(fams.map((f) => [f, 0]));
  for (const { receipt } of records) {
    for (const [team, qb] of Object.entries(projectedQbs(receipt)).sort(([a], [b]) => a.localeCompare(b))) {
      qbRows += 1;
      if (qb.countPmf?.passTd) withCountPmf += 1;
      const day = String(receipt.eventStart).slice(0, 10);
      const pid = qb.playerId.startsWith("nfl-athlete-") ? qb.playerId : `nfl-athlete-${qb.playerId}`;
      const elig = eligibilityAt ? eligibilityAt({ playerId: pid, teamAbbr: team, asOf: receipt.generatedAt })?.state ?? "UNKNOWN" : "PENDING_ELIGIBILITY_CONTRACT";
      for (const f of QB_FAMILIES) {
        if (!qb.stats?.[f.stat]) continue;
        total[f.family] += 1;
        if (modelDist(qb, f)) withModelDistribution[f.family] += 1;
        (byDate[day] ??= Object.fromEntries(fams.map((x) => [x, 0])))[f.family] += 1;
        (byElig[elig] ??= Object.fromEntries(fams.map((x) => [x, 0])))[f.family] += 1;
      }
    }
  }
  return {
    schema: QB_PROPS_COUNTS_SCHEMA,
    rule: "receipt of record = latest generatedAt < eventStart; projected QB = largest pass-attempt median; NOT joined to any final",
    receiptsOfRecord: records.length, excluded, qbRows, withCountPmf, total, withModelDistribution,
    byKickoffDate: Object.fromEntries(Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))),
    byEligibility: byElig,
  };
}

/** The projected QB per team in a receipt: the largest pass-attempt median. */
export function projectedQbs(receipt) {
  const out = {};
  for (const p of receipt.playerStatDistributions ?? []) {
    const att = p.stats?.passAtt?.p50;
    if (!(att > 0) || p.playerId === "OTHER") continue;
    if (!out[p.team] || att > out[p.team].stats.passAtt.p50) out[p.team] = p;
  }
  return out;
}

/** The model's predictive distribution for one family: exact run counts (@2.2), else the count PMF (@2.1) for counts. */
function modelDist(qb, f) {
  if (qb.exactCounts?.[f.stat]) return empirical(qb.exactCounts[f.stat]);
  return f.kind === "count" ? fromCountPmf(qb.countPmf?.[f.stat]) : null;
}

/**
 * @param {{ entries: Array<{file:string, receipt:object}>, games: Array<object>, verified: Map<string, {teamPassYds: Record<string, number>}>,
 *   eligibilityAt?: (args: { playerId: string, teamAbbr: string, asOf: string }) => ({ state: string } | null),
 *   r5At?: (args: { eventId: string, teamAbbr: string }) => boolean | null, approvedAt?: string | null }} a
 *   games: player-events-v1 game rows of EVERY season read (the baselines walk back across seasons), with
 *          providerEventId, season, week, dateUtc, players[] (passAtt / passCmp / passYds / passTd / passInt)
 *   verified: the settlement source's FINAL games, with each team's passing yards (the cross-check)
 *   approvedAt: the founder's approval timestamp; a row is CONFIRMATORY only when its kickoff is after it, it is not in
 *          SEEN_EXPLORATORY_WEEKS, eligibility@1 says ELIGIBLE at freeze and R5 allows the line
 */
export function gradeQbProps({ entries, games, verified, eligibilityAt = null, r5At = null, approvedAt = null, from = FROM_DATE, preregSha256 = null, approvals = APPROVED_PREREG_SHA256 }) {
  if (!gradingApproved(preregSha256, approvals)) throw new Error("REFUSED: grading needs a pre-registration file whose sha256 the founder approved (APPROVED_PREREG_SHA256)");
  const { records, excluded } = receiptsOfRecord(entries, { from });
  const gameById = new Map(games.map((g) => [String(g.providerEventId), g]));
  const counts = { eventsWithReceipt: records.length, ...excluded, notFinal: 0, unverifiedFinal: 0, projectedQbDidNotPlay: 0 };
  const rows = [];
  for (const { file, receipt } of records) {
    const id = String(receipt.eventId);
    const g = gameById.get(id);
    const v = verified.get(id);
    if (!g || !v) { counts.notFinal += 1; continue; }
    const actualPassYds = (team) => g.players.filter((p) => p.teamAbbr === team && p.passAtt != null).reduce((a, p) => a + (p.passYds ?? 0), 0);
    const qbs = projectedQbs(receipt);
    if (Object.keys(qbs).some((team) => v.teamPassYds?.[team] != null && v.teamPassYds[team] !== actualPassYds(team))) { counts.unverifiedFinal += 1; continue; }
    for (const [team, qb] of Object.entries(qbs).sort(([a], [b]) => a.localeCompare(b))) {
      const pid = qb.playerId.startsWith("nfl-athlete-") ? qb.playerId : `nfl-athlete-${qb.playerId}`;
      const actual = g.players.find((p) => p.playerId === pid && p.passAtt != null) ?? null;
      const starter = g.players.filter((p) => p.teamAbbr === team && p.passAtt != null).sort((a, b) => b.passAtt - a.passAtt || a.playerId.localeCompare(b.playerId))[0] ?? null;
      if (!actual) { counts.projectedQbDidNotPlay += 1; continue; }
      const elig = eligibilityAt ? eligibilityAt({ playerId: pid, teamAbbr: team, asOf: receipt.generatedAt }) : null;
      const r5 = r5At ? r5At({ eventId: id, teamAbbr: team }) : null;
      const eligibility = elig?.state ?? "PENDING_ELIGIBILITY_CONTRACT";
      const afterApproval = approvedAt != null && ms(receipt.eventStart) > ms(approvedAt);
      const seen = g.season === 2026 && SEEN_EXPLORATORY_WEEKS.includes(g.week);
      rows.push({
        eventId: id, season: g.season, week: g.week, team, playerId: pid, name: qb.name ?? actual.name, receipt: file, receiptGeneratedAt: receipt.generatedAt, eventStart: receipt.eventStart,
        starterMatch: starter?.playerId === pid, eligibility, r5,
        confirmatory: afterApproval && !seen && eligibility === "ELIGIBLE" && r5 === true,
        families: Object.fromEntries(QB_FAMILIES.map((f) => {
          const y = actual[f.actual];
          if (!Number.isFinite(y)) return [f.family, null];
          const primary = f.kind === "count" ? teamPoissonBaseline(games, team, receipt.eventStart, f.actual) : ownTrailingBaseline(games, pid, receipt.eventStart, f.actual);
          const league = leagueBaseline(games, g.season, receipt.eventStart, f.actual, f.kind === "count" ? "count" : "continuous");
          const cl = COUNT_CALIBRATION_LINES[f.family] ?? [];
          return [f.family, { actual: y, model: scoreRow(modelDist(qb, f), y, f.score, cl), baseline: scoreRow(primary, y, f.score, cl), league: scoreRow(league, y, f.score, cl) }];
        })),
      });
    }
  }
  assertDistinctQbGames(rows);
  return { rows, counts };
}

/**
 * Each row is ONE distinct QB-game outcome, keyed (eventId, team, playerId); n counts distinct outcomes. A repeated key
 * refuses the grade (gradeQbProps) and the ledger (buildLedger) — never deduplicated silently.
 */
export function assertDistinctQbGames(rows) {
  const seen = new Set();
  for (const r of rows) {
    const key = `${r.eventId}|${r.team}|${r.playerId}`;
    if (seen.has(key)) throw new Error(`REFUSED: duplicate QB-game outcome ${key} — each (eventId, team, playerId) is graded once`);
    seen.add(key);
  }
  return seen.size;
}

/** mulberry32-driven game-clustered bootstrap of the mean paired difference. */
function clusteredCi(byGame) {
  const clusters = [...byGame.values()];
  if (clusters.length < 2) return null;
  const next = rng(BOOTSTRAP.seed);
  const stats = [];
  for (let b = 0; b < BOOTSTRAP.resamples; b++) {
    let s = 0, c = 0;
    for (let i = 0; i < clusters.length; i++) { const k = clusters[Math.floor(next() * clusters.length)]; for (const d of k) { s += d; c += 1; } }
    stats.push(s / c);
  }
  stats.sort((a, b) => a - b);
  return [r4(stats[Math.floor(0.025 * stats.length)]), r4(stats[Math.ceil(0.975 * stats.length) - 1])];
}

/** Metrics per family over a set of rows. Lower primary score is better; the difference is model − baseline. */
export function familyMetrics(rows, family) {
  const f = QB_FAMILIES.find((x) => x.family === family);
  const xs = rows.map((r) => ({ eventId: r.eventId, f: r.families[family] })).filter((x) => x.f?.model);
  const n = xs.length;
  const out = { n, noModelDistribution: rows.filter((r) => r.families[family] && !r.families[family].model).length };
  if (!n) return out;
  const m = xs.map((x) => x.f.model);
  const paired = xs.filter((x) => x.f.baseline);
  const byGame = new Map();
  for (const x of paired) (byGame.get(x.eventId) ?? byGame.set(x.eventId, []).get(x.eventId)).push(x.f.model.primary - x.f.baseline.primary);
  const leaguePaired = xs.filter((x) => x.f.league);
  Object.assign(out, {
    games: new Set(xs.map((x) => x.eventId)).size,
    primaryScore: SCORE_NAME[f.score],
    model: { primary: r4(mean(m.map((s) => s.primary))), cov80: r4(mean(m.map((s) => (s.covered80 ? 1 : 0)))), width80: r4(mean(m.map((s) => s.width))), bias: r4(mean(m.map((s) => s.error))), intervalScore: r4(mean(m.map((s) => s.intervalScore))) },
    pairedN: paired.length, noBaseline: n - paired.length,
    baseline: paired.length ? { primary: r4(mean(paired.map((x) => x.f.baseline.primary))), cov80: r4(mean(paired.map((x) => (x.f.baseline.covered80 ? 1 : 0)))) } : null,
    modelMinusBaseline: paired.length ? r4(mean(paired.map((x) => x.f.model.primary - x.f.baseline.primary))) : null,
    modelMinusBaselineCi95: clusteredCi(byGame),
    secondaryLeague: leaguePaired.length ? { n: leaguePaired.length, modelMinusLeague: r4(mean(leaguePaired.map((x) => x.f.model.primary - x.f.league.primary))) } : null,
  });
  if (f.score === "yds") out.ece = Object.fromEntries(PASS_YDS_LINES.map((l) => [l, r4(ece(xs.map((x) => ({ p: x.f.model.pOver[l], y: x.f.actual > l ? 1 : 0 }))))]));
  if (f.kind === "count") {
    // founder decision 2026-11-10 (no fixed event minimum): always report the events, per line, beside the interval
    out.events = {
      eligibleQbGames: n,
      total: xs.reduce((a, x) => a + x.f.actual, 0),
      byLine: Object.fromEntries(COUNT_CALIBRATION_LINES[family].map((l) => {
        const ev = xs.filter((x) => x.f.actual > l).length;
        return [l, { events: ev, nonEvents: n - ev, eventFrequency: r4(ev / n), nonEventFrequency: r4((n - ev) / n), modelMeanP: r4(mean(xs.map((x) => x.f.model.pOver[l]))) }];
      })),
    };
    out.ece = Object.fromEntries(COUNT_CALIBRATION_LINES[family].map((l) => [l, r4(ece(xs.map((x) => ({ p: x.f.model.pOver[l], y: x.f.actual > l ? 1 : 0 }))))]));
  }
  return out;
}

/**
 * The pre-registered decision for one family (pre-registration v1 §2), from its CONFIRMATORY metrics:
 *   INCONCLUSIVE  paired n < 300; no interval; or the interval contains 0 (there is no fixed event-count minimum for
 *                 any family, INT included — founder 2026-11-10: insufficient evidence shows as an unsettled interval)
 *   FAILED        the interval excludes 0 unfavourably, or cov80 outside 0.76–0.84
 *   MET           the interval excludes 0 favourably (model − baseline < 0) AND cov80 in 0.76–0.84
 * Failed or inconclusive ⇒ experimental research only, never official. MET is a necessary condition, not a release.
 */
export function familyOutcome(family, m) {
  const reasons = [];
  if (!((m.pairedN ?? 0) >= MIN_PAIRED_N)) reasons.push(`paired n ${m.pairedN ?? 0} < ${MIN_PAIRED_N}`);
  const ci = m.modelMinusBaselineCi95;
  if (!ci) reasons.push("no interval");
  if (reasons.length) return { outcome: "INCONCLUSIVE", reasons };
  const cov = m.model.cov80;
  const covOk = cov >= COV80_RANGE[0] && cov <= COV80_RANGE[1];
  if (ci[0] > 0) return { outcome: "FAILED", reasons: ["interval excludes 0 unfavourably", ...(covOk ? [] : [`cov80 ${cov} outside ${COV80_RANGE.join("–")}`])] };
  if (!covOk) return { outcome: "FAILED", reasons: [`cov80 ${cov} outside ${COV80_RANGE.join("–")}`] };
  if (ci[1] < 0) return { outcome: "MET", reasons: [] };
  return { outcome: "INCONCLUSIVE", reasons: ["interval contains 0"] };
}

/** A row's window label: confirmatory, the seen weeks 5–9 (exploratory forever), or otherwise exploratory. */
export const rowWindow = (r) => (r.confirmatory ? "CONFIRMATORY" : r.season === 2026 && SEEN_EXPLORATORY_WEEKS.includes(r.week) ? "EXPLORATORY_SEEN_WEEKS_5_9" : "EXPLORATORY");

/** Below the look, only counts — no score comparison, no interval, no bar quantity (cov80) is shown for confirmatory rows. */
function runningSummary(m) {
  const pairedN = m.pairedN ?? 0;
  return { n: m.n, games: m.games ?? 0, pairedN, noModelDistribution: m.noModelDistribution, noBaseline: m.noBaseline ?? 0, ...(m.events ? { events: m.events } : {}), progress: `${pairedN}/${MIN_PAIRED_N}` };
}
const sha16 = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };

/**
 * SINGLE LOOK (pre-registration v1.3, "The look"). Per family, over confirmatory rows: while paired n < 300 the ledger
 * carries a running descriptive summary with lookTaken false and verdict null. The run in which paired n first reaches
 * 300 computes the decision ONCE (familyOutcome on every confirmatory row graded so far) and stores it with the rows it
 * used; every later run copies that look verbatim from the previous ledger — the verdict never changes.
 */
export function confirmatoryLook(family, rows, prev = null) {
  const m = familyMetrics(rows, family);
  const run = runningSummary(m);
  if (prev?.lookTaken) return { ...run, lookTaken: true, verdict: prev.verdict, look: prev.look };
  if (run.pairedN < MIN_PAIRED_N) return { ...run, lookTaken: false, verdict: null };
  const { outcome, reasons } = familyOutcome(family, m);
  const keys = rows.filter((r) => r.families[family]?.model && r.families[family]?.baseline).map((r) => `${r.eventId}|${r.team}|${r.playerId}`).sort();
  const atKickoff = rows.map((r) => r.eventStart).sort((a, b) => (ms(a) ?? 0) - (ms(b) ?? 0)).at(-1) ?? null;
  return { ...run, lookTaken: true, verdict: outcome, look: { pairedN: run.pairedN, lastKickoffInLook: atKickoff, rowKeysDigest: sha16(keys.join("\n")), rowKeys: keys, reasons, metrics: m } };
}

/**
 * The ledger: the single-look decision per family on confirmatory rows, then exploratory descriptives on the NON-confirmatory
 * rows only (so no aggregate peeks at the confirmatory comparison before the look). `previous`: the committed ledger, whose
 * taken looks are carried forward when it was graded under the same pre-registration. Deterministic: no wall-clock field.
 */
export function buildLedger({ graded, inputs, previous = null }) {
  const { rows: gradedRows, counts } = graded;
  assertDistinctQbGames(gradedRows);
  const rows = gradedRows.map((r) => ({ ...r, window: rowWindow(r) }));
  const fams = QB_FAMILIES.map((f) => f.family);
  const exploratory = rows.filter((r) => !r.confirmatory);
  const by = (pred) => Object.fromEntries(fams.map((f) => [f, familyMetrics(exploratory.filter(pred), f)]));
  const carry = previous && previous.inputs?.preregSha256 === inputs?.preregSha256 ? previous.confirmatory ?? {} : {};
  const weeks = [...new Set(rows.map((r) => `${r.season}-w${r.week}`))].sort();
  const strata = (key) => Object.fromEntries([...new Set(exploratory.map((r) => String(r[key])))].sort().map((v) => [v, by((r) => String(r[key]) === v)]));
  return {
    schema: QB_PROPS_LEDGER_SCHEMA,
    status: "EXPERIMENTAL — confirmatory rows only decide, once, when paired n first reaches 300; everything else is descriptive. Failed or inconclusive ⇒ research only.",
    rule: "receipt of record = latest generatedAt < eventStart; projected QB = largest pass-attempt median; actuals = verified finals",
    scoresSpec: QB_SCORES_SPEC,
    inputs,
    counts: { ...counts, qbGames: rows.length, confirmatoryQbGames: rows.filter((r) => r.confirmatory).length, byWindow: Object.fromEntries(["CONFIRMATORY", "EXPLORATORY_SEEN_WEEKS_5_9", "EXPLORATORY"].map((w) => [w, rows.filter((r) => r.window === w).length])) },
    confirmatory: Object.fromEntries(fams.map((f) => [f, confirmatoryLook(f, rows.filter((r) => r.confirmatory), carry[f])])),
    exploratory: by(() => true),
    byWeek: Object.fromEntries(weeks.map((w) => [w, Object.fromEntries(fams.map((f) => [f, rows.filter((r) => `${r.season}-w${r.week}` === w && r.families[f]?.model).length]))])),
    byStarterMatch: strata("starterMatch"),
    byEligibility: strata("eligibility"),
    rows,
  };
}
