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
 *   METRICS         n; MAE of the receipt median; bias (actual − median); cov80 (p10 ≤ actual ≤ p90); the trailing-mean
 *                   baseline's MAE (the QB's own earlier 2026 games, ≥ 1 game, else excluded from the baseline pair);
 *                   the paired MAE difference with a game-clustered 95% bootstrap interval (deterministic seed). For the
 *                   counts, count log loss / Brier at 0.5 / 1.5 / 2.5 only where the receipt carries a count PMF
 *                   (simulation-receipt@2.1, 2026-11-10 on) — never approximated from quantiles.
 *   STRATA          starter match (projected QB = the actual starter, the QB with the most attempts); eligibility@1 state
 *                   at freeze when the contract is available (`eligibilityAt`), else PENDING_ELIGIBILITY_CONTRACT.
 */

export const QB_PROPS_LEDGER_SCHEMA = "gtp.nfl.qb-props-ledger@0";
export const QB_PROPS_COUNTS_SCHEMA = "gtp.nfl.qb-props-forward-counts@0";
/** sha256 of each pre-registration file the founder has APPROVED in writing. Empty: nothing may be graded yet. */
export const APPROVED_PREREG_SHA256 = Object.freeze([]);
/** Weeks looked at before any threshold was approved (disclosed 2026-11-10): permanently exploratory, never confirmatory. */
export const SEEN_EXPLORATORY_WEEKS = Object.freeze([5, 6, 7, 8, 9]);
/** May grading run with this pre-registration file? Only when its sha256 is an approved one. */
export const gradingApproved = (preregSha256, approvals = APPROVED_PREREG_SHA256) => typeof preregSha256 === "string" && approvals.includes(preregSha256);
export const QB_FAMILIES = Object.freeze([
  { family: "passYds", stat: "passYds", actual: "passYds", kind: "continuous" },
  { family: "passCmp", stat: "cmp", actual: "passCmp", kind: "continuous" },
  { family: "passAtt", stat: "passAtt", actual: "passAtt", kind: "continuous" },
  { family: "passTd", stat: "passTd", actual: "passTd", kind: "count", lines: [0.5, 1.5, 2.5] },
  { family: "passInt", stat: "int", actual: "passInt", kind: "count", lines: [0.5, 1.5] },
]);
export const FROM_DATE = "2026-10-06";
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
        (byDate[day] ??= Object.fromEntries(fams.map((x) => [x, 0])))[f.family] += 1;
        (byElig[elig] ??= Object.fromEntries(fams.map((x) => [x, 0])))[f.family] += 1;
      }
    }
  }
  return {
    schema: QB_PROPS_COUNTS_SCHEMA,
    rule: "receipt of record = latest generatedAt < eventStart; projected QB = largest pass-attempt median; NOT joined to any final",
    receiptsOfRecord: records.length, excluded, qbRows, withCountPmf, total,
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

const pmfLogLoss = (pmf, y) => { const p = pmf[Math.min(pmf.length - 1, Math.max(0, y))]; return -Math.log(Math.max(p, 1e-6)); };
const pmfOver = (pmf, line) => pmf.reduce((a, p, k) => a + (k > line ? p : 0), 0);

/**
 * @param {{ entries: Array<{file:string, receipt:object}>, games: Array<object>, verified: Map<string, {teamPassYds: Record<string, number>}>,
 *   eligibilityAt?: (args: { playerId: string, teamAbbr: string, asOf: string }) => ({ state: string } | null) }} a
 *   games: player-events-v1 game rows (providerEventId, week, dateUtc, players[] with passAtt / passCmp / passYds / passTd / passInt)
 *   verified: the settlement source's FINAL games, with each team's passing yards (the cross-check)
 */
export function gradeQbProps({ entries, games, verified, eligibilityAt = null, from = FROM_DATE, preregSha256 = null, approvals = APPROVED_PREREG_SHA256 }) {
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
      const prior = games.filter((x) => ms(x.dateUtc) < ms(receipt.eventStart)).flatMap((x) => x.players.filter((p) => p.playerId === pid && p.passAtt != null));
      const elig = eligibilityAt ? eligibilityAt({ playerId: pid, teamAbbr: team, asOf: receipt.generatedAt }) : null;
      rows.push({
        eventId: id, week: g.week, team, playerId: pid, name: qb.name ?? actual.name, receipt: file, receiptGeneratedAt: receipt.generatedAt, eventStart: receipt.eventStart,
        starterMatch: starter?.playerId === pid, eligibility: elig?.state ?? "PENDING_ELIGIBILITY_CONTRACT",
        families: Object.fromEntries(QB_FAMILIES.map((f) => {
          const q = qb.stats?.[f.stat] ?? null;
          const y = actual[f.actual];
          const base = prior.length ? mean(prior.map((p) => p[f.actual] ?? 0)) : null;
          const pmf = f.kind === "count" ? qb.countPmf?.[f.stat] ?? null : null;
          return [f.family, q && Number.isFinite(y) ? {
            actual: y, p10: q.p10, p50: q.p50, p90: q.p90, baseline: base == null ? null : r4(base), priorGames: prior.length,
            ...(pmf ? { logLoss: r4(pmfLogLoss(pmf, y)), brier: Object.fromEntries(f.lines.map((l) => [l, r4((pmfOver(pmf, l) - (y > l ? 1 : 0)) ** 2)])) } : {}),
          } : null];
        })),
      });
    }
  }
  return { rows, counts };
}

