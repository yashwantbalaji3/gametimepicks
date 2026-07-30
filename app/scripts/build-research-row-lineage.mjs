/**
 * Build the per-row research lineage sidecar.
 *
 * WHAT IT PRODUCES
 *   public/data/research/row-lineage/index.json        coverage per slate, every state, every date
 *   public/data/research/row-lineage/gap-history.json  the settled model-vs-market difference table
 *   public/data/research/row-lineage/<date>.json       the envelopes a row-level claim is allowed on
 *   data/internal/mlb/research-row-lineage/<date>.json every envelope for that date, including the
 *                                                      unstamped and withheld ones
 *
 * The public file carries only rows whose provenance is proven, because those are the only rows a
 * reader can check. The internal file carries all of them, because the count of what was excluded is
 * part of an honest artifact and deleting the excluded rows would make the exclusion unprovable.
 *
 * WHY A SIDECAR AND NOT A LEDGER MIGRATION
 * `public/data/mlb/results/settled_leans.jsonl` is the official settlement record. Rewriting it to add
 * provenance would mean editing settled history to make it look better documented than it was, and
 * every historical audit would then be checking the rewrite rather than the record. This exporter is
 * additive and idempotent: delete the output directory, run it again, get byte-identical files for the
 * same inputs and the same `--now`.
 *
 * ROW-LEVEL vs AGGREGATE-ONLY
 * Envelopes are written per row only for dates the pregame archive covers. Every other date gets an
 * aggregate entry in the index, marked `rowLevel: false`, whose rows are all `LEGACY_UNSTAMPED`. That
 * is not a size optimisation — it is the policy. A date with no capture record cannot support a
 * per-row claim, so no per-row file is published for it.
 *
 * It refuses to write when any envelope fails `validateRowLineage`. A provenance file that ships with
 * a row claiming timing it cannot source is worse than no provenance file.
 *
 * Usage:
 *   npx tsx scripts/build-research-row-lineage.mjs [--write] [--self-test] [--now <iso>]
 */
import fs from "node:fs";
import path from "node:path";

import {
  bucketForGap,
  buildGapBucketTable,
  noVigProbability,
} from "../src/lib/research/disagreement-buckets.ts";
import {
  ROW_SCHEMA_VERSION,
  summarizeCoverage,
  validateRowLineage,
} from "../src/lib/research/row-lineage.ts";
import {
  archiveDates,
  boardDates,
  buildDateLineage,
  loadLineageContext,
  LINEAGE_ARTIFACT_DIR,
} from "../src/lib/research/row-lineage-loader.ts";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const BOARDS = path.join(APP, "public/data/mlb/boards");
const INTERNAL_DIR = path.join(REPO, "data/internal/mlb/research-row-lineage");

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const SELF_TEST = argv.includes("--self-test");
const nowFlag = argv.indexOf("--now");
const GENERATED_AT = nowFlag >= 0 && argv[nowFlag + 1] ? argv[nowFlag + 1] : new Date().toISOString();

const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

/** Stable key order so re-running on unchanged inputs produces an unchanged file. */
const stableStringify = (obj) => `${JSON.stringify(obj, null, 2)}\n`;
/** Compact form for the full internal envelope sets, which run to tens of thousands of rows. */
const compactStringify = (obj) => `${JSON.stringify(obj)}\n`;

/**
 * The settled model-vs-market difference corpus.
 *
 * Built from the board (the pregame row) joined to the ledger (the graded outcome), which is the only
 * join that yields both a probability and a result for the same prediction. Rows an integrity gate
 * refused are carried in with `countsTowardRates: false` so the bucket table can report how many were
 * excluded rather than silently shrinking its own denominator.
 */
function gapHistory(lineageByDate) {
  const rows = [];
  for (const [date, lineage] of lineageByDate) {
    const board = readJson(path.join(BOARDS, `${date}.json`));
    if (!board?.leans) continue;
    const boardById = new Map(board.leans.map((l) => [String(l.id ?? ""), l]));
    const envelopeById = new Map(lineage.rows.map((r) => [r.rowId, r]));

    for (const [id, env] of envelopeById) {
      const lean = boardById.get(id);
      if (!lean) continue;
      const side = String(lean.lean ?? "").toLowerCase();
      if (side !== "over" && side !== "under") continue; // a Pass is not a probability claim

      const raw = side === "over" ? lean.modelProbOver : lean.modelProbUnder;
      if (typeof raw !== "number") continue;
      const market = noVigProbability(lean.impliedOver, lean.impliedUnder, side);
      if (market == null) continue;

      const outcome = String(env.settlement.outcome ?? "");
      if (outcome !== "Win" && outcome !== "Loss") continue; // undecided rows are not observations

      rows.push({
        date,
        marketKey: env.market.key ?? "",
        gapPp: (raw - market) * 100,
        statedProbability: raw,
        won: outcome === "Win",
        countsTowardRates: env.countsTowardRates,
      });
    }
  }
  return rows;
}

