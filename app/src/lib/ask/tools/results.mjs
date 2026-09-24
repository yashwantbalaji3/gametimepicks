/**
 * ASK RESULTS TOOLS — the settled record, read from the ONE owner that has it.
 *
 * WHY THESE EXIST. Ask could answer "what is Bank Builder's record?" only by not answering it: there
 * was no Results tool at all, so the question fell through to the help corpus or to nothing. The
 * canonical Results projection (v1.8 · Track C) is the read model over the settlement owners, and
 * `ask/v1/results.json` republishes it under the Ask prefix. These tools read THAT. They do not
 * traverse the owners a second time, and a second traversal is precisely how two surfaces come to give
 * a reader two different records.
 *
 * THE FOUR RULES THEY EXIST TO KEEP, each of which an LLM would otherwise break for you:
 *
 *   1. ERAS ARE NOT SUMMED. A product's record is the cell the owner DESIGNATED as its headline, found
 *      through `headline.byProduct`, never by scanning cells and adding them up. Legacy-era cells come
 *      back in a separate `legacy` field with a separate label, so a writer cannot fold the June
 *      ladders' 5–0 into the current record — which is the exact defect Track C shipped to close.
 *
 *   2. PENDING IS A COUNT, NEVER A LOSS. It is carried as its own number beside won and lost, and
 *      `decisive` is the owner's own settled denominator. Nothing here computes W/(W+L+P).
 *
 *   3. MISSING IS NOT ZERO. A count the owner does not carry is `null` and stays `null`. A cell with no
 *      counts is a real answer ("recorded, not yet settled"), never a 0–0.
 *
 *   4. NO HIT RATE IS INVENTED. `hitRate` is copied when the owner publishes one and is `null`
 *      otherwise. A CYCLE_COMPLETION is a table of completed/lost/open and is never a percentage; a
 *      PRODUCT_RECORD is cards, not legs. The tools return the typed `recordType` so the writer cannot
 *      quietly relabel one as the other.
 *
 * WHAT THEY DO NOT COVER, on purpose: model calibration states do not cross into the Ask projection at
 * all (a state word is not a record), so "how well calibrated is the EPL totals model" has no tool and
 * is answered as unsupported rather than paraphrased.
 */
import { ASK_ERROR, ASK_STATUS, askAssetPath } from "../contract.mjs";

const PRODUCT_LABEL = { "bank-builder": "Bank Builder", moonshot: "Moonshot", "parlay-lab": "Parlay Lab" };
const PRODUCT_HREF = { "bank-builder": "/bank-builder/", moonshot: "/moonshot/", "parlay-lab": "/results/" };

/** Load the projection, or a refusal that degrades one tool rather than the turn. */
async function loadResults(ctx) {
  const loaded = await ctx.turn.load(askAssetPath.results());
  if (!loaded.ok) return { ok: false, envelope: { status: ASK_STATUS.ERROR, error: ASK_ERROR.ASSET_UNAVAILABLE } };
  const doc = loaded.json;
  if (!doc?.available) {
    return {
      ok: false,
      envelope: {
        status: ASK_STATUS.UNSUPPORTED,
        error: ASK_ERROR.NOT_PUBLISHED,
        detail: "no canonical Results projection is published",
        links: [{ id: "results", label: "Results", href: "/results/" }],
      },
    };
  }
  return { ok: true, doc };
}

const cellById = (doc, id) => (doc.cells ?? []).find((c) => c.cellId === id) ?? null;

/**
 * The record as a LABEL, built from the owner's own counts.
 *
 * Returns null when the cell carries no decisive counts — an ERA_GAP or a pending-only cell is a real
 * cell with a real meaning and no W–L, and inventing "0–0" for it would turn a disclosed hole in the
 * record into a perfect one.
 */
function recordLabel(cell) {
  const c = cell?.counts;
  if (!c || c.won == null || c.lost == null) return null;
  const parts = [`${c.won}–${c.lost}`];
  if (c.push) parts.push(`${c.push} push`);
  if (c.void) parts.push(`${c.void} void`);
  return parts.join(" · ");
}

