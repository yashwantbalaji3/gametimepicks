#!/usr/bin/env node
/**
 * Build the EPL closing-line benchmark (P258): graded forecasts vs football-data.co.uk de-vigged market-average
 * closing 1X2, on the same matches. INTERNAL research artifact — per-match closing probabilities stay under
 * data/internal (football-data is free for research use; raw prices are not redistributed). $0.
 *
 * Usage (from app/): node scripts/soccer/build-epl-closing-benchmark.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { joinClosing, summarizeBenchmark } from "../../src/lib/sports/epl/closing-benchmark.mjs";
import { league } from "../../src/lib/sports/soccer/leagues.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const LEDGER = path.join(ROOT, "app/public/data/soccer/epl/results/graded-forecasts.jsonl");
const CORPUS = path.join(ROOT, "data/internal/research/soccer/epl/corpus-football-data-v1.json");
const OUT = path.join(ROOT, "data/internal/research/soccer/epl/closing-benchmark-v1.json");

const graded = fs.readFileSync(LEDGER, "utf8").split("\n").filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
const { joined, unjoined } = joinClosing({ graded, corpusRows: corpus.rows, aliases: league("epl").aliases });
const summary = summarizeBenchmark(joined);

const f = (x) => (x == null ? "—" : x.toFixed(4));
console.log(`EPL closing benchmark: ${summary.matches} joined of ${graded.length} graded (${summary.sampleState})`);
console.log(`  model  log loss ${f(summary.model.meanLogLoss)} · Brier ${f(summary.model.meanBrier)}`);
console.log(`  market log loss ${f(summary.market.meanLogLoss)} · Brier ${f(summary.market.meanBrier)}`);
console.log(`  gap (model − market) ${f(summary.logLossGap.mean)} ± ${f(summary.logLossGap.standardError)} (1 s.e.; positive = market scored better)`);
for (const u of unjoined) console.log(`  unjoined ${u.eventId}: ${u.reason}`);

const artifact = {
  schemaVersion: "epl-closing-benchmark.v1",
  dataClass: "INTERNAL_RESEARCH",
  generatedAt: new Date().toISOString(),
  attribution: "Closing odds: football-data.co.uk market average, de-vigged (free for research use). Results and forecasts: this project's graded ledger.",
  note: "Not a validation and not a wagering claim. Gap = model minus market log loss on identical matches; lower is better.",
  corpusGeneratedAt: corpus.generatedAt ?? null,
  gradedRows: graded.length,
  summary,
  unjoined,
  rows: joined,
};
fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2) + "\n");
console.log(`wrote ${path.relative(ROOT, OUT)}`);
