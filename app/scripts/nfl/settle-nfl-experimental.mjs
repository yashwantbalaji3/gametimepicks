/**
 * Experimental-forecast settlement (Program 174 · Release G). PRIVATE PAPER RECORD.
 *
 * Grades each public-beta forecast against its own immutable pre-kickoff receipt, exactly once,
 * into a ledger that is SEPARATE from validated picks, market benchmark, MLB, Bank Builder,
 * Moonshot, and Mr. Dub. Nothing here can move money.
 *
 * WHAT IS GRADED, and why it is not a win/loss record: an experimental forecast is a distribution,
 * not a bet. So each event records winner correctness, margin and total absolute error, whether
 * the actual result fell inside the published 80% intervals, plus Brier and log loss on the
 * calibrated win probability — and the same three quantities for the MARKET, so the two can be
 * compared without either being called a wager.
 *
 * EXACTLY ONCE: a settled canonicalEventId is skipped on rerun. Corrections append lineage and
 * recompute the summary; the original pre-event receipt and prior result version are preserved.
 * A malformed event quarantines itself and never throws the slate.
 *
 * Usage: node scripts/nfl/settle-nfl-experimental.mjs --now <iso> [--date YYYY-MM-DD]
 * Writes: data/internal/nfl/experimental-settlement/<date>.json  (+ summary.json)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { summariseByCohort } from "../../src/lib/sports/nfl/experimental-summary.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const DATE = arg("--date", NOW.slice(0, 10));
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const receiptDir = path.join(ROOT, "data/internal/nfl/forecast-receipts", DATE);
if (!fs.existsSync(receiptDir)) { console.log(`NOT_YET_OBSERVABLE: no forecast receipts for ${DATE}`); process.exit(0); }
/**
 * The FORECAST OF RECORD is the latest PRE-KICKOFF revision, not the first file written.
 *
 * Caught by this script's own fixture: when the calibration λ changed, regeneration wrote the new
 * values to a `-rev-` file and left the original in place — so the receipt of record said 50.0%
 * while the published page said 47.9%, and settlement would have graded numbers no reader ever
 * saw. A pre-kickoff revision is a legitimate correction; the original is preserved as lineage.
 * Anything stamped at/after kickoff is ignored outright — a post-start file is never of record.
 */
const receipts = new Map();
const lineageChain = new Map();
for (const f of fs.readdirSync(receiptDir).filter((x) => x.endsWith(".json"))) {
  const r = read(path.join(receiptDir, f));
  if (!r?.providerEventId) continue;
  const kickoff = Date.parse(r.kickoffUtc);
  if (!(Date.parse(r.generatedAt) < kickoff)) continue; // post-start files are never of record
  const prev = receipts.get(r.providerEventId);
  (lineageChain.get(r.providerEventId) ?? lineageChain.set(r.providerEventId, []).get(r.providerEventId)).push({ file: f, generatedAt: r.generatedAt, inputHash: r.model?.inputHash });
  if (!prev || r.generatedAt > prev.r.generatedAt) receipts.set(r.providerEventId, { file: f, r });
}
for (const chain of lineageChain.values()) chain.sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));

const results = read(path.join(APP, "public/data/nfl/results/latest.json"));
const resultRows = new Map((results?.rows ?? []).map((r) => [r.providerEventId, r]));
const outPath = path.join(ROOT, "data/internal/nfl/experimental-settlement", `${DATE}.json`);
const prior = read(outPath);
const already = new Map((prior?.events ?? []).map((e) => [e.canonicalEventId, e]));

const nowMs = Date.parse(NOW);
const clamp01 = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const events = [];
const pending = [];
const quarantined = [];

