/**
 * IMMUTABLE pregame-versus-final audit (Program 180 · Release A). PRIVATE_RESEARCH + public summary.
 *
 * A model cannot learn from outcomes it never scores. This scores an ET slate's frozen pregame
 * forecasts against official finals, and it is deliberately built so that it CANNOT rewrite the
 * thing it is scoring:
 *
 *   - it only READS receipts, never writes to `forecast-receipts/`;
 *   - the forecast of record is the latest revision generated strictly BEFORE kickoff, chosen by
 *     timestamp rather than by which one looks better against the result;
 *   - a game with no pre-kickoff receipt is `MISSING_PRE_EVENT_ARTIFACT` and stays in the
 *     denominator. Silent exclusion is the failure mode that makes every retrospective flattering.
 *
 * WHAT IT REFUSES TO DO. It does not refit, retune, or pick a champion. Six games cannot close a
 * hypothesis; they can expose a data defect, an invariance defect, or an interval that is the wrong
 * width. Every residual becomes a ticket with an acceptance test, not a weight change.
 *
 * BASELINE HONESTY. Where the frozen artifact was baseline-only (no event-specific signal applied),
 * it is scored as a BASELINE DIAGNOSTIC and labelled as one. Retroactively calling it a pick would
 * be the same category error in the opposite direction.
 *
 * Usage: node scripts/nfl/audit-nfl-pregame-vs-final.mjs --now <iso> --et-date <YYYY-MM-DD>
 * Writes: data/internal/nfl/pregame-audit/<et-date>.json    (append-only; refuses to overwrite)
 *         app/public/data/nfl/pregame-audit-latest.json     (PUBLIC_DERIVED summary)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
const ET_DATE = arg("--et-date");
const FORCE = process.argv.includes("--allow-rewrite");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
if (!/^\d{4}-\d{2}-\d{2}$/.test(ET_DATE ?? "")) { console.error("REFUSED: --et-date <YYYY-MM-DD> required"); process.exit(1); }
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const etDay = (iso) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

// ── the OUTCOME side: official finals from the canonical capture ───────────────────────────────
const results = read(path.join(APP, "public/data/nfl/results/latest.json"));
if (!results?.rows) { console.error("REFUSED: no official results capture — an audit without outcomes is not an audit"); process.exit(2); }
const finals = new Map(
  results.rows
    .filter((r) => /^STATUS_FINAL/.test(r.statusRaw ?? "") && etDay(r.dateUtc) === ET_DATE)
    .map((r) => [r.providerEventId, r]),
);

// ── the PREDICTION side: every frozen receipt whose kickoff lands on this ET day ────────────────
const receiptRoot = path.join(ROOT, "data/internal/nfl/forecast-receipts");
const byEvent = new Map();
for (const dir of fs.existsSync(receiptRoot) ? fs.readdirSync(receiptRoot) : []) {
  const full = path.join(receiptRoot, dir);
  if (!fs.statSync(full).isDirectory()) continue;
  for (const file of fs.readdirSync(full).filter((f) => f.endsWith(".json"))) {
    const r = read(path.join(full, file));
    if (!r?.kickoffUtc || etDay(r.kickoffUtc) !== ET_DATE) continue;
    byEvent.set(r.providerEventId, [...(byEvent.get(r.providerEventId) ?? []), { ...r, _file: `${dir}/${file}` }]);
  }
}

/** The forecast of record: the LATEST revision generated strictly before kickoff. Never the best-looking one. */
const forecastOfRecord = (versions) => {
  const preStart = versions
    .filter((r) => Date.parse(r.generatedAt) < Date.parse(r.kickoffUtc))
    .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
  return preStart[preStart.length - 1] ?? null;
};

// ── scoring ────────────────────────────────────────────────────────────────────────────────────
const clamp = (p) => Math.min(1 - 1e-9, Math.max(1e-9, p));
const rows = [];
const missing = [];

