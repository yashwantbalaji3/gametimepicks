/**
 * A PRODUCT'S HISTORY RECORDS (P0 U2) — the legacy-era figures a product page shows under its "History" heading.
 *
 * The one reader besides the projection's own selectors that declares the legacy frame (C3): `legacyCells` +
 * `mayShowIn(…, LEGACY_HISTORY)`. Kept apart from current-record.ts on purpose — that reader never answers in the
 * legacy frame, which is what keeps a June figure out of a current headline. Each record carries its own name and
 * exact dates (the C3 condition for showing a legacy figure at all) and is never summed with a current figure.
 */
import { formatRecordLabel, legacyCells, loadResultsProjection, mayShowIn, PRESENTATION, type ResultsProjection } from "./projection";
import { RECORD_SCOPE_LABEL, scoped, type ScopedRecord } from "./current-record";

/** Plain names for the legacy cells a visitor meets; an unnamed legacy cell is still shown, as "History". */
const HISTORY_NAME: Record<string, string> = {
  "product:-:bank-builder:LEDGER_ONLY:ladder-1": "June ladder 1 ($100 → $10K)",
  "product:-:bank-builder:LEDGER_ONLY:ladder-2": "June ladder 2 ($100 → $10K)",
  "product:-:moonshot:LEGACY_PRODUCT_LEDGER:-": "June single-card lane",
};

/** Legacy-era records for a product, oldest first. Empty when there are none or the projection is absent. */
export function productHistoryRecords(
  product: string,
  projection: ResultsProjection | null = loadResultsProjection(),
): ScopedRecord[] {
  return legacyCells(projection, { product, family: "product" })
    .filter((c) => mayShowIn(c, PRESENTATION.LEGACY_HISTORY))
    .map((c) => scoped(c, "history", HISTORY_NAME[c.cellId] ?? RECORD_SCOPE_LABEL.history, formatRecordLabel(c.counts)))
    .filter((r): r is ScopedRecord => r !== null);
}