/** The public shape of one cell. Everything here is copied; nothing is derived except the label. */
const shapeCell = (cell) => ({
  cellId: cell.cellId,
  recordType: cell.recordType,
  era: cell.era,
  /* Two cells can share an era and differ only by segment — Bank Builder has two LEDGER_ONLY ladders,
     both 5–0. Without the segment their sentences are identical and a reader cannot tell one row from
     two, which is the same failure as printing a number twice. */
  segment: cell.segment ?? null,
  presentation: cell.presentation,
  label: recordLabel(cell),
  counts: cell.counts ?? null,
  /** The owner's settled denominator. Pending is NOT in it. */
  decisive: cell.decisive ?? null,
  n: cell.n ?? null,
  hitRate: cell.hitRate ?? null,
  ownerState: cell.ownerState ?? null,
  window: cell.window ?? null,
  status: cell.status ?? null,
  asOf: cell.asOf ?? null,
  note: cell.displayEligible?.reason ?? null,
});

/* ────────────────────────────────  getProductRecord  ──────────────────────────────── */

export async function getProductRecord(args, ctx) {
  const loaded = await loadResults(ctx);
  if (!loaded.ok) return loaded.envelope;
  const doc = loaded.doc;

  const product = String(args.product);
  const headlineId = doc.headline?.byProduct?.[product] ?? null;
  const current = headlineId ? cellById(doc, headlineId) : null;

  if (!current) {
    return {
      status: ASK_STATUS.UNSUPPORTED,
      error: ASK_ERROR.NOT_PUBLISHED,
      detail: `no current record is designated for ${PRODUCT_LABEL[product] ?? product}`,
      product,
      links: [{ id: "results", label: "Results", href: "/results/" }],
    };
  }

  const own = (doc.cells ?? []).filter((c) => c.product === product || (c.family === "lab" && product === "parlay-lab"));

  /*
   * THE OTHER CURRENT-ERA CELLS, listed and NOT added. A composite record is shown with its era
   * composition beside it — that is the owner's own display rule, carried in `note`. The writer gets
   * the parts so it can say "37–36 across two eras (19–14 then 18–22)"; it never gets a sum it did not
   * have to compute, because the sum is already the headline.
   */
  const components = own
    .filter((c) => c.presentation === "CURRENT" && c.cellId !== current.cellId && recordLabel(c) !== null)
    .map(shapeCell);

  /*
   * LEGACY IS A SEPARATE FIELD WITH A SEPARATE NAME. These are real, settled, and NOT the current
   * record. Keeping them in `legacy` rather than in the same list is the whole mechanism: a writer
   * that mixes them has to cross a field boundary to do it, and the verifier can see that it did.
   */
  const legacy = own.filter((c) => c.presentation === "LEGACY_HISTORY").map(shapeCell);

  return {
    status: ASK_STATUS.OK,
    product,
    productLabel: PRODUCT_LABEL[product] ?? product,
    current: shapeCell(current),
    components,
    legacy,
    /* Said in words as well as in a field, because this is the sentence the writer must not drop. */
    eraRule: legacy.length
      ? "Legacy-era rows are settled history from a different policy and are never added to the current record."
      : null,
    builtAt: doc.builtAt ?? null,
    links: [
      { id: product, label: PRODUCT_LABEL[product] ?? product, href: PRODUCT_HREF[product] ?? "/results/" },
      { id: "results", label: "Results", href: "/results/" },
    ],
  };
}

/* ────────────────────────────────  getForecastRecord  ─────────────────────────────── */