for (const [eventId, final] of finals) {
  const versions = byEvent.get(eventId);
  const rec = versions ? forecastOfRecord(versions) : null;
  if (!rec) {
    missing.push({
      providerEventId: eventId,
      matchup: final.shortName,
      state: "MISSING_PRE_EVENT_ARTIFACT",
      reason: "no receipt generated before kickoff exists for this game; it stays in the denominator and is NOT reconstructed after the fact",
    });
    continue;
  }

  const s = rec.forecastSummary;
  const actualHome = final.ftHome;
  const actualAway = final.ftAway;
  const actualMargin = actualHome - actualAway;
  const actualTotal = actualHome + actualAway;
  const tie = actualMargin === 0;

  const pHome = s.winProbability.home;
  const decisive = !tie;
  // Winner correctness is only defined on a decisive game. A tie is not a loss — scoring it as one
  // is how a preseason record quietly becomes pessimistic.
  const winnerCorrect = decisive ? ((actualMargin > 0) === (pHome > 0.5)) : null;
  const brier = decisive ? ((pHome - (actualMargin > 0 ? 1 : 0)) ** 2) : null;
  const logLoss = decisive ? -Math.log(clamp(actualMargin > 0 ? pHome : 1 - pHome)) : null;

  const mkt = rec.marketComparison ?? null;
  const mktPre = mkt?.capturedAt && Date.parse(mkt.capturedAt) < Date.parse(rec.kickoffUtc) ? mkt : null;
  const mktBrier = mktPre && decisive && typeof mktPre.marketHomeWinPct === "number"
    ? (mktPre.marketHomeWinPct - (actualMargin > 0 ? 1 : 0)) ** 2 : null;

  const inRange = (v, lo, hi) => v >= lo && v <= hi;

  // ── attribution, from the frozen inputs only ────────────────────────────────────────────────
  const attribution = [];
  const baselineOnly = (rec.teamSignal?.state ?? "NOT_RECORDED") !== "APPLIED";
  if (baselineOnly) attribution.push("SHARED_PRIOR: no event-specific team signal was applied, so this row is a baseline diagnostic rather than a game-specific claim");
  if (Math.abs(actualMargin - s.margin.median) > 14) attribution.push("MARGIN_DISPERSION: the realised margin was far outside the centre of a distribution built on league-average dispersion");
  if (Math.abs(actualTotal - s.total.median) > 10) attribution.push("TOTAL_DISPERSION: the realised total was far from the shared scoring prior");
  if (!inRange(actualMargin, s.margin.p10, s.margin.p90)) attribution.push("INTERVAL_MISS_MARGIN: the 80% margin interval did not contain the result");
  if (!inRange(actualTotal, s.total.p10, s.total.p90)) attribution.push("INTERVAL_MISS_TOTAL: the 80% total interval did not contain the result");
  if (tie) attribution.push("TIE: a preseason tie — the model published tie mass and the outcome landed on it");
  if (attribution.length === (baselineOnly ? 1 : 0)) attribution.push("EXPECTED_NOISE: the result sits inside what this distribution anticipated");

  rows.push({
    providerEventId: eventId,
    canonicalEventId: rec.canonicalEventId,
    matchup: rec.matchup,
    kickoffUtc: rec.kickoffUtc,
    // ── freeze receipt ──
    frozen: {
      file: rec._file,
      generatedAt: rec.generatedAt,
      revisionsBeforeKickoff: versions.filter((r) => Date.parse(r.generatedAt) < Date.parse(r.kickoffUtc)).length,
      model: rec.model,
      readiness: baselineOnly ? "BASELINE_ONLY" : "SIMULATION_READY",
      fallbackReason: baselineOnly ? (rec.teamSignal?.note ?? "the frozen artifact predates the signal-state field; it was produced by the same shared-prior engine") : null,
      evidence: rec.evidence ?? null,
    },
    // ── the whole distribution, not a rounded headline ──
    predicted: {
      projectedScore: s.projectedScore,
      scoreRange: s.scoreRange ?? null,
      margin: s.margin,
      total: s.total,
      winProbability: s.winProbability,
    },
    // ── the outcome ──
    actual: {
      status: final.statusRaw,
      home: actualHome, away: actualAway, margin: actualMargin, total: actualTotal,
      tie,
      winner: tie ? null : (actualMargin > 0 ? rec.home.abbr : rec.away.abbr),
    },
    // ── scores ──
    scores: {
      homeAbsError: Math.abs(actualHome - s.projectedScore.home),
      awayAbsError: Math.abs(actualAway - s.projectedScore.away),
      marginAbsError: Math.abs(actualMargin - s.margin.median),
      totalAbsError: Math.abs(actualTotal - s.total.median),
      marginInInterval80: inRange(actualMargin, s.margin.p10, s.margin.p90),
      totalInInterval80: inRange(actualTotal, s.total.p10, s.total.p90),
      homeScoreInRange: s.scoreRange ? inRange(actualHome, s.scoreRange.homeP10, s.scoreRange.homeP90) : null,
      awayScoreInRange: s.scoreRange ? inRange(actualAway, s.scoreRange.awayP10, s.scoreRange.awayP90) : null,
      winnerCorrect, brier, logLoss,
      residualSign: actualMargin - s.margin.median > 0 ? "HOME_OUTPERFORMED" : actualMargin - s.margin.median < 0 ? "AWAY_OUTPERFORMED" : "EXACT",
    },
    // ── frozen market benchmark ──
    market: mktPre
      ? { state: "FROZEN_PRE_KICKOFF", capturedAt: mktPre.capturedAt, books: mktPre.books,
          homeWinNoVig: mktPre.marketHomeWinPct, spreadHome: mktPre.marketSpreadHome, total: mktPre.marketTotal, brier: mktBrier }
      : { state: "NO_FROZEN_SNAPSHOT", note: "no market snapshot captured before this kickoff — no benchmark is claimed rather than substituting a closing line" },
    // ── products ──
    products: {
      selected: false,
      reason: "no NFL output was eligible for any paper product: an experimental forecast may never become a product leg (output-state.permitsProductLeg requires VALIDATED_PICK)",
      exposure: 0,
    },
    attribution,
  });
}

