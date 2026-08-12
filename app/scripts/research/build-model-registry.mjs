/**
 * Shared four-sport model registry builder (Program 157 · Release A) — PRIVATE RESEARCH INDEX.
 *
 * EQUIVALENCE BY CONSTRUCTION: the registry is a DERIVED index that echoes the committed research
 * artifacts VERBATIM — metric objects are copied from the evaluation/report files, never
 * recomputed, so populations, predictions, splits, metrics, calibration, coverage, limitations and
 * activation states cannot change during "migration" (there is no migration of numbers, only
 * indexing). Where a sport has no model card (NFL, EPL), the card-only fields render INCOMPLETE —
 * never synthesized.
 *
 * Sport semantics stay TYPED and incomparable: outcome taxonomies are declared per sport and the
 * registry carries NO cross-sport leaderboard — evidence completeness may be compared, performance
 * across different outcome spaces may not.
 *
 * CONTRADICTION VALIDATION is fail-closed: any of the eight conditions below refuses the build.
 *
 * Run: node scripts/research/build-model-registry.mjs --now <ISO>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RESEARCH = path.resolve(APP, "..", "data", "internal", "research");

const argNow = process.argv.indexOf("--now");
if (argNow === -1 || !Number.isFinite(Date.parse(process.argv[argNow + 1] ?? ""))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const NOW = process.argv[argNow + 1];

const read = (...p) => { try { return JSON.parse(fs.readFileSync(path.join(RESEARCH, ...p), "utf8")); } catch { return null; } };
const refuse = (msg) => { console.error(`REFUSED (contradiction): ${msg}`); process.exit(1); };

const SPORTS = [
  {
    sport: "nfl", outcomeTaxonomy: "binary_winner + margin/total point estimates",
    corpus: read("nfl", "corpus-v1.json"), evaluation: read("nfl", "reports", "baseline-evaluation-v1.json"),
    card: read("nfl", "model-card-v1.json"), replay: read("nfl", "replays", "replay-2025-postseason.json"),
    manifest: read("nfl", "raw", "CAPTURE_MANIFEST.json"),
    metricsPath: (ev) => ({ primary: ev.winner.elo.overall, comparators: { homerate: ev.winner.homerate.overall, coin: ev.winner.coin.overall }, score: ev.score }),
    populationPath: (c) => ({ total: c.totalGames, note: `${c.ties} ties preserved; regular 272×3 exact` }),
  },
  {
    sport: "nba", outcomeTaxonomy: "binary_winner + margin/total point estimates",
    corpus: read("nba", "corpus-v1.json"), evaluation: read("nba", "reports", "baseline-evaluation-v1.json"),
    card: read("nba", "model-card-v1.json"), replay: read("nba", "replays", "replay-2026-postseason.json"),
    manifest: read("nba", "raw", "CAPTURE_MANIFEST.json"),
    metricsPath: (ev) => ({ primary: ev.winner.elo.overall, comparators: { homerate: ev.winner.homerate.overall, coin: ev.winner.coin.overall }, score: ev.score }),
    populationPath: (c) => ({ total: c.totalFinals, note: "regular 1,230×3 exact; cup-final own phase; no ties possible" }),
  },
  {
    sport: "epl", outcomeTaxonomy: "three_way_1x2 (multi-class) + goal totals",
    corpus: read("epl", "corpus-v1.json"), evaluation: read("epl", "reports", "baseline-evaluation-v1.json"),
    // Program 167 · Release G committed the EPL card (the promoted split-Poisson v1).
    card: read("epl", "model-card-v1.json"), replay: read("epl", "replays", "replay-2025-26-md38.json"),
    manifest: read("epl", "raw", "CAPTURE_MANIFEST.json"),
    metricsPath: (ev) => ({ primary: ev.models.elo.overall, comparators: { poisson: ev.models.poisson.overall, empirical: ev.models.empirical.overall, uniform: ev.models.uniform.overall } }),
    populationPath: (c) => ({ total: c.totalMatches, note: "4 seasons × exactly 380; 0 quarantined" }),
  },
  {
    sport: "ufc", outcomeTaxonomy: "abstaining_bout_winner (coverage is a headline metric)",
    corpus: read("ufc", "corpus-v1.json"), evaluation: read("ufc", "reports", "baseline-evaluation-v1.json"),
    card: read("ufc", "model-card-v1.json"), replay: read("ufc", "replays", "replay-last-card.json"),
    manifest: read("ufc", "raw", "CAPTURE_MANIFEST.json"),
    metricsPath: (ev) => ({ primary: ev.metrics.elo, comparators: { redRatePrior: ev.metrics.redRatePrior, coin: ev.metrics.coinAnchor }, abstention: ev.abstention }),
    populationPath: (c) => ({ total: c.totalFinalBouts, note: `${c.drawOrNc} draw/NC preserved; ${c.distinctFighters} fighters by provider id` }),
  },
];

const entries = [];
const seen = new Set();
for (const s of SPORTS) {
  if (!s.corpus || !s.evaluation || !s.replay || !s.manifest) refuse(`${s.sport}: a committed artifact is missing — the registry indexes evidence, it never invents it`);
  const key = `${s.sport}@v1`;
  if (seen.has(key)) refuse(`duplicate sport/version ${key}`);
  seen.add(key);

  const metrics = s.metricsPath(s.evaluation);
  if (!metrics.primary || metrics.primary.n == null || metrics.primary.logLoss == null) refuse(`${s.sport}: evaluated without metric+n`);
  const rights = s.manifest.source?.rights ?? s.manifest.files?.[0]?.license;
  if (!rights) refuse(`${s.sport}: no source rights recorded in the capture manifest`);
  if (s.replay.mode !== "HISTORICAL_REPLAY") refuse(`${s.sport}: replay artifact mode ${s.replay.mode} — only HISTORICAL_REPLAY may be indexed as research evidence`);
  const activation = s.card?.publicActivation ?? "OFF — no model card exists; activation is definitionally off";
  if (!/^OFF/.test(activation)) refuse(`${s.sport}: publicActivation "${activation}" without any prerequisite receipts — nothing may be on`);
  if (s.card) {
    // Registry/card agreement: the card's primary metric must byte-match the evaluation's.
    const cardLL = s.card.metrics?.elo?.logLoss;
    if (cardLL != null && cardLL !== metrics.primary.logLoss) refuse(`${s.sport}: card logLoss ${cardLL} disagrees with evaluation ${metrics.primary.logLoss}`);
  }

  entries.push({
    sport: s.sport,
    modelVersion: "baseline-v1",
    objective: s.card?.objective ?? "INCOMPLETE — no model card committed; objective lives in the evaluation artifact header",
    outcomeTaxonomy: s.outcomeTaxonomy,
    sourceRights: rights,
    corpus: { ...s.populationPath(s.corpus), generatedAt: s.corpus.generatedAt },
    split: s.evaluation.leakageRule ?? s.evaluation.evaluation?.split ?? s.evaluation.corpus?.warmupSeason != null ? `warm-up ${s.evaluation.corpus?.warmupSeason ?? s.evaluation.corpus?.warmupBoundary}; chronological walk-forward` : "INCOMPLETE",
    featureCutoff: s.card?.featureCutoff ?? "INCOMPLETE — no model card; cutoff discipline enforced by the replay runner",
    replayMode: s.replay.mode,
    replayDeterministicId: s.replay.deterministicId,
    metrics,
    calibrationRef: "10-bin table in the sport's baseline-evaluation-v1.json",
    limitations: s.card?.limitations ?? ["INCOMPLETE — no model card; limitations stated inside the evaluation artifact"],
    lastEvaluated: s.evaluation.generatedAt,
    evaluationEligible: s.replay.evaluationEligible === true,
    publicActivation: activation,
    artifactRefs: {
      corpus: `data/internal/research/${s.sport}/corpus-v1.json`,
      evaluation: `data/internal/research/${s.sport}/reports/baseline-evaluation-v1.json`,
      replay: `data/internal/research/${s.sport}/replays/`,
      modelCard: s.card ? `data/internal/research/${s.sport}/model-card-v1.json` : null,
    },
  });
}

const registry = {
  schemaVersion: 1,
  artifact: "model-registry",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  comparabilityNote: "entries share evidence STRUCTURE only — outcome spaces differ (binary vs three-way vs abstaining), so cross-sport performance comparison is meaningless and deliberately absent",
  entries,
};
fs.writeFileSync(path.join(RESEARCH, "model-registry-v1.json"), JSON.stringify(registry, null, 1));
console.log(`model-registry-v1.json: ${entries.length} entries (${entries.map((e) => `${e.sport}${e.artifactRefs.modelCard ? "" : "*"}`).join(", ")}) — * = card fields INCOMPLETE`);
