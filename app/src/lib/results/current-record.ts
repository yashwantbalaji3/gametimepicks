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
  cellForEra,
  ERAS,
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
  /**
   * P0 U2 · what the headline figure above MEASURES, in the words a page must print beside it. The Bank Builder
   * headline is the COMPOSITE protected record (June base + receipts) — "All-time"; a product whose headline is
   * its settled-receipts record (Moonshot) — "Current era". Null with no figure.
   */
  scope: RecordScope | null;
  /** P0 U2 · the product's records, one per scope — see `ScopedRecord`. The hero leads with `currentEra`. History
   *  (legacy eras) is NOT on this reader — it never answers in the legacy frame; see product-history.ts. */
  currentEra: ScopedRecord | null;
  allTime: ScopedRecord | null;
  /** "0 pending · 66 settled" for the current era — pending is the product's (pending is always current). */
  currentEraPendingLabel: string | null;
}

/* ── P0 U2 · ONE RECORD DEFINITION PER PRODUCT, PER SCOPE ──────────────────────────────────────────────────────
 *
 * Production (10-28) showed Bank Builder as 47–52 on one page and 28–38 on another and Moonshot as 7–48 beside
 * 0–7, mostly under the same word ("Record", "Settled record", "Official record"). They are all true; they
 * measure different populations:
 *
 *   current era — the product's settled-receipts record (RECEIPT_ERA, the Rule S fold, nightly receipts since
 *                 Aug 15 2026). What the product is doing now. Every product hero leads with this.
 *   all-time    — Bank Builder only: the COMPOSITE protected record (July protected base + current era, Jun 9 →).
 *                 Moonshot has no all-time figure: its eras are different products and are never summed.
 *   history     — legacy-era cells (the June completed ladders, the June Moonshot single-card lane), each with
 *                 its own dates and name, shown only under a "History" heading. Served by product-history.ts —
 *                 the one reader that declares the legacy frame — never by this one.
 *
 * Every surface prints a product's record through `currentProductRecord(product)` + `scopedRecordText`, so the
 * same label always carries the same number. Pinned by product-record-scopes.test.mjs on committed data. */

export type RecordScope = "current-era" | "all-time" | "history";

/** The words a scope is printed with — one place, so no page invents a synonym that hides a different number. */
export const RECORD_SCOPE_LABEL: Readonly<Record<RecordScope, string>> = Object.freeze({
  "current-era": "Current era",
  "all-time": "All-time",
  history: "History",
});

export interface ScopedRecord {
  scope: RecordScope;
  /** "Current era" | "All-time" | the legacy cell's own name under History. */
  scopeLabel: string;
  /** "28–38" (pushes/voids appended by the canonical formatter when non-zero). */
  recordLabel: string;
  won: number;
  lost: number;
  /** won + lost + void (when carried). */
  settled: number;
  from: string | null;
  to: string | null;
  cellId: string;
}

export function scoped(cell: ProjectionCell | null, scope: RecordScope, scopeLabel: string, label: string | null): ScopedRecord | null {
  if (!cell || label === null) return null;
  const { won, lost } = cell.counts;
  if (typeof won !== "number" || typeof lost !== "number") return null;
  return {
    scope, scopeLabel, recordLabel: label, won, lost,
    settled: won + lost + (typeof cell.counts.void === "number" ? cell.counts.void : 0),
    from: cell.window?.from ?? null, to: cell.window?.to ?? null, cellId: cell.cellId,
  };
}

/** The product's current-era record: its settled-receipts cell, when LIVE and display-eligible. */
function currentEraOf(projection: ResultsProjection | null, product: string): ScopedRecord | null {
  const cell = cellForEra(projection, { family: "product", era: ERAS.RECEIPT_ERA, product });
  if (!cell || cell.status !== "LIVE") return null;
  return scoped(cell, "current-era", RECORD_SCOPE_LABEL["current-era"], recordLabelOrNull(cell));
}

/** The all-time record: the product's COMPOSITE cell (Bank Builder's protected record) — none for other products. */
function allTimeOf(projection: ResultsProjection | null, product: string): ScopedRecord | null {
  const cell = cellForEra(projection, { family: "product", era: ERAS.COMPOSITE, product });
  if (!cell || cell.status !== "LIVE") return null;
  return scoped(cell, "all-time", RECORD_SCOPE_LABEL["all-time"], recordLabelOrNull(cell));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const md = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${MONTHS[m - 1]} ${d}`; };
/** "Aug 15 – Oct 26, 2026" (or "Jun 9, 2026 – …" across years); null without both ends. */
export function recordWindowText(r: Pick<ScopedRecord, "from" | "to"> | null | undefined): string | null {
  if (!r?.from || !r?.to) return null;
  const y1 = r.from.slice(0, 4), y2 = r.to.slice(0, 4);
  return y1 === y2 ? `${md(r.from)} – ${md(r.to)}, ${y2}` : `${md(r.from)}, ${y1} – ${md(r.to)}, ${y2}`;
}

/**
 * The ONE spelling of a scoped record: "Current era 28–38 · Aug 15 – Oct 26, 2026". `product` prefixes the
 * product name ("Bank Builder · current era 28–38 …") for a surface that shows several products.
 */
export function scopedRecordText(r: ScopedRecord | null | undefined, opts: { product?: string; dates?: boolean } = {}): string | null {
  if (!r) return null;
  const head = opts.product ? `${opts.product} · ${r.scopeLabel.charAt(0).toLowerCase()}${r.scopeLabel.slice(1)}` : r.scopeLabel;
  const win = opts.dates === false ? null : recordWindowText(r);
  return `${head} ${r.recordLabel}${win ? ` · ${win}` : ""}`;
}

const EMPTY: CurrentProductRecord = { recordLabel: null, pendingLabel: null, settled: null, cell: null, scope: null, currentEra: null, allTime: null, currentEraPendingLabel: null };

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
  const currentEra = currentEraOf(projection, product);
  const allTime = allTimeOf(projection, product);
  if (!cell || recordLabel === null) return { ...EMPTY, currentEra, allTime };
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
    scope: cell.era === ERAS.COMPOSITE ? "all-time" : cell.era === ERAS.RECEIPT_ERA ? "current-era" : null,
    currentEra,
    allTime,
    currentEraPendingLabel: pending !== null && currentEra ? `${pending} · ${currentEra.settled} settled` : null,
  };
}