// ── population exactness ───────────────────────────────────────────────────────────────────────
const scheduledIds = new Set([...finals.keys()]);
const accounting = {
  officialFinals: finals.size,
  scoredWithFrozenForecast: rows.length,
  missingPreEventArtifact: missing.length,
  reconciles: rows.length + missing.length === finals.size,
  everyRowConsumedOnce: new Set(rows.map((r) => r.providerEventId)).size === rows.length,
  unjoinedReceipts: [...byEvent.keys()].filter((id) => !scheduledIds.has(id)),
};

const decisive = rows.filter((r) => r.scores.winnerCorrect !== null);
const avg = (xs) => (xs.length ? Number((xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(4)) : null);
const cohort = {
  n: rows.length,
  decisiveN: decisive.length,
  ties: rows.filter((r) => r.actual.tie).length,
  winnersCorrect: decisive.filter((r) => r.scores.winnerCorrect).length,
  teamScoreMAE: avg(rows.flatMap((r) => [r.scores.homeAbsError, r.scores.awayAbsError])),
  marginMAE: avg(rows.map((r) => r.scores.marginAbsError)),
  totalMAE: avg(rows.map((r) => r.scores.totalAbsError)),
  marginInterval80Coverage: avg(rows.map((r) => (r.scores.marginInInterval80 ? 1 : 0))),
  totalInterval80Coverage: avg(rows.map((r) => (r.scores.totalInInterval80 ? 1 : 0))),
  modelBrier: avg(decisive.map((r) => r.scores.brier)),
  marketBrier: avg(decisive.filter((r) => r.market.brier != null).map((r) => r.market.brier)),
  modelLogLoss: avg(decisive.map((r) => r.scores.logLoss)),
  baselineOnlyRows: rows.filter((r) => r.frozen.readiness === "BASELINE_ONLY").length,
};
cohort.modelBeatsMarketBrier = cohort.marketBrier != null ? cohort.modelBrier < cohort.marketBrier : null;

// ── tickets: residuals become work, never weights ──────────────────────────────────────────────
const tickets = [];
if (cohort.marginInterval80Coverage != null && cohort.marginInterval80Coverage < 0.7) {
  tickets.push({ id: "INTERVAL-WIDTH-MARGIN", hypothesis: "the 80% margin interval is too narrow for preseason dispersion",
    evidence: `coverage ${cohort.marginInterval80Coverage} over n=${cohort.n} against a 0.80 target`,
    acceptanceTest: "leave-one-season-out coverage on the committed preseason corpus lands in [0.75, 0.85] before any width change ships",
    owner: "ENGINEERING", candidateRelease: "P180-D (possession engine) — width is a property of the engine, not a knob to turn now" });
}
if (cohort.modelBeatsMarketBrier === false) {
  tickets.push({ id: "MARKET-GAP", hypothesis: "the model's winner probabilities are worse than the de-vigged market",
    evidence: `model Brier ${cohort.modelBrier} vs market ${cohort.marketBrier} over n=${cohort.decisiveN} decisive games`,
    acceptanceTest: "a challenger must beat the frozen market benchmark on a FORWARD window of at least 40 games before any promotion claim",
    owner: "ENGINEERING", candidateRelease: "P180-D" });
}
if (cohort.baselineOnlyRows === cohort.n && cohort.n > 0) {
  tickets.push({ id: "NO-EVENT-SPECIFIC-SIGNAL", hypothesis: "every scored row came from a shared prior, so these residuals measure the PRIOR, not a game-specific model",
    evidence: `${cohort.baselineOnlyRows}/${cohort.n} rows were baseline-only at freeze time`,
    acceptanceTest: "a possession/drive candidate must clear predeclared held-out bars before any row here is described as a game-specific forecast",
    owner: "ENGINEERING", candidateRelease: "P180-D" });
}
if (cohort.ties > 0) {
  tickets.push({ id: "TIE-POLICY-CONFIRMED", hypothesis: "preseason ties are real and must never score as losses",
    evidence: `${cohort.ties} tie(s) in n=${cohort.n}; excluded from winner accuracy and from Brier by contract`,
    acceptanceTest: "the settlement contract keeps ties out of winner accuracy and reports decisiveN separately",
    owner: "ENGINEERING", candidateRelease: "SHIPPED — recorded so the policy is not re-litigated" });
}

const audit = {
  schemaVersion: 1,
  artifact: "nfl-pregame-vs-final-audit",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  etDate: ET_DATE,
  immutability: "This audit READS frozen receipts and never writes to forecast-receipts/. The forecast of record is the latest revision generated strictly before kickoff, chosen by timestamp — never by which one scored best.",
  didNotRefit: "No model was fitted, tuned or promoted from these outcomes. Six games cannot close a hypothesis; they expose defects and calibrate monitoring.",
  accounting,
  cohort,
  rows,
  missing,
  tickets,
};

const outDir = path.join(ROOT, "data/internal/nfl/pregame-audit");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `${ET_DATE}.json`);
if (fs.existsSync(outPath) && !FORCE) {
  const existing = read(outPath);
  // Append-only: re-running is fine when nothing changed; a DIFFERENT verdict for the same slate
  // would mean history was rewritten, so it refuses instead.
  const same = JSON.stringify(existing?.rows) === JSON.stringify(rows) && JSON.stringify(existing?.cohort) === JSON.stringify(cohort);
  if (!same) { console.error(`REFUSED: ${ET_DATE} is already audited with different results — history is not rewritten`); process.exit(3); }
}
fs.writeFileSync(outPath, JSON.stringify(audit, null, 2) + "\n");

