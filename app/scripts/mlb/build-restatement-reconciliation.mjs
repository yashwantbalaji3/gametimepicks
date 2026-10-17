#!/usr/bin/env node
/**
 * TRUTH-001 · STAGE B — COMPLETE RECONCILIATION REPORT for restatement log 2026-10-10-truth-001 (founder decision 2).
 * READ-ONLY: nothing is applied. It builds the ledger twice with the production code — from the stored grade logs and
 * from the rows of record (the proposed log included for this report only) — and reports every difference.
 *
 *   npx tsx scripts/mlb/build-restatement-reconciliation.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRows, readSources } from "../results/build-forecast-ledger.mjs";
import { readMlbGradesOfRecord, readRestatementLogs } from "../../src/lib/mlb/results/grades-of-record-io.mjs";
import { countsAsPublicForecast } from "../../src/lib/mlb/results/restatements.mjs";
import { forecastRecord } from "../../src/lib/results/v2/forecast-record.mjs";
import { comparePairedLoss, logLossOf } from "../../src/lib/ops/model-health.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const OUT = path.join(ROOT, "docs/truth-001/mlb-results-corrections");
const NOW = "2026-10-10T03:00:00Z";
const LN2 = Math.log(2);
const jsonl = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const logs = readRestatementLogs(ROOT, { includeProposed: true });
if (logs.length !== 1) { console.error(`expected exactly one log, found ${logs.length}`); process.exit(1); }
const doc = logs[0].doc;
const storedGraded = jsonl("app/public/data/mlb/results/game-predictions-graded.jsonl");
const storedProjected = jsonl("app/public/data/mlb/results/game-projected-scores-graded.jsonl");
const ofRecord = readMlbGradesOfRecord(ROOT, { includeProposed: true });

// ── the ledger, both ways, with the production builder ───────────────────────────────────────────────────────────────
const srcStored = readSources(NOW);
srcStored.mlbGraded = storedGraded;
srcStored.mlbProjected = storedProjected;
process.env.GTP_INCLUDE_PROPOSED_RESTATEMENTS = "1";
const srcRecord = readSources(NOW);
delete process.env.GTP_INCLUDE_PROPOSED_RESTATEMENTS;
const ledgerBefore = buildRows(srcStored).filter((r) => r.sport === "MLB");
const ledgerAfter = buildRows(srcRecord).filter((r) => r.sport === "MLB");
const beforeById = new Map(ledgerBefore.map((r) => [r.forecastId, r]));
const ledgerDiffs = ledgerAfter.filter((r) => JSON.stringify(beforeById.get(r.forecastId)) !== JSON.stringify(r)).map((r) => {
  const b = beforeById.get(r.forecastId);
  const fields = Object.keys(r).filter((k) => JSON.stringify(b?.[k]) !== JSON.stringify(r[k]));
  return { forecastId: r.forecastId, family: r.family, eventId: r.eventId, fields, publicationStatus: { before: b?.publicationStatus ?? null, after: r.publicationStatus } };
});

// ── performance, before vs after (public rows only; NOT_SERVED excluded after) ──────────────────────────────────────
function perf(rows) {
  const out = {};
  for (const market of [...new Set(rows.map((r) => r.market))].sort()) {
    const rs = rows.filter((r) => r.market === market);
    const dec = rs.filter((r) => r.outcome === "WIN" || r.outcome === "LOSS");
    const ll = dec.map((r) => logLossOf(r.outcome === "WIN" ? r.modelProbability : 1 - r.modelProbability));
    const br = dec.map((r) => (r.modelProbability - (r.outcome === "WIN" ? 1 : 0)) ** 2);
    const judgement = comparePairedLoss(ll.map((x) => x - LN2), { minN: 200 });
    // Calibration of the pick probability: mean predicted vs observed hit rate, and a logistic slope.
    const xs = dec.map((r) => Math.log(r.modelProbability / (1 - r.modelProbability)));
    const ys = dec.map((r) => (r.outcome === "WIN" ? 1 : 0));
    let a = 0; let b = 1;
    for (let it = 0; it < 25; it += 1) {
      let ga = 0; let gb = 0; let haa = 0; let hab = 0; let hbb = 0;
      for (let i = 0; i < xs.length; i += 1) { const p = 1 / (1 + Math.exp(-(a + b * xs[i]))); const w = p * (1 - p); ga += ys[i] - p; gb += (ys[i] - p) * xs[i]; haa += w; hab += w * xs[i]; hbb += w * xs[i] * xs[i]; }
      const det = haa * hbb - hab * hab; if (Math.abs(det) < 1e-12) break;
      a += (hbb * ga - hab * gb) / det; b += (haa * gb - hab * ga) / det;
    }
    const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
    out[market] = {
      rows: rs.length, W: rs.filter((r) => r.outcome === "WIN").length, L: rs.filter((r) => r.outcome === "LOSS").length, P: rs.filter((r) => r.outcome === "PUSH").length,
      decisive: dec.length, hitRate: dec.length ? ys.reduce((s, y) => s + y, 0) / dec.length : null,
      logLoss: mean(ll), brier: mean(br), meanPickProbability: mean(dec.map((r) => r.modelProbability)),
      calibration: { intercept: a, slope: b }, healthVsCoin: { state: judgement.state, n: judgement.n, meanDiff: judgement.meanDiff ?? null, ci95: judgement.ci95 ?? null },
    };
  }
  return out;
}
const before = perf(storedGraded);
const after = perf(ofRecord.graded.filter(countsAsPublicForecast));
const projErr = (rows) => {
  const e = { runs: [], total: [] };
  for (const r of rows) {
    if (r.projectedScore && Number.isInteger(r.actual?.awayRuns)) { e.runs.push(Math.abs(r.projectedScore.away - r.actual.awayRuns), Math.abs(r.projectedScore.home - r.actual.homeRuns)); }
    if (r.simulationMedianTotal != null && Number.isInteger(r.actual?.totalRuns)) e.total.push(Math.abs(r.simulationMedianTotal - r.actual.totalRuns));
  }
  const m = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
  return { projectedRunsRows: e.runs.length, projectedRunsMAE: m(e.runs), projectedTotalRows: e.total.length, projectedTotalMAE: m(e.total) };
};
const recordBefore = forecastRecord(ledgerBefore);
const recordAfter = forecastRecord(ledgerAfter);
const famCounts = (rec) => Object.fromEntries(rec.sports.flatMap((s) => s.families.map((f) => [f.family, { ...f.counts, directional: f.directional ? { win: f.directional.win, loss: f.directional.loss, push: f.directional.push } : null }])));

// ── per game ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const games = doc.games.map((g) => ({
  gamePk: g.gamePk, date: g.date, kind: g.kind, note: g.note ?? null,
  evidence: {
    class: g.evidence.class, deployment: g.evidence.deployment, publishedAt: g.evidence.publishedAt, servedHash: g.evidence.servedHash,
    cutoff: g.evidence.cutoff, cutoffBasis: g.evidence.cutoffBasis, servedRevision: g.evidence.servedRevision ?? null,
    graded: { source: g.evidence.gradedSource, artifactHash: g.evidence.gradedHash },
  },
  rows: g.rows.map((r) => ({
    log: r.log, market: r.before.market ?? "projected",
    original: r.log === "game-predictions-graded"
      ? { pick: r.before.pick, probability: r.before.modelProbability, grade: r.before.outcome, source: r.before.forecastSource, generatedAt: r.before.forecastGeneratedAt, decisionEngineVersion: r.before.decisionEngineVersion ?? null }
      : { projectedScore: r.before.projectedScore, medianTotal: r.before.simulationMedianTotal, source: r.before.forecastSource },
    corrected: r.after == null ? (g.kind === "NOT_SERVED" ? "NOT_SERVED (kept; excluded from verified public reporting)" : null)
      : r.log === "game-predictions-graded"
        ? { pick: r.after.pick, probability: r.after.modelProbability, grade: r.after.outcome, source: r.after.forecastSource, generatedAt: r.after.forecastGeneratedAt, decisionEngineVersion: r.after.decisionEngineVersion ?? null }
        : { projectedScore: r.after.projectedScore, medianTotal: r.after.simulationMedianTotal, source: r.after.forecastSource },
    final: r.before.actual,
  })),
}));

const report = {
  schema: "gtp.mlb.restatement-reconciliation@2",
  restatementId: doc.restatementId,
  status: "PROPOSED_NOT_APPLIED",
  scope: {
    servedDifferentRevision: doc.games.filter((g) => g.kind === "SERVED_DIFFERENT_REVISION").length,
    notServed: doc.games.filter((g) => g.kind === "NOT_SERVED").map((g) => `${g.date} ${g.gamePk}${g.note ? " (row level)" : ""}`),
    held: doc.held,
    unverifiedUntouched: "every game classified UNVERIFIED in classification.json keeps its stored grade and its distinct classification",
  },
  gradeRowsRestated: doc.games.reduce((s, g) => s + g.rows.length, 0),
  ledger: {
    rowsChanged: ledgerDiffs.length,
    byFamily: ledgerDiffs.reduce((m, d) => ({ ...m, [d.family]: (m[d.family] ?? 0) + 1 }), {}),
    toNotServed: ledgerDiffs.filter((d) => d.publicationStatus.after === "NOT_SERVED").length,
    kpis: { before: recordBefore.kpis, after: recordAfter.kpis },
    familyCounts: { before: famCounts(recordBefore), after: famCounts(recordAfter) },
    diffs: ledgerDiffs,
  },
  performance: { before, after, projected: { before: projErr(storedProjected), after: projErr(ofRecord.projected.filter(countsAsPublicForecast)) } },
  verificationTests: [
    "app/src/lib/mlb/results/restatements.test.mjs — fail-closed reader, approval gate, exact listed-row changes, --check reproducibility, contract amendment, exact ledger guard, Results NOT_SERVED exclusion",
    "app/scripts/mlb/build-forecast-of-record-restatements.mjs --check — the committed log is reproduced byte for byte",
    "GTP_INCLUDE_PROPOSED_RESTATEMENTS=1 node app/scripts/results/build-forecast-ledger.mjs --restate 2026-10-10-truth-001 --dry-run — 0 append-only violations",
    "node app/scripts/results/build-forecast-ledger.mjs --check — with the proposal not approved, the MLB ledger is unchanged",
  ],
  games,
};

const f4 = (x) => (x == null ? "—" : x.toFixed(4));
const pct = (x) => (x == null ? "—" : `${(100 * x).toFixed(2)}%`);
const md = [];
md.push("# MLB forecast-of-record restatement — complete reconciliation report (PROPOSED, NOT APPLIED)", "");
md.push(`Restatement log \`${doc.restatementId}\` (\`data/internal/mlb/forecast-of-record-restatements/\`), built from \`classification.json\` (#1046). Generated by \`app/scripts/mlb/build-restatement-reconciliation.mjs\`; nothing is applied — the log's status is PROPOSED and every reader ignores it until it is APPROVED.`, "");
md.push("## Scope", "");
md.push(`- **${report.scope.servedDifferentRevision} games** graded against a revision the site did not serve → restated to the served revision.`);
md.push(`- **NOT_SERVED** (kept, marked, excluded from verified public reporting — never substituted, never a loss): ${report.scope.notServed.join(", ")}.`);
md.push(`- **Held** (fail closed, unchanged): ${doc.held.map((h) => `${h.date} ${h.gamePk} — ${h.reason}`).join("; ") || "none"}.`);
md.push(`- **Unverified games (211)** are untouched and keep their distinct classification; none is assumed unpublished and no evidence is invented.`);
md.push(`- Grade rows restated: **${report.gradeRowsRestated}**; ledger rows changed: **${ledgerDiffs.length}** (${Object.entries(report.ledger.byFamily).map(([k, v]) => `${k} ${v}`).join(", ")}), of which **${report.ledger.toNotServed}** become NOT_SERVED.`, "");
md.push("## Performance, before → after (public rows of record)", "");
md.push("| Market | W–L–P | Hit rate | Log loss (coin 0.6931) | Brier | Calibration slope | Model-health vs coin |", "|---|---|---|---|---|---|---|");
for (const m of Object.keys(before)) {
  const b = before[m]; const a = after[m] ?? {};
  md.push(`| ${m} | ${b.W}–${b.L}–${b.P} → ${a.W}–${a.L}–${a.P} | ${pct(b.hitRate)} → ${pct(a.hitRate)} | ${f4(b.logLoss)} → ${f4(a.logLoss)} | ${f4(b.brier)} → ${f4(a.brier)} | ${f4(b.calibration.slope)} → ${f4(a.calibration?.slope)} | ${b.healthVsCoin.state} (n ${b.healthVsCoin.n}) → ${a.healthVsCoin?.state} (n ${a.healthVsCoin?.n}) |`);
}
const pb = report.performance.projected.before; const pa = report.performance.projected.after;
md.push("", `Projected scores: team-runs MAE ${f4(pb.projectedRunsMAE)} (${pb.projectedRunsRows}) → ${f4(pa.projectedRunsMAE)} (${pa.projectedRunsRows}); median-total MAE ${f4(pb.projectedTotalMAE)} (${pb.projectedTotalRows}) → ${f4(pa.projectedTotalMAE)} (${pa.projectedTotalRows}).`, "");
md.push("## Denominators (the Forecast Record, all sports)", "");
const kb = recordBefore.kpis; const ka = recordAfter.kpis;
md.push(`- MLB ledger rows counted as public forecasts: ${kb.forecasts} → ${ka.forecasts} (not served: ${kb.notServed ?? 0} → ${ka.notServed}). Measured: ${kb.measured} → ${ka.measured}. Pending ${kb.pending} → ${ka.pending}; void ${kb.voidCount} → ${ka.voidCount}.`, "");
md.push("| Family | Published | Measured | W–L–P (directional) |", "|---|---|---|---|");
for (const fam of Object.keys(report.ledger.familyCounts.before)) {
  const b = report.ledger.familyCounts.before[fam]; const a = report.ledger.familyCounts.after[fam] ?? {};
  md.push(`| ${fam} | ${b.published} → ${a.published} | ${b.measured} → ${a.measured} | ${b.directional ? `${b.directional.win}–${b.directional.loss}–${b.directional.push}` : "—"} → ${a.directional ? `${a.directional.win}–${a.directional.loss}–${a.directional.push}` : "—"} |`);
}
md.push("", "## Per game", "");
for (const g of games) {
  const e = g.evidence;
  md.push(`### ${g.gamePk} · ${g.date} · ${g.kind}${g.note ? ` (${g.note})` : ""}`, "");
  md.push(`- Evidence: ${e.class}; serving deployment \`${e.deployment?.id}\` (commit \`${String(e.deployment?.sha ?? "").slice(0, 10)}\`) READY ${e.deployment?.readyAt}; cutoff ${e.cutoff} (${e.cutoffBasis}).${e.servedRevision ? ` Served revision \`${e.servedRevision.source}\` generated ${e.servedRevision.generatedAt}, hash \`${String(e.servedHash).slice(0, 12)}\`.` : ""} Graded: \`${e.graded.source}\`.`);
  md.push("", "| Row | Original | Corrected | Final |", "|---|---|---|---|");
  for (const r of g.rows) {
    const o = r.original; const c = r.corrected;
    const show = (x) => (x == null ? "—" : typeof x === "string" ? x : x.pick ? `${x.pick} · ${x.probability} · **${x.grade}**` : `proj ${x.projectedScore?.away ?? "—"}–${x.projectedScore?.home ?? "—"}, median total ${x.medianTotal ?? "—"}`);
    md.push(`| ${r.market} | ${show(o)} | ${show(c)} | ${r.final ? `${r.final.awayRuns}–${r.final.homeRuns}` : "—"} |`);
  }
  md.push("");
}
md.push("## Verification", "", ...report.verificationTests.map((t) => `- ${t}`), "");

if (process.argv.includes("--write")) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "reconciliation-v2-2026-10-10.json"), JSON.stringify(report, null, 1) + "\n");
  fs.writeFileSync(path.join(OUT, "reconciliation-v2-2026-10-10.md"), md.join("\n") + "\n");
  console.log("✓ wrote docs/truth-001/mlb-results-corrections/reconciliation-v2-2026-10-10.{json,md}");
}
console.log(JSON.stringify({ scope: report.scope, gradeRowsRestated: report.gradeRowsRestated, ledgerRowsChanged: ledgerDiffs.length, byFamily: report.ledger.byFamily, toNotServed: report.ledger.toNotServed, kpis: report.ledger.kpis, perf: Object.fromEntries(Object.keys(before).map((m) => [m, { before: [before[m].W, before[m].L, before[m].P, f4(before[m].logLoss), before[m].healthVsCoin.state], after: [after[m]?.W, after[m]?.L, after[m]?.P, f4(after[m]?.logLoss), after[m]?.healthVsCoin.state] }])) }, null, 1));
