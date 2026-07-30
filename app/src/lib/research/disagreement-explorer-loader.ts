/**
 * SERVER-SIDE assembly of the Market Disagreement Explorer.
 *
 * Reads the exported lineage sidecar rather than recomputing it. A surface that recomputes what an
 * artifact already states is how `/board` and `/about` ended up with a hardcoded 51.7% that drifted
 * from the ledger for weeks — the second implementation is always the one that goes stale quietly.
 *
 * So the split is: the exporter decides what is provable, this file joins those envelopes to the
 * board rows that carry the probabilities, and `disagreement-explorer.ts` turns the pair into view
 * rows and sentences. No arithmetic on rates happens here.
 *
 * FAIL-CLOSED
 * A missing artifact, an unreadable board, or a schema version this build does not understand yields
 * an explicit unavailable reason and zero rows. It never yields a partial list presented as a whole
 * slate.
 *
 * Server-only.
 */
import fs from "node:fs";
import path from "node:path";

import {
  checkCompatibility,
  type CalibratorManifest,
} from "@/lib/mlb/calibration/calibrator-manifest";
import { buildProbabilityLayers } from "@/lib/mlb/calibration/probability-layers";

import {
  GAP_BUCKETS,
  noVigProbability,
  largestGapCaution,
  type GapBucketSummary,
  type GapBucketTable,
} from "./disagreement-buckets";
import {
  buildExplorerRows,
  explorerUnavailableReason,
  type ExplorerRow,
  type ExplorerRowInput,
} from "./disagreement-explorer";
import { loadTerminal } from "./public-contract-adapter";
import {
  loadDateLineageArtifact,
  loadLineageIndex,
  type LineageIndexEntry,
} from "./row-lineage-loader";
import { MODEL_SCHEMA_VERSION, type ResearchRowLineage } from "./row-lineage";

const APP = process.cwd();
const BOARDS = path.join(APP, "public/data/mlb/boards");
const GAP_HISTORY = path.join(APP, "public/data/research/row-lineage/gap-history.json");
const MANIFEST = path.join(APP, "..", "data/internal/mlb/model-learning/calibrator-manifest.json");

const readJson = <T>(p: string): T | null => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
};

interface GapHistoryArtifact {
  rowSchemaVersion?: string;
  totalRows?: number;
  excludedRows?: number;
  window?: { from: string; to: string } | null;
  buckets?: {
    id: string;
    n: number;
    wins: number;
    observedRate: number | null;
    brier: number | null;
    interval: { low: number; high: number } | null;
    window: { from: string; to: string } | null;
    suppressedReason: string | null;
  }[];
}

/**
 * Rehydrate the exported difference table.
 *
 * Bucket definitions come from `GAP_BUCKETS` in code, not from the artifact — the artifact supplies
 * counts, and a build whose bucket edges have moved must not silently relabel old counts with new
 * ranges. Returns null when the artifact is absent or unreadable, and the caller then shows no rates.
 */
export function loadGapHistory(): GapBucketTable | null {
  const artifact = readJson<GapHistoryArtifact>(GAP_HISTORY);
  if (!artifact?.buckets) return null;

  const byId = new Map(artifact.buckets.map((b) => [b.id, b]));
  const buckets: GapBucketSummary[] = GAP_BUCKETS.map((bucket) => {
    const b = byId.get(bucket.id);
    if (!b) {
      return {
        bucket, n: 0, wins: 0, observedRate: null, brier: null, interval: null, window: null,
        suppressedReason: "this range is not present in the exported table",
      };
    }
    return {
      bucket,
      n: b.n,
      wins: b.wins,
      observedRate: b.observedRate,
      brier: b.brier,
      interval: b.interval,
      window: b.window,
      suppressedReason: b.suppressedReason,
    };
  });

  return {
    buckets,
    totalRows: artifact.totalRows ?? 0,
    excludedRows: artifact.excludedRows ?? 0,
    window: artifact.window ?? null,
  };
}

/** The newest slate that has at least one row a claim may be made about, or null when none does. */
export function latestExplorerDate(): string | null {
  const index = loadLineageIndex();
  if (!index) return null;
  const eligible = index.dates
    .filter((d: LineageIndexEntry) => d.rowLevel && d.rowLevelClaimable > 0)
    .map((d) => d.date)
    .sort();
  return eligible.length > 0 ? eligible[eligible.length - 1] : null;
}

export interface ExplorerView {
  readonly available: boolean;
  readonly unavailableReason: string | null;
  readonly date: string | null;
  readonly rows: readonly ExplorerRow[];
  readonly table: GapBucketTable | null;
  /** The sentence that must accompany the largest-gap ordering. Null means: do not offer that sort. */
  readonly largestGapCaution: string | null;
  /** Slate-wide coverage, so the page can say how many rows are NOT listed and why. */
  readonly coverage: { readonly total: number; readonly listed: number; readonly byState: Readonly<Record<string, number>> } | null;
  readonly asOfSettledDate: string | null;
  readonly calibrationVersion: string | null;
}

const EMPTY: ExplorerView = {
  available: false,
  unavailableReason: null,
  date: null,
  rows: [],
  table: null,
  largestGapCaution: null,
  coverage: null,
  asOfSettledDate: null,
  calibrationVersion: null,
};

