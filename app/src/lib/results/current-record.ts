/**
 * THE CURRENT RECORD, ASKED ONCE (v1.8 · Track C · C2).
 *
 * Three surfaces printed the current Bank Builder record — the front door, `/today` and `/bank-builder` —
 * and all three did it by opening `mr-dub/portfolio.json` themselves, reaching into `.record`, and
 * formatting the figure inline. Three copies of one rule is three chances to drift, and the front door had
 * already drifted once: its fallback was a June legacy ladder, so an unreadable owner rendered `Record 5–0`
 * as the CURRENT record (C3 §3.1). The copies also each decided independently what "settled" counts, what
 * happens to voids, and what to print when there is no figure.
 *
 * So the question is asked in ONE place now, through the canonical Results reader, and the answer is the
 * projection's designated headline cell for the product — never an owner file, never a second-choice cell.
 *
 * WHAT THIS DOES NOT DO. It does not grade, sum, re-price, or choose which cell is the headline: the
 * projection does that, from the owners. It adds no era logic of its own, which is the point — the C3 frame
 * rule lives in `presentationOf` and this reader simply never passes a context, so it always gets the strict
 * CURRENT answer. A legacy cell reaching one of these surfaces is not possible from here.
 *
 * THE FALLBACK IS NO FIGURE. Every field is `null` when the projection is absent, when the product has no
 * headline cell, or when that cell does not carry won/lost. `null` renders as nothing — never `0–0`, never
 * a figure borrowed from another cell or another era.
 */
import {
  headlineForProduct,
  loadResultsProjection,
  pendingLabelOrNull,
  recordLabelOrNull,
  type ProjectionCell,
  type ResultsProjection,
} from "./projection";

export interface CurrentProductRecord {
  /** e.g. "36–35" (pushes/voids appended by the canonical formatter when non-zero). Null = print nothing. */
  recordLabel: string | null;
  /** e.g. "0 pending · 71 settled" — the spelling the homepage and /today have always used. */
  pendingLabel: string | null;
  /** won + lost + void, or null when the cell does not carry them. Gates "is there anything to show yet". */
  settled: number | null;
  /** The cell the figures came from, for a caller that needs its window or era. Null when there is none. */
  cell: ProjectionCell | null;
}

const EMPTY: CurrentProductRecord = { recordLabel: null, pendingLabel: null, settled: null, cell: null };

/**
 * The current record for a product, from the canonical projection.
 *
 * `projection` may be passed by a caller that already loaded it (one read per page); omitted, it is loaded
 * here. Passing `null` explicitly is the same as "absent" and yields no figures.
 */
export function currentProductRecord(
  product: string,
  projection: ResultsProjection | null = loadResultsProjection(),
): CurrentProductRecord {
  const cell = headlineForProduct(projection, product);
  /* No context argument, deliberately: the strict CURRENT default is what makes a legacy era unreachable
     from a current surface. See projection-core `cellPresentation`. */
  const recordLabel = recordLabelOrNull(cell);
  if (!cell || recordLabel === null) return EMPTY;
  const { won, lost } = cell.counts;
  const settled =
    typeof won === "number" && typeof lost === "number"
      ? won + lost + (typeof cell.counts.void === "number" ? cell.counts.void : 0)
      : null;
  const pending = pendingLabelOrNull(cell);
  return {
    recordLabel,
    /* The two halves are joined only when BOTH are real: a settled count with no pending count is not
       "0 pending", and a pending count with no settled total is not "… · 0 settled". */
    pendingLabel: pending !== null && settled !== null ? `${pending} · ${settled} settled` : null,
    settled,
    cell,
  };
}
