#!/usr/bin/env node
/**
 * TRUTH-001 · STAGE B — RECONCILIATION REPORT for the MLB forecast-of-record corrections (founder decision 3,
 * 2026-10-09). READ-ONLY: it applies nothing. Graded logs, the forecast ledger and Results are untouched; the report is
 * the evidence the founder (and the Results owner) review before any correction is applied.
 *
 *   npx tsx scripts/mlb/build-results-correction-reconciliation.mjs [--write]
 *
 * Input: the 14 PROPOSED_NOT_APPLIED records (app/public/data/mlb/corrections/forecast-of-record-corrections.jsonl,
 * Stage A / #1042), each naming the graded forecast (generated before first pitch, never served by a Production
 * deployment before it) and the newest revision a READY Production deployment DID serve before first pitch.
 *
 * Per game it states: event id; currently graded forecast and its (absent) publication evidence; the public forecast of
 * record and its deployment evidence; model / decision versions; for every ledger family the game carries (moneyline,
 * run line, total, both projected team runs, projected total) the previous and proposed forecast, the official final,
 * and the previous and proposed W / L / PUSH or error; and the ledger forecastIds affected. Then family-level and
 * aggregate impact over the WHOLE graded population — favourable and unfavourable alike, nothing netted away.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { measureBinary } from "../../src/lib/forecast-ledger/measure.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const OUT = path.join(ROOT, "docs/truth-001/mlb-results-corrections");
const WRITE = process.argv.includes("--write");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }).toString();
const jsonl = (p) => fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const proposals = jsonl(path.join(APP, "public/data/mlb/corrections/forecast-of-record-corrections.jsonl"));
const graded = jsonl(path.join(APP, "public/data/mlb/results/game-predictions-graded.jsonl"));
const projected = jsonl(path.join(APP, "public/data/mlb/results/game-projected-scores-graded.jsonl"));
const ledger = jsonl(path.join(ROOT, "data/internal/forecast-ledger/v1/mlb.jsonl"));

const FAMILY = { moneyline: "mlb_moneyline", run_line: "mlb_run_line", total: "mlb_total" };
const predictionsAt = (sha, date) => {
  try { return new Map(JSON.parse(git("show", `${sha}:app/public/data/mlb/predictions/${date}.json`)).predictions.map((p) => [p.gamePk, p])); } catch { return null; }
};
const pickLoss = (p, outcome) => (outcome === "PUSH" || p == null ? null : measureBinary({ probability: p, observed: outcome === "WIN" ? 1 : 0 }));

const games = [];
const problems = [];
for (const c of proposals) {
  const rows = graded.filter((r) => r.gamePk === c.gamePk && r.date === c.date);
  const proj = projected.find((r) => r.gamePk === c.gamePk && r.date === c.date) ?? null;
  const lrows = ledger.filter((r) => r.eventId === String(c.gamePk) && r.receiptId === c.gradedForecast.source);
  const fin = rows[0]?.actual ?? null;
  // The stored grade must be exactly what the proposal says it is (fail closed: a drifted log is not reconciled).
  for (const g of c.gradedForecast.grades) {
    const s = rows.find((r) => r.market === g.market);
    if (!s || s.pick !== g.pick || s.modelProbability !== g.modelProbability || s.outcome !== g.outcome || s.forecastSource !== c.gradedForecast.source) {
      problems.push(`${c.key} ${g.market}: stored graded row does not match the proposal`);
    }
  }
  const pub = predictionsAt(c.publicForecastOfRecord.commit, c.date)?.get(c.gamePk) ?? null;
  if (!pub || pub.artifactHash !== c.publicForecastOfRecord.artifactHash) problems.push(`${c.key}: public revision not readable at ${c.publicForecastOfRecord.commit.slice(0, 10)} with the stated hash`);
  const markets = c.gradedForecast.grades.map((g) => {
    const a = c.publicForecastOfRecord.grades.find((x) => x.market === g.market) ?? null;
    const before = pickLoss(g.modelProbability, g.outcome);
    const after = a ? pickLoss(a.modelProbability, a.outcome) : null;
    return {
      market: g.market,
      family: FAMILY[g.market],
      forecastId: lrows.find((r) => r.family === FAMILY[g.market])?.forecastId ?? null,
      previous: { pick: g.pick, probability: g.modelProbability, outcome: g.outcome, logLoss: before?.logLoss ?? null, brier: before?.brier ?? null },
      proposed: a ? { pick: a.pick, probability: a.modelProbability, outcome: a.outcome, logLoss: after?.logLoss ?? null, brier: after?.brier ?? null } : null,
      selectionChanged: a ? a.pick !== g.pick : null,
      outcomeChanged: a ? a.outcome !== g.outcome : null,
    };
  });
  const pubScore = pub?.projectedScore ?? null;
  const pubTotal = pub?.total?.simulationMedian ?? null;
  const err = (x, y) => (x == null || y == null ? null : Math.abs(x - y));
  const continuous = proj && fin ? [
    { family: "mlb_projected_runs", subject: proj.awayTeam, previous: proj.projectedScore?.away ?? null, proposed: pubScore?.away ?? null, final: fin.awayRuns },
    { family: "mlb_projected_runs", subject: proj.homeTeam, previous: proj.projectedScore?.home ?? null, proposed: pubScore?.home ?? null, final: fin.homeRuns },
    { family: "mlb_projected_total", subject: "total", previous: proj.simulationMedianTotal ?? null, proposed: pubTotal, final: fin.homeRuns + fin.awayRuns },
  ].map((x) => ({
    ...x,
    forecastId: lrows.find((r) => r.family === x.family && (x.family === "mlb_projected_total" || r.subjectDisplay === x.subject))?.forecastId ?? null,
    previousAbsError: err(x.previous, x.final), proposedAbsError: err(x.proposed, x.final),
  })) : [];
  games.push({
    key: c.key, eventId: String(c.gamePk), date: c.date, matchup: c.matchup, firstPitchUtc: c.firstPitchUtc,
    final: fin ? { away: fin.awayRuns, home: fin.homeRuns, source: rows[0].resultSource } : null,
    reasonCode: c.reasonCode,
    currentlyGraded: {
      source: c.gradedForecast.source, generatedAt: c.gradedForecast.generatedAt, artifactHash: c.gradedForecast.artifactHash,
      decisionEngineVersion: c.gradedForecast.decisionEngineVersion, publicationEvidence: c.gradedForecast.publicationEvidence,
      minutesBeforeFirstPitch: Number(((Date.parse(c.firstPitchUtc) - Date.parse(c.gradedForecast.generatedAt)) / 60000).toFixed(1)),
    },
    publicForecastOfRecord: {
      commit: c.publicForecastOfRecord.commit, generatedAt: c.publicForecastOfRecord.generatedAt, artifactHash: c.publicForecastOfRecord.artifactHash,
      modelVersion: c.publicForecastOfRecord.modelVersion, decisionEngineVersion: c.publicForecastOfRecord.decisionEngineVersion,
      publication: c.publicForecastOfRecord.publication,
    },
    markets,
    continuous,
    ledgerRowsAffected: lrows.map((r) => r.forecastId).sort(),
  });
}

// ── impact over the whole graded population ─────────────────────────────────────────────────────────────────────────
const replace = new Map();
for (const g of games) for (const m of g.markets) if (m.proposed) replace.set(`${g.eventId}|${g.date}|${m.market}`, m.proposed);
function familyStats(useProposed) {
  const out = {};
  for (const r of graded) {
    const p = useProposed ? replace.get(`${r.gamePk}|${r.date}|${r.market}`) : null;
    const outcome = p ? p.outcome : r.outcome;
    const prob = p ? p.probability : r.modelProbability;
    const f = (out[FAMILY[r.market]] ??= { W: 0, L: 0, P: 0, logLossSum: 0, brierSum: 0, measured: 0 });
    if (outcome === "WIN") f.W += 1; else if (outcome === "LOSS") f.L += 1; else f.P += 1;
    const m = pickLoss(prob, outcome);
    if (m) { f.logLossSum += m.logLoss; f.brierSum += m.brier; f.measured += 1; }
  }
  for (const f of Object.values(out)) {
    f.hitRate = f.W / (f.W + f.L);
    f.logLoss = f.logLossSum / f.measured;
    f.brier = f.brierSum / f.measured;
    delete f.logLossSum; delete f.brierSum;
  }
  return out;
}
const before = familyStats(false);
const after = familyStats(true);
const familyImpact = Object.keys(before).map((fam) => ({
  family: fam,
  previous: before[fam], proposed: after[fam],
  winsDelta: after[fam].W - before[fam].W, lossesDelta: after[fam].L - before[fam].L,
  logLossDelta: after[fam].logLoss - before[fam].logLoss, brierDelta: after[fam].brier - before[fam].brier,
}));
const cont = games.flatMap((g) => g.continuous);
const contImpact = ["mlb_projected_runs", "mlb_projected_total"].map((fam) => {
  const xs = cont.filter((x) => x.family === fam && x.previousAbsError != null && x.proposedAbsError != null);
  return { family: fam, rowsChanged: xs.filter((x) => x.previous !== x.proposed).length, rows: xs.length, previousAbsErrorSum: xs.reduce((s, x) => s + x.previousAbsError, 0), proposedAbsErrorSum: xs.reduce((s, x) => s + x.proposedAbsError, 0) };
});
const aggregate = {
  games: games.length,
  ledgerRowsAffected: games.reduce((s, g) => s + g.ledgerRowsAffected.length, 0),
  marketGradesRestated: games.reduce((s, g) => s + g.markets.filter((m) => m.proposed && (m.proposed.probability !== m.previous.probability || m.selectionChanged)).length, 0),
  selectionsChanged: games.reduce((s, g) => s + g.markets.filter((m) => m.selectionChanged).length, 0),
  outcomesChanged: games.reduce((s, g) => s + g.markets.filter((m) => m.outcomeChanged).length, 0),
  outcomeChanges: games.flatMap((g) => g.markets.filter((m) => m.outcomeChanged).map((m) => ({ eventId: g.eventId, market: m.market, from: m.previous.outcome, to: m.proposed.outcome }))),
  unchangedProvenanceOnly: games.filter((g) => g.markets.every((m) => m.proposed && m.proposed.pick === m.previous.pick && m.proposed.probability === m.previous.probability)).map((g) => g.eventId),
};

const report = {
  schema: "gtp.mlb.results-correction-reconciliation@1",
  status: "PROPOSED_NOT_APPLIED",
  basis: "Founder forecast-of-record policy (Option B, 2026-10-09): the forecast of record is the newest revision a READY Production deployment served before first pitch.",
  inputs: {
    proposals: "app/public/data/mlb/corrections/forecast-of-record-corrections.jsonl",
    graded: "app/public/data/mlb/results/game-predictions-graded.jsonl",
    projected: "app/public/data/mlb/results/game-projected-scores-graded.jsonl",
    ledger: "data/internal/forecast-ledger/v1/mlb.jsonl",
    deployments: "data/internal/ops/vercel-production-deployments/2026-09-01_2026-10-09.json",
  },
  problems,
  aggregate,
  familyImpact,
  continuousImpact: contImpact,
  games,
};

const pct = (x) => `${(100 * x).toFixed(2)}%`;
const f4 = (x) => (x == null ? "—" : x.toFixed(4));
const md = [];
md.push("# MLB forecast-of-record corrections — reconciliation report (PROPOSED, NOT APPLIED)", "");
md.push("Generated by `app/scripts/mlb/build-results-correction-reconciliation.mjs` from committed data only. Nothing is applied: the graded logs, the forecast ledger and Results are unchanged.", "");
md.push(`Basis: ${report.basis}`, "");
md.push(`Integrity checks: ${problems.length ? problems.map((p) => `\n- ✗ ${p}`).join("") : "every stored graded row matches its proposal exactly, and every public revision is readable at its commit with the stated artifactHash."}`, "");
md.push("## Aggregate", "");
md.push(`- Games: **${aggregate.games}**. Ledger rows affected: **${aggregate.ledgerRowsAffected}**, across moneyline, run line, total, both projected team runs and projected total.`);
md.push(`- Market grades restated (probability or selection): **${aggregate.marketGradesRestated}**. Selections changed: **${aggregate.selectionsChanged}**. Outcomes changed: **${aggregate.outcomesChanged}**.`);
md.push(`- Provenance-only (same picks and probabilities): ${aggregate.unchangedProvenanceOnly.join(", ") || "none"}.`, "");
md.push("| Event | Market | Previous | Proposed |", "|---|---|---|---|");
for (const o of aggregate.outcomeChanges) md.push(`| ${o.eventId} | ${o.market} | ${o.from} | ${o.to} |`);
md.push("", "## Family-level impact (whole graded population)", "");
md.push("| Family | Previous W–L–P | Proposed W–L–P | Hit rate | Pick log loss | Pick Brier |", "|---|---|---|---|---|---|");
for (const f of familyImpact) {
  md.push(`| ${f.family} | ${f.previous.W}–${f.previous.L}–${f.previous.P} | ${f.proposed.W}–${f.proposed.L}–${f.proposed.P} | ${pct(f.previous.hitRate)} → ${pct(f.proposed.hitRate)} | ${f4(f.previous.logLoss)} → ${f4(f.proposed.logLoss)} | ${f4(f.previous.brier)} → ${f4(f.proposed.brier)} |`);
}
md.push("", "| Continuous family | Rows changed / rows | Sum of absolute error, previous → proposed |", "|---|---|---|");
for (const c of contImpact) md.push(`| ${c.family} | ${c.rowsChanged} / ${c.rows} | ${c.previousAbsErrorSum} → ${c.proposedAbsErrorSum} |`);
md.push("", "Favourable and unfavourable changes are both listed. Nothing is netted away.", "");
md.push("## Per game", "");
for (const g of games) {
  md.push(`### ${g.eventId} · ${g.matchup} · ${g.date} (first pitch ${g.firstPitchUtc})`, "");
  md.push(`- Official final: ${g.final ? `${g.matchup.split(" @ ")[0]} ${g.final.away} – ${g.final.home} ${g.matchup.split(" @ ")[1]} (${g.final.source})` : "—"}`);
  md.push(`- **Currently graded:** \`${g.currentlyGraded.source}\`, generated ${g.currentlyGraded.generatedAt} (${g.currentlyGraded.minutesBeforeFirstPitch} min before first pitch), hash \`${g.currentlyGraded.artifactHash.slice(0, 12)}\`, ${g.currentlyGraded.decisionEngineVersion}. Publication evidence: **none**. No READY Production deployment served it before first pitch.`);
  const p = g.publicForecastOfRecord;
  md.push(`- **Public forecast of record:** commit \`${p.commit.slice(0, 10)}\`, generated ${p.generatedAt}, hash \`${p.artifactHash.slice(0, 12)}\`, ${p.modelVersion} / ${p.decisionEngineVersion}. Served by \`${p.publication.id}\` (commit \`${p.publication.commitSha.slice(0, 10)}\`), READY ${p.publication.readyAt}.`);
  md.push("", "| Market | Previous pick · p · result | Proposed pick · p · result | Ledger row |", "|---|---|---|---|");
  for (const m of g.markets) md.push(`| ${m.market} | ${m.previous.pick} · ${m.previous.probability} · ${m.previous.outcome} | ${m.proposed ? `${m.proposed.pick} · ${m.proposed.probability} · ${m.proposed.outcome}` : "—"}${m.outcomeChanged ? " **(changed)**" : ""} | \`${m.forecastId ?? "—"}\` |`);
  for (const x of g.continuous) md.push(`| ${x.family} ${x.subject} | ${x.previous} (error ${x.previousAbsError}) | ${x.proposed} (error ${x.proposedAbsError}) | \`${x.forecastId ?? "—"}\` |`);
  md.push("");
}

if (WRITE) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "reconciliation-2026-10-09.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "reconciliation-2026-10-09.md"), md.join("\n") + "\n");
  console.log(`✓ wrote ${path.relative(ROOT, OUT)}/reconciliation-2026-10-09.{json,md}`);
}
console.log(JSON.stringify({ problems, aggregate, familyImpact, continuousImpact: contImpact }, null, 2));