/**
 * Build the explorer for one slate.
 *
 * Rows are listed only when the envelope allows a row-level claim AND the pregame capture is proven to
 * precede first pitch. Both conditions, not either: a proven capture time that turns out to be after
 * the first pitch is exactly the case the eligibility gate exists to catch, and it is not shown as
 * though it were pregame evidence.
 */
export function loadExplorer(date?: string | null): ExplorerView {
  const index = loadLineageIndex();
  const table = loadGapHistory();
  const target = date ?? latestExplorerDate();

  if (!index || !table) {
    return { ...EMPTY, unavailableReason: explorerUnavailableReason({ artifactPresent: false, dateAvailable: false, eligibleRows: 0 }) };
  }
  if (!target) {
    return { ...EMPTY, table, unavailableReason: explorerUnavailableReason({ artifactPresent: true, dateAvailable: false, eligibleRows: 0 }) };
  }

  const envelopes = loadDateLineageArtifact(target);
  const board = readJson<{ leans?: Record<string, unknown>[] }>(path.join(BOARDS, `${target}.json`));
  if (!envelopes || !board?.leans) {
    return { ...EMPTY, table, date: target, unavailableReason: explorerUnavailableReason({ artifactPresent: true, dateAvailable: false, eligibleRows: 0 }) };
  }

  const terminal = loadTerminal();
  const manifest = readJson<CalibratorManifest>(MANIFEST);
  const boardById = new Map(board.leans.map((l) => [String(l.id ?? ""), l]));
  const entry = index.dates.find((d) => d.date === target) ?? null;

  const inputs: ExplorerRowInput[] = [];
  for (const env of envelopes as readonly ResearchRowLineage[]) {
    if (!env.rowLevelClaimAllowed || !env.pregameEligibility.researchEligible) continue;

    const lean = boardById.get(env.rowId);
    if (!lean) continue; // an envelope with no board row has no probabilities to show
    const side = env.market.side === "over" || env.market.side === "under" ? env.market.side : null;
    if (!side) continue;

    const raw = side === "over" ? lean.modelProbOver : lean.modelProbUnder;
    if (typeof raw !== "number") continue;

    const compat = checkCompatibility({
      manifest,
      marketFamily: env.market.key ?? "",
      modelSchemaVersion: MODEL_SCHEMA_VERSION,
      asOfSettledDate: terminal.asOfSettledDate ?? target,
    });

    const layers = buildProbabilityLayers({
      rawProbability: raw,
      side,
      impliedOver: typeof lean.impliedOver === "number" ? lean.impliedOver : null,
      impliedUnder: typeof lean.impliedUnder === "number" ? lean.impliedUnder : null,
      calibrator: compat.compatible ? manifest!.parameters : null,
      provenance: {
        method: compat.compatible ? "platt" : "none",
        trainedThrough: manifest?.fitWindow?.to ?? null,
        trainRows: manifest?.fitWindow?.rows ?? 0,
        measuredBrierImprovement: manifest?.heldOutEvaluation?.brierImprovementVsRaw ?? null,
        stillBehindMarket: manifest?.heldOutEvaluation?.stillBehindMarket ?? true,
      },
    });

    // The gap is measured against the BOARD's de-vigged price, because that is how the historical
    // table every row is compared against was built. The archive's own captured no-vig figure is
    // carried separately: it is a different observation moment (about a percentage point apart on
    // average) and swapping it in here would compare a row against a table built another way.
    const market =
      layers.market ??
      noVigProbability(
        typeof lean.impliedOver === "number" ? lean.impliedOver : null,
        typeof lean.impliedUnder === "number" ? lean.impliedUnder : null,
        side,
      );

    inputs.push({
      rowId: env.rowId,
      date: env.date,
      player: String(lean.playerName ?? "—"),
      marketKey: env.market.key ?? "",
      marketLabel: env.market.label ?? String(env.market.key ?? ""),
      line: env.market.line,
      side,
      startTime: env.pregame.eventStart ?? (typeof lean.commenceTime === "string" ? lean.commenceTime : null),
      matchup: `${String(lean.awayTeamAbbr ?? "?")} @ ${String(lean.homeTeamAbbr ?? "?")}`,
      marketProbability: market,
      capturedNoVigProbability: env.pregame.noVigProbability,
      rawProbability: layers.raw,
      calibratedProbability: layers.calibrated,
      displayedProbability: layers.displayed,
      displayedSource: layers.displayedSource,
      gapPp: market == null ? null : (layers.raw - market) * 100,
      outcome: env.settlement.outcome,
      coverageState: env.coverageState,
      registryStatus: env.market.registryStatus,
      capturedAt: env.pregame.capturedAt,
      eventStart: env.pregame.eventStart,
      settlementSourceRef: env.settlement.sourceRef,
      eventId: env.eventId,
    });
  }

  const rows = buildExplorerRows({ rows: inputs, table });
  const reason = explorerUnavailableReason({ artifactPresent: true, dateAvailable: true, eligibleRows: rows.length });

  return {
    available: rows.length > 0,
    unavailableReason: reason,
    date: target,
    rows,
    table,
    largestGapCaution: largestGapCaution(table),
    coverage: entry ? { total: entry.total, listed: rows.length, byState: entry.byState } : null,
    asOfSettledDate: index.asOfSettledDate,
    calibrationVersion: terminal.calibration?.version ?? null,
  };
}
