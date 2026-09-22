/**
 * THE ONE RESULTS READER (v1.8 · Track C · C1 — V19 §2 rule 6).
 *
 * Every "record" a page prints is meant to come through here, from the canonical results projection
 * (`public/data/results/projection/latest.json`), never from an owner directly. In C1 no consumer is
 * repointed yet — the four inline `fs` copies of the portfolio reader (V19 C10) and the read-model's
 * key lookup (C2) still stand — so this file changes no rendered output. C2 repoints them.
 *
 * THE C9 RULE. A consumer that cannot find a cell prints NOTHING: `recordLabelOrNull` returns null for
 * an absent cell, a cell without won/lost, or a cell the owner's own rule marks not display-eligible.
 * It never returns "0–0" and never falls back to another cell's figure.
 *
 * Read-only. Never writes, never grades, never sums two eras (`sumSameEra` throws on the attempt).
 */
import fs from "node:fs";
import path from "node:path";

import {
  assertProjectionShape,
  cellById as cellByIdCore,
  cellForEra as cellForEraCore,
  cellsByFamily as cellsByFamilyCore,
  cellsByProduct as cellsByProductCore,
  cellsBySport as cellsBySportCore,
  ERAS,
  FAMILIES,
  legacyCells as legacyCellsCore,
  mayShowIn as mayShowInCore,
  presentationOf as presentationOfCore,
  PRESENTATION,
  LEGACY_PRESENTATION_ERAS,
  formatRecordLabel as formatRecordLabelCore,
  headlineFor as headlineForCore,
  headlineForProduct as headlineForProductCore,
  headlineForSport as headlineForSportCore,
  LEGACY_ERAS,
  pendingLabelOrNull as pendingLabelOrNullCore,
  PROJECTION_REL,
  PROJECTION_SCHEMA,
  RECORD_TYPES,
  recordLabelOrNull as recordLabelOrNullCore,
  STATUSES,
  sumSameEra as sumSameEraCore,
} from "./projection-core.mjs";

export { ERAS, FAMILIES, LEGACY_ERAS, PRESENTATION, LEGACY_PRESENTATION_ERAS, PROJECTION_REL, PROJECTION_SCHEMA, RECORD_TYPES, STATUSES };

export type RecordType = (typeof RECORD_TYPES)[keyof typeof RECORD_TYPES];
export type Family = (typeof FAMILIES)[keyof typeof FAMILIES];
export type Era = (typeof ERAS)[keyof typeof ERAS];
export type CellStatus = (typeof STATUSES)[keyof typeof STATUSES];
/** The frame a cell may be shown in (C3). A surface declares its own; it is never inferred. */
export type PresentationContext = (typeof PRESENTATION)[keyof typeof PRESENTATION];

/** A count block. `null` = the owner does not carry it — never 0. */
export interface ProjectionCounts {
  won: number | null;
  lost: number | null;
  pending: number | null;
  push: number | null;
  void: number | null;
}

export interface ProjectionWindow { from: string | null; to: string | null }

export interface ProjectionOwner { path: string; generatedAt: string | null; stampField: string }

export interface ProjectionComposition { era: Era; cellId: string | null; counts: ProjectionCounts; window: ProjectionWindow | null }

export interface ProjectionCycles {
  started: number; lost: number | null; completed: number | null; open: number | null;
  furthestPublishedStepMax: number | null; meanFurthestPublishedStep: number | null;
  cyclesWithPublishedStepDivergence: number | null;
  placedLaneDays: number | null; decidedLaneDays: number | null; noPlayLaneDays: number | null;
}

export interface ProjectionCell {
  cellId: string;
  recordType: RecordType;
  family: Family;
  recordFamilyId: string | null;
  sport: string | null;
  product: string | null;
  market: string | null;
  segment: string | null;
  modelOrPolicyVersion: string | null;
  era: Era;
  n: number | null;
  counts: ProjectionCounts;
  decisive: number | null;
  hitRate: number | null;
  ownerState: string | null;
  owner: ProjectionOwner;
  window: ProjectionWindow;
  status: CellStatus;
  displayEligible: { eligible: boolean; reason: string };
  /** C3: the frame this cell may be shown in, derived from its era. Never widened by a consumer. */
  presentation: PresentationContext;
  semantics: string;
  composition: ProjectionComposition[] | null;
  cycles: ProjectionCycles | null;
  crossCheck: Record<string, unknown> | null;
  sameAs: string | null;
}

export interface ProjectionSource { key: string; present: boolean; path: string | null; generatedAt: string | null; count?: number }

export interface ResultsProjection {
  schema: string;
  artifact: string;
  dataClass: string;
  builtAt: string;
  rules: Record<string, string>;
  sources: ProjectionSource[];
  headline: {
    byFamily: Record<string, string | null>;
    byProduct: Record<string, string | null>;
    bySport: Record<string, string | null>;
  };
  cells: ProjectionCell[];
}