for (const [providerEventId, { file, r }] of receipts) {
  try {
    if (already.has(r.canonicalEventId)) continue; // exactly once
    const kickoff = Date.parse(r.kickoffUtc);
    if (nowMs < kickoff) { pending.push({ canonicalEventId: r.canonicalEventId, matchup: r.matchup, state: "PRE_KICKOFF", kickoffUtc: r.kickoffUtc }); continue; }
    const res = resultRows.get(providerEventId);
    if (!res || !/^STATUS_FINAL/.test(res.statusRaw ?? "")) {
      pending.push({ canonicalEventId: r.canonicalEventId, matchup: r.matchup, state: "AWAITING_OFFICIAL_RESULT", kickoffUtc: r.kickoffUtc, observed: res?.statusRaw ?? "no result row" });
      continue;
    }
    if (!Number.isInteger(res.ftHome) || !Number.isInteger(res.ftAway)) {
      quarantined.push({ canonicalEventId: r.canonicalEventId, reason: "FINAL without integer scores — quarantined, never guessed" });
      continue;
    }

    const s = r.forecastSummary;
    const actualMargin = res.ftHome - res.ftAway;
    const actualTotal = res.ftHome + res.ftAway;
    const homeWon = actualMargin > 0;
    const tie = actualMargin === 0;
    const pHome = s.winProbability.home;
    // a distribution is graded as a distribution, never as a bet
    const grade = {
      actual: { home: res.ftHome, away: res.ftAway, margin: actualMargin, total: actualTotal, tie },
      winner: tie ? { outcome: "TIE", correct: null, note: "a tie has no winner side; excluded from the decisive denominator" }
        : { outcome: homeWon ? "HOME" : "AWAY", modelFavoured: pHome > 0.5 ? "HOME" : pHome < 0.5 ? "AWAY" : "EVEN", correct: pHome === 0.5 ? null : (pHome > 0.5) === homeWon },
      margin: { projected: s.margin.median, actual: actualMargin, absError: Math.abs(s.margin.median - actualMargin), insideInterval80: actualMargin >= s.margin.p10 && actualMargin <= s.margin.p90 },
      total: { projected: s.total.median, actual: actualTotal, absError: Math.abs(s.total.median - actualTotal), insideInterval80: actualTotal >= s.total.p10 && actualTotal <= s.total.p90 },
      score: { projected: s.projectedScore, absError: Math.abs(s.projectedScore.home - res.ftHome) + Math.abs(s.projectedScore.away - res.ftAway) },
      probabilistic: tie ? null : {
        brier: Number(((clamp01(pHome) - (homeWon ? 1 : 0)) ** 2).toFixed(6)),
        logLoss: Number((homeWon ? -Math.log(clamp01(pHome)) : -Math.log(1 - clamp01(pHome))).toFixed(6)),
      },
    };
    // the market benchmark, graded identically so the two are comparable — and kept in its own lane
    const mc = r.marketComparison;
    const marketBenchmark = (!tie && mc?.state === "MARKET_VIEW" && typeof mc.marketHomeWinPct === "number")
      ? {
        homeWinPct: mc.marketHomeWinPct,
        brier: Number(((clamp01(mc.marketHomeWinPct) - (homeWon ? 1 : 0)) ** 2).toFixed(6)),
        logLoss: Number((homeWon ? -Math.log(clamp01(mc.marketHomeWinPct)) : -Math.log(1 - clamp01(mc.marketHomeWinPct))).toFixed(6)),
        totalAbsError: typeof mc.marketTotal === "number" ? Math.abs(mc.marketTotal - actualTotal) : null,
        note: "the sportsbooks' own numbers graded the same way — a benchmark, kept in its own lane and never merged into the model's record",
      }
      : null;

    events.push({
      canonicalEventId: r.canonicalEventId,
      providerEventId,
      matchup: r.matchup,
      kickoffUtc: r.kickoffUtc,
      /* Season cohort travels ON the settled row (P196 · Release E) — the receipt has carried it
         since P173, and the lifetime summary aggregates within a cohort, never across. */
      seasonType: r.seasonType ?? null,
      week: r.week ?? null,
      lineage: {
        receiptFile: `data/internal/nfl/forecast-receipts/${DATE}/${file}`,
        model: r.model.id, modelVersion: r.model.version, inputHash: r.model.inputHash,
        forecastGeneratedAt: r.generatedAt,
        // the full pre-kickoff revision chain: the graded receipt is the LAST entry, and every
        // earlier version is preserved rather than replaced
        revisionChain: lineageChain.get(providerEventId) ?? [],
        marketCapturedAt: mc?.capturedAt ?? null,
        resultSource: results?.source?.id ?? "espn_scoreboard",
        resultObservedAt: results?.generatedAt ?? null,
        settledAt: NOW,
        settlementVersion: 1,
      },
      grade,
      marketBenchmark,
    });
  } catch (e) {
    quarantined.push({ canonicalEventId: r?.canonicalEventId ?? providerEventId, reason: `settlement error: ${String(e?.message ?? e)} — one malformed event never throws the slate` });
  }
}