function main() {
  const ctx = loadLineageContext();
  const withArchive = new Set(archiveDates());
  const dates = boardDates().slice().sort();

  const lineageByDate = new Map();
  const problems = [];

  for (const date of dates) {
    const lineage = buildDateLineage(date, ctx);
    lineageByDate.set(date, lineage);
    problems.push(...lineage.violations);
  }

  const history = gapHistory(lineageByDate);
  const table = buildGapBucketTable(history);

  const index = {
    kind: "research-row-lineage-index",
    rowSchemaVersion: ROW_SCHEMA_VERSION,
    generatedAt: GENERATED_AT,
    asOfSettledDate: ctx.asOfSettledDate,
    // Stated up front so a reader of the artifact sees the policy, not only its consequences.
    coveragePolicy:
      "Per-row envelopes are published only for dates a pregame capture archive covers. Every other " +
      "date is aggregate-only: its rows are LEGACY_UNSTAMPED and may be counted in a total whose size " +
      "is shown, never quoted individually. Capture times are never reconstructed after the fact.",
    dates: dates.map((date) => {
      const l = lineageByDate.get(date);
      return {
        date,
        rowLevel: withArchive.has(date) && l.archivePresent,
        total: l.coverage.total,
        byState: l.coverage.byState,
        rowLevelClaimable: l.coverage.rowLevelClaimable,
        countable: l.coverage.countable,
      };
    }),
  };

  const gapArtifact = {
    kind: "research-gap-history",
    rowSchemaVersion: ROW_SCHEMA_VERSION,
    generatedAt: GENERATED_AT,
    asOfSettledDate: ctx.asOfSettledDate,
    method:
      "Signed difference in percentage points between the simulation's probability for the side it leaned " +
      "and the same side's de-vigged sportsbook price, bucketed and scored against the settled outcome. " +
      "Rows refused by an integrity gate are excluded from every denominator and counted separately.",
    totalRows: table.totalRows,
    excludedRows: table.excludedRows,
    window: table.window,
    buckets: table.buckets.map((b) => ({
      id: b.bucket.id,
      label: b.bucket.label,
      fromPp: Number.isFinite(b.bucket.fromPp) ? b.bucket.fromPp : null,
      toPp: Number.isFinite(b.bucket.toPp) ? b.bucket.toPp : null,
      n: b.n,
      wins: b.wins,
      observedRate: b.observedRate,
      brier: b.brier,
      interval: b.interval,
      window: b.window,
      suppressedReason: b.suppressedReason,
    })),
  };

  const perDate = new Map();
  const perDateInternal = new Map();
  for (const date of dates) {
    const l = lineageByDate.get(date);
    if (!withArchive.has(date) || !l.archivePresent) continue;
    // `coverage` describes the WHOLE slate on both files. The public file then carries a subset of the
    // rows, so a reader can always see how many were left out and why — a published subset whose
    // denominator is hidden is the shape of a curated record.
    perDate.set(date, {
      kind: "research-row-lineage",
      rowSchemaVersion: ROW_SCHEMA_VERSION,
      date,
      generatedAt: GENERATED_AT,
      coverage: l.coverage,
      publishedRowPolicy:
        "Only rows whose provenance is proven appear here. Every other row on this slate is counted in " +
        "`coverage` and held in the internal artifact; none of them may carry a row-level claim.",
      rows: l.rows.filter((r) => r.rowLevelClaimAllowed),
    });
    perDateInternal.set(date, {
      kind: "research-row-lineage-full",
      rowSchemaVersion: ROW_SCHEMA_VERSION,
      public: false,
      date,
      generatedAt: GENERATED_AT,
      coverage: l.coverage,
      rows: l.rows,
    });
  }

  if (SELF_TEST) {
    const all = [...lineageByDate.values()].flatMap((l) => l.rows);
    const failures = all.flatMap((r) => validateRowLineage(r));
    const summary = summarizeCoverage(all);
    console.log(JSON.stringify({ rows: summary.total, byState: summary.byState, envelopeViolations: failures.length, gapRows: table.totalRows, excluded: table.excludedRows }, null, 2));
    if (failures.length > 0) {
      for (const f of failures.slice(0, 20)) console.error(`  [${f.code}] ${f.rowId}: ${f.message}`);
      process.exitCode = 1;
    }
    return;
  }

  if (problems.length > 0) {
    console.error(`Refusing to write: ${problems.length} envelope violation(s).`);
    for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
    process.exitCode = 1;
    return;
  }

  if (!WRITE) {
    console.log(
      `dry run — ${index.dates.length} dates, ${perDate.size} with row-level envelopes, ` +
        `${table.totalRows} settled difference rows (${table.excludedRows} excluded). Pass --write to emit.`,
    );
    return;
  }

  fs.mkdirSync(LINEAGE_ARTIFACT_DIR, { recursive: true });
  // Remove stale per-date files so a date that loses its archive stops publishing row-level claims.
  for (const f of fs.readdirSync(LINEAGE_ARTIFACT_DIR)) {
    if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f) && !perDate.has(f.slice(0, 10))) {
      fs.unlinkSync(path.join(LINEAGE_ARTIFACT_DIR, f));
    }
  }
  fs.writeFileSync(path.join(LINEAGE_ARTIFACT_DIR, "index.json"), stableStringify(index));
  fs.writeFileSync(path.join(LINEAGE_ARTIFACT_DIR, "gap-history.json"), stableStringify(gapArtifact));
  for (const [date, artifact] of perDate) {
    fs.writeFileSync(path.join(LINEAGE_ARTIFACT_DIR, `${date}.json`), compactStringify(artifact));
  }

  fs.mkdirSync(INTERNAL_DIR, { recursive: true });
  for (const f of fs.readdirSync(INTERNAL_DIR)) {
    if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f) && !perDateInternal.has(f.slice(0, 10))) {
      fs.unlinkSync(path.join(INTERNAL_DIR, f));
    }
  }
  for (const [date, artifact] of perDateInternal) {
    fs.writeFileSync(path.join(INTERNAL_DIR, `${date}.json`), compactStringify(artifact));
  }
  console.log(
    `wrote ${perDate.size + 2} public file(s) to public/data/research/row-lineage/ and ` +
      `${perDateInternal.size} internal file(s) to data/internal/mlb/research-row-lineage/`,
  );
}

main();