export interface SameEraSum {
  family: Family; era: Era; recordType: RecordType;
  counts: ProjectionCounts; n: number | null; window: ProjectionWindow; cells: string[];
}

const DEFAULT_ROOT = () => path.join(process.cwd(), "public", "data");

/**
 * Load the projection, or null when it is absent or malformed. Null is the honest answer: the
 * consumer prints no figure. Never a fallback artifact, never a synthesized cell.
 */
export function loadResultsProjection(root: string = DEFAULT_ROOT()): ResultsProjection | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, PROJECTION_REL, "latest.json"), "utf8")) as unknown;
    assertProjectionShape(raw);
    return raw as ResultsProjection;
  } catch {
    return null;
  }
}

export const cellById = (p: ResultsProjection | null, id: string): ProjectionCell | null => cellByIdCore(p, id) as ProjectionCell | null;
export const cellsByFamily = (p: ResultsProjection | null, family: Family): ProjectionCell[] => cellsByFamilyCore(p, family) as ProjectionCell[];
export const cellsBySport = (p: ResultsProjection | null, sport: string): ProjectionCell[] => cellsBySportCore(p, sport) as ProjectionCell[];
export const cellsByProduct = (p: ResultsProjection | null, product: string): ProjectionCell[] => cellsByProductCore(p, product) as ProjectionCell[];

/** The designated headline for a family — never a legacy era (throws if the artifact points at one). */
export const headlineFor = (p: ResultsProjection | null, family: Family): ProjectionCell | null => headlineForCore(p, family) as ProjectionCell | null;
export const headlineForProduct = (p: ResultsProjection | null, product: string): ProjectionCell | null => headlineForProductCore(p, product) as ProjectionCell | null;
export const headlineForSport = (p: ResultsProjection | null, sport: string): ProjectionCell | null => headlineForSportCore(p, sport) as ProjectionCell | null;

/** An explicit era request — the only way a legacy era reaches a surface. */
export const cellForEra = (
  p: ResultsProjection | null,
  q: { family: Family; era: Era; product?: string | null; sport?: string | null; segment?: string | null },
): ProjectionCell | null => cellForEraCore(p, q) as ProjectionCell | null;

/** "W–L · N pushes · N voids" from counts; pending never inside. Null when won/lost is not carried. */
export const formatRecordLabel = (c: ProjectionCounts | null | undefined): string | null => formatRecordLabelCore(c);

/**
 * The C9 rule: a label only for a present, display-eligible cell with won and lost — else null, never "0–0".
 *
 * C3: `context` is the frame the CALLER renders in, and it defaults to `CURRENT`, so a surface that has not
 * thought about this gets null for a legacy-history cell rather than a June figure in a current frame. Pass
 * `LEGACY_HISTORY` only from an explicitly labelled Completed ladders / Legacy history panel.
 */
export const recordLabelOrNull = (
  cell: ProjectionCell | null | undefined,
  opts?: { context?: PresentationContext },
): string | null => recordLabelOrNullCore(cell, opts);

/** True when a cell may be shown in the caller's frame (C3) — the one predicate a surface should ask. */
export const mayShowIn = (cell: ProjectionCell | null | undefined, context: PresentationContext): boolean => mayShowInCore(cell, context);

/** The frame a given era may be presented in (C3). One place the rule lives. */
export const presentationOf = (era: Era): PresentationContext => presentationOfCore(era) as PresentationContext;

/**
 * The cells an explicitly labelled "Completed ladders / Legacy history" panel may draw (C3), oldest first.
 * The ONLY selector that answers with legacy cells, so a panel never hand-rolls the era filter. Each cell
 * carries its exact dates and its own era/methodology sentence — the context the decision requires beside it.
 */
export const legacyCells = (
  p: ResultsProjection | null,
  q?: { product?: string | null; family?: Family | null },
): ProjectionCell[] => legacyCellsCore(p, q) as ProjectionCell[];

/** "N pending" beside the record, or null when the owner carries no pending count. */
export const pendingLabelOrNull = (cell: ProjectionCell | null | undefined): string | null => pendingLabelOrNullCore(cell);

/**
 * The only aggregation: same family, same summable era — anything else throws.
 *
 * C3: summing LEGACY_HISTORY cells into a `CURRENT` summary throws. Legacy history never contributes to
 * current performance, and same-era arithmetic would otherwise turn two completed June ladders into a tidy
 * 10–0 that reads as current form. The result carries the frame it was summed in.
 */
export const sumSameEra = (
  cells: ProjectionCell[],
  opts?: { context?: PresentationContext },
): SameEraSum | null => sumSameEraCore(cells, opts) as SameEraSum | null;