const allEvents = [...(prior?.events ?? []), ...events];
const decisive = allEvents.filter((e) => e.grade.winner.correct !== null);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (v) => (v == null ? null : Number(v.toFixed(4)));

const metrics = {
  settledForecasts: allEvents.length,
  decisive: decisive.length,
  ties: allEvents.filter((e) => e.grade.actual.tie).length,
  winnerCorrect: decisive.filter((e) => e.grade.winner.correct).length,
  winnerAccuracy: round(decisive.length ? decisive.filter((e) => e.grade.winner.correct).length / decisive.length : null),
  marginMAE: round(mean(allEvents.map((e) => e.grade.margin.absError))),
  totalMAE: round(mean(allEvents.map((e) => e.grade.total.absError))),
  marginInterval80Coverage: round(mean(allEvents.map((e) => (e.grade.margin.insideInterval80 ? 1 : 0)))),
  totalInterval80Coverage: round(mean(allEvents.map((e) => (e.grade.total.insideInterval80 ? 1 : 0)))),
  brier: round(mean(decisive.map((e) => e.grade.probabilistic.brier))),
  logLoss: round(mean(decisive.map((e) => e.grade.probabilistic.logLoss))),
};
const benchEvents = allEvents.filter((e) => e.marketBenchmark);
const benchmark = benchEvents.length ? {
  n: benchEvents.length,
  brier: round(mean(benchEvents.map((e) => e.marketBenchmark.brier))),
  logLoss: round(mean(benchEvents.map((e) => e.marketBenchmark.logLoss))),
  totalMAE: round(mean(benchEvents.map((e) => e.marketBenchmark.totalAbsError).filter((x) => x != null))),
} : null;

const receipt = {
  schemaVersion: 1,
  artifact: "nfl-experimental-forecast-settlement",
  dataClass: "PRIVATE_PAPER_RECORD",
  ledger: "experimental-forecast",
  date: DATE,
  generatedAt: NOW,
  modelVersion: [...receipts.values()][0]?.r?.model?.id ?? null,
  scope: "Experimental FORECAST accuracy only. This ledger is separate from validated picks, the market benchmark, MLB, Bank Builder, Moonshot, and Mr. Dub, and can never move money.",
  whatIsGraded: "A forecast is a distribution, not a wager: winner correctness, margin/total error, 80% interval coverage, Brier and log loss. There is no W-L or ROI here because nothing was staked.",
  events: allEvents,
  pending,
  quarantined,
  accounting: {
    receipts: receipts.size,
    settled: allEvents.length,
    pending: pending.length,
    quarantined: quarantined.length,
    reconciles: allEvents.length + pending.length + quarantined.length === receipts.size,
  },
  metrics,
  marketBenchmark: benchmark,
  comparison: benchmark && metrics.brier != null
    ? { modelBrier: metrics.brier, marketBrier: benchmark.brier, note: "shown side by side because the founder asked for transparency; a single slate cannot establish which is better and this is not a claim that it does" }
    : null,
};
if (!receipt.accounting.reconciles) { console.error(`REFUSED: population gap — ${receipts.size} receipts ≠ ${allEvents.length} settled + ${pending.length} pending + ${quarantined.length} quarantined`); process.exit(2); }

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(receipt, null, 1));

/*
 * THE SUMMARY IS A LIFETIME RECORD, SO IT IS BUILT FROM EVERY DATED RECEIPT.
 *
 * `metrics` above is scoped to ONE DATE — `allEvents` is that date's prior receipt plus what this
 * run graded. Writing those per-date numbers into summary.json meant a run on a day with no
 * forecasts published `settledForecasts: 0` and "No experimental forecast has been settled yet",
 * erasing the whole record.
 *
 * That is not hypothetical. The record held 7 settled forecasts at 57.14% winner accuracy; the
 * 2026-08-17 14:55Z run — a day whose next NFL kickoff is Aug 20 — reset it to zero. It had flapped
 * between 7 and 0 for two days, because a stale local copy kept getting committed back over it.
 * It is the same failure the MLB player-prop settlement hit: a DAILY job rewriting a CUMULATIVE
 * file from one day's view of the world.
 *
 * Re-derived from the receipts on disk every run, so it is reconstructible and can never depend on
 * whatever the previous summary happened to say.
 */