/** Metrics per family over a set of rows (no verdict). */
export function familyMetrics(rows, family) {
  const xs = rows.map((r) => ({ eventId: r.eventId, f: r.families[family] })).filter((x) => x.f);
  const n = xs.length;
  if (!n) return { n: 0 };
  const err = xs.map((x) => Math.abs(x.f.actual - x.f.p50));
  const paired = xs.filter((x) => x.f.baseline != null);
  const diffByGame = new Map();
  for (const x of paired) {
    const d = Math.abs(x.f.actual - x.f.p50) - Math.abs(x.f.actual - x.f.baseline);
    (diffByGame.get(x.eventId) ?? diffByGame.set(x.eventId, []).get(x.eventId)).push(d);
  }
  const clusters = [...diffByGame.values()];
  let ci = null;
  if (clusters.length >= 2) {
    const next = rng(BOOTSTRAP.seed);
    const stats = [];
    for (let b = 0; b < BOOTSTRAP.resamples; b++) {
      let s = 0, c = 0;
      for (let i = 0; i < clusters.length; i++) { const k = clusters[Math.floor(next() * clusters.length)]; for (const d of k) { s += d; c += 1; } }
      stats.push(s / c);
    }
    stats.sort((a, b) => a - b);
    ci = [r4(stats[Math.floor(0.025 * stats.length)]), r4(stats[Math.ceil(0.975 * stats.length) - 1])];
  }
  const withPmf = xs.filter((x) => x.f.logLoss != null);
  return {
    n,
    games: new Set(xs.map((x) => x.eventId)).size,
    mae: r4(mean(err)),
    bias: r4(mean(xs.map((x) => x.f.actual - x.f.p50))),
    cov80: r4(mean(xs.map((x) => (x.f.actual >= x.f.p10 && x.f.actual <= x.f.p90 ? 1 : 0)))),
    baselinePaired: paired.length,
    baselineMae: paired.length ? r4(mean(paired.map((x) => Math.abs(x.f.actual - x.f.baseline)))) : null,
    modelMinusBaselineMae: paired.length ? r4(mean(paired.map((x) => Math.abs(x.f.actual - x.f.p50) - Math.abs(x.f.actual - x.f.baseline)))) : null,
    modelMinusBaselineMaeCi95: ci,
    countPmfN: withPmf.length,
    ...(withPmf.length ? { logLoss: r4(mean(withPmf.map((x) => x.f.logLoss))) } : {}),
  };
}

/** The ledger: totals and per-week n per family, by stratum. Deterministic: no wall-clock field. */
export function buildLedger({ graded, inputs }) {
  const { rows, counts } = graded;
  const fams = QB_FAMILIES.map((f) => f.family);
  const by = (pred) => Object.fromEntries(fams.map((f) => [f, familyMetrics(rows.filter(pred), f)]));
  const weeks = [...new Set(rows.map((r) => r.week))].sort((a, b) => a - b);
  const strata = (key) => Object.fromEntries([...new Set(rows.map((r) => String(r[key])))].sort().map((v) => [v, by((r) => String(r[key]) === v)]));
  return {
    schema: QB_PROPS_LEDGER_SCHEMA,
    status: "EXPERIMENTAL — no verdict; the pre-registration (DRAFT) must be signed off by the founder before the first look",
    rule: "receipt of record = latest generatedAt < eventStart; projected QB = largest pass-attempt median; actuals = verified finals",
    inputs,
    counts: { ...counts, qbGames: rows.length },
    all: by(() => true),
    byWeek: Object.fromEntries(weeks.map((w) => [`week${w}`, Object.fromEntries(fams.map((f) => [f, familyMetrics(rows.filter((r) => r.week === w), f).n]))])),
    byStarterMatch: strata("starterMatch"),
    byEligibility: strata("eligibility"),
    rows,
  };
}