// ── PUBLIC summary: the record, with its denominator, and no research payload ───────────────────
const publicSummary = {
  schemaVersion: 1,
  artifact: "nfl-pregame-audit-public",
  dataClass: "PUBLIC_DERIVED",
  generatedAt: NOW,
  etDate: ET_DATE,
  headline: `We scored all ${cohort.n} of our ${ET_DATE} NFL forecasts against the official finals.`,
  whatThisIs:
    cohort.baselineOnlyRows === cohort.n
      ? "Every forecast on this slate was a baseline: the model had no measured read separating the two teams, so these numbers grade a league-average preseason prior, not a game-specific prediction."
      : "Each forecast was frozen before kickoff and graded against the official result.",
  n: cohort.n,
  decisiveGames: cohort.decisiveN,
  ties: cohort.ties,
  winnersCorrect: cohort.winnersCorrect,
  teamScoreAverageError: cohort.teamScoreMAE,
  marginAverageError: cohort.marginMAE,
  totalAverageError: cohort.totalMAE,
  rangeHitRate: { margin: cohort.marginInterval80Coverage, total: cohort.totalInterval80Coverage, target: 0.8 },
  versusSportsbooks:
    cohort.marketBrier == null
      ? "No frozen pre-kickoff price existed for enough games to compare."
      : cohort.modelBeatsMarketBrier
        ? `On this small sample our winner probabilities scored better than the sportsbook consensus (${cohort.modelBrier} vs ${cohort.marketBrier}, lower is better) — ${cohort.decisiveN} games is far too few to mean anything.`
        : `Our winner probabilities scored WORSE than the sportsbook consensus (${cohort.modelBrier} vs ${cohort.marketBrier}, lower is better) across ${cohort.decisiveN} decisive games.`,
  honestLimit: `${cohort.n} games. A record this small says almost nothing about a model; it is published because grading every forecast is the only way the numbers stay honest, not because it is evidence of skill.`,
  games: rows.map((r) => ({
    matchup: r.matchup,
    predicted: `${r.predicted.projectedScore.away}-${r.predicted.projectedScore.home}`,
    actual: `${r.actual.away}-${r.actual.home}`,
    marginError: r.scores.marginAbsError,
    totalError: r.scores.totalAbsError,
    inRange: r.scores.marginInInterval80 && r.scores.totalInInterval80,
    tie: r.actual.tie,
    readiness: r.frozen.readiness,
  })),
};
fs.writeFileSync(path.join(APP, "public/data/nfl/pregame-audit-latest.json"), JSON.stringify(publicSummary, null, 2) + "\n");

console.log(`pregame audit ${ET_DATE}: ${cohort.n} scored · ${missing.length} missing · reconciles ${accounting.reconciles}`);
console.log(`  winners ${cohort.winnersCorrect}/${cohort.decisiveN} decisive (${cohort.ties} tie) · teamScoreMAE ${cohort.teamScoreMAE} · marginMAE ${cohort.marginMAE} · totalMAE ${cohort.totalMAE}`);
console.log(`  interval80 coverage: margin ${cohort.marginInterval80Coverage} · total ${cohort.totalInterval80Coverage}`);
console.log(`  Brier model ${cohort.modelBrier} vs market ${cohort.marketBrier} → beats market: ${cohort.modelBeatsMarketBrier}`);
console.log(`  tickets: ${tickets.map((t) => t.id).join(", ") || "none"}`);
if (!accounting.reconciles) { console.error("REFUSED: population does not reconcile"); process.exit(4); }