const lifetime = (() => {
  const dir = path.dirname(outPath);
  /*
   * Keyed by canonicalEventId, NOT concatenated. The receipts are very nearly disjoint but not
   * exactly: nfl-401874392 is graded in both 2026-08-13 and 2026-08-14 (a late final landing after
   * the first day's run). Summing the files would count it twice and quietly inflate the record —
   * the one direction an accuracy ledger must never drift. Later dates win, so the newest grade for
   * an event is the one that counts.
   */
  const byId = new Map();
  for (const f of fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()) {
    try {
      for (const e of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).events ?? []) {
        if (e?.canonicalEventId) byId.set(e.canonicalEventId, e);
      }
    } catch { /* a malformed day never erases the rest */ }
  }
  // The date just written is on disk already, so it is included above — no double count.
  const evs = [...byId.values()];
  /*
   * COHORTS, NEVER A BLEND (P196 · Release E). Season type resolves from the settled row itself
   * (stamped going forward), falling back to the row's OWN receipt file — every receipt has
   * carried seasonType since P173, so a historical row resolves from its own frozen evidence
   * rather than a calendar guess. Unresolvable rows land in UNKNOWN and pad neither cohort.
   */
  const resolveSeasonType = (e) => {
    if (Number.isFinite(e?.seasonType)) return e.seasonType;
    const rel = e?.lineage?.receiptFile;
    if (!rel) return null;
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"))?.seasonType ?? null; } catch { return null; }
  };
  return summariseByCohort(evs, resolveSeasonType);
})();

/*
 * The headline block is EXACTLY ONE COHORT, its scope named (P196 · Release E). The top-level
 * fields keep their historical names so the index embed stays shape-compatible, but they are the
 * current cohort's numbers — never a cross-cohort sum. When the first regular-season game settles
 * the headline flips to that cohort at its honest small n; preseason keeps its own block under
 * `cohorts`, unchanged, instead of padding the new season's record.
 */
fs.writeFileSync(path.join(path.dirname(outPath), "summary.json"), JSON.stringify({
  schemaVersion: 2, artifact: "nfl-experimental-record", dataClass: "PUBLIC_DERIVED", generatedAt: NOW,
  ledger: "experimental-forecast", modelVersion: receipt.modelVersion,
  seasonTypeScope: lifetime.seasonTypeScope,
  settledForecasts: lifetime.current.settledForecasts, decisive: lifetime.current.decisive,
  winnerAccuracy: lifetime.current.winnerAccuracy, marginMAE: lifetime.current.marginMAE, totalMAE: lifetime.current.totalMAE,
  marginInterval80Coverage: lifetime.current.marginInterval80Coverage, totalInterval80Coverage: lifetime.current.totalInterval80Coverage,
  cohorts: lifetime.cohorts,
  unknownSeasonTypeRows: lifetime.unknownCount,
  note: lifetime.current.settledForecasts === 0
    ? "No experimental forecast has been settled yet. A record appears here once the first slate's official results land."
    : `Experimental forecast accuracy only — not a betting record, and separate from every product ledger. Scope: ${lifetime.seasonTypeScope} cohort; season types never share an aggregate.`,
}, null, 1));

console.log(`experimental settlement ${DATE}: ${events.length} newly settled (${allEvents.length} total) · ${pending.length} pending · ${quarantined.length} quarantined`);
if (metrics.settledForecasts) console.log(`  winner ${metrics.winnerCorrect}/${metrics.decisive} · marginMAE ${metrics.marginMAE} · totalMAE ${metrics.totalMAE} · cov80 ${metrics.marginInterval80Coverage}/${metrics.totalInterval80Coverage} · brier ${metrics.brier}${benchmark ? ` (market ${benchmark.brier})` : ""}`);
else console.log(`  NOT_YET_OBSERVABLE: ${pending[0]?.state ?? "no receipts"} — ${pending[0]?.matchup ?? ""} at ${pending[0]?.kickoffUtc ?? ""}`);