export async function getForecastRecord(args, ctx) {
  const loaded = await loadResults(ctx);
  if (!loaded.ok) return loaded.envelope;
  const doc = loaded.doc;

  const sport = String(args.sport).toLowerCase();
  const headlineId = doc.headline?.bySport?.[sport] ?? null;
  const current = headlineId ? cellById(doc, headlineId) : null;

  if (!current) {
    return {
      status: ASK_STATUS.UNSUPPORTED,
      error: ASK_ERROR.NOT_PUBLISHED,
      detail: `no graded forecast record is designated for ${sport.toUpperCase()}`,
      sport,
      links: [{ id: "results", label: "Results", href: "/results/" }],
    };
  }

  const others = (doc.cells ?? [])
    .filter((c) => c.sport === sport && c.cellId !== current.cellId)
    .map(shapeCell);

  return {
    status: ASK_STATUS.OK,
    sport,
    current: shapeCell(current),
    otherEras: others,
    builtAt: doc.builtAt ?? null,
    links: [{ id: "results", label: "Results", href: "/results/" }],
  };
}

/* ────────────────────────────────  getRecentResults  ──────────────────────────────── */

export async function getRecentResults(args, ctx) {
  const loaded = await loadResults(ctx);
  if (!loaded.ok) return loaded.envelope;
  const doc = loaded.doc;

  const sport = String(args.sport).toLowerCase();
  const feed = doc.recent?.[sport] ?? null;
  if (!feed) {
    return {
      status: ASK_STATUS.UNSUPPORTED,
      error: ASK_ERROR.NOT_PUBLISHED,
      detail: `no graded forecast feed is published for ${sport.toUpperCase()}`,
      sport,
      availableSports: Object.keys(doc.recent ?? {}),
      links: [{ id: "results", label: "Results", href: "/results/" }],
    };
  }

  let rows = feed.rows ?? [];
  if (args.fromDate) rows = rows.filter((r) => r.when && r.when >= args.fromDate);
  if (args.toDate) rows = rows.filter((r) => r.when && r.when <= args.toDate);

  const shown = rows.slice(0, args.limit ?? 10);
  const graded = rows.filter((r) => r.hit !== null);

  return {
    status: ASK_STATUS.OK,
    sport,
    /*
     * THE COUNTS DESCRIBE WHAT WAS RETURNED, and `totalRecorded` describes the whole feed. A bounded
     * list must never be mistakeable for the whole record, so both numbers are present and named —
     * and `won`/`lost` count only rows the owner actually graded. A row with `hit: null` is ungraded
     * or pending; it is excluded from both, never counted as a loss.
     */
    matched: rows.length,
    totalRecorded: feed.total ?? null,
    publishedRows: (feed.rows ?? []).length,
    won: graded.filter((r) => r.hit === true).length,
    lost: graded.filter((r) => r.hit === false).length,
    ungraded: rows.length - graded.length,
    rows: shown,
    asOf: feed.asOf ?? null,
    links: [{ id: "results", label: "Results", href: "/results/" }],
  };
}

/* ────────────────────────────────  getPendingResults  ─────────────────────────────── */

export async function getPendingResults(_args, ctx) {
  const loaded = await loadResults(ctx);
  if (!loaded.ok) return loaded.envelope;
  const doc = loaded.doc;

  /*
   * Two different things a reader means by "still pending", kept apart because they have different
   * answers: a cell carrying a pending COUNT (settlement has not landed yet) and a disclosed ERA_GAP
   * (a hole in the record the owner has named). Merging them would let "nothing is pending" be said
   * about a record that has a known hole in it.
   */
  const pending = (doc.cells ?? [])
    .filter((c) => c.counts?.pending != null)
    .map((c) => ({ ...shapeCell(c), product: c.product ?? null, sport: c.sport ?? null, pending: c.counts.pending }));

  const gaps = (doc.cells ?? [])
    .filter((c) => c.recordType === "ERA_GAP")
    .map((c) => ({ ...shapeCell(c), product: c.product ?? null, sport: c.sport ?? null }));

  return {
    status: ASK_STATUS.OK,
    pendingCells: pending,
    totalPending: pending.reduce((n, c) => n + (c.pending ?? 0), 0),
    disclosedGaps: gaps,
    builtAt: doc.builtAt ?? null,
    links: [{ id: "results", label: "Results", href: "/results/" }],
  };
}
