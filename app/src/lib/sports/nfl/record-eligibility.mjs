/**
 * NFL · WHICH RECEIPT MAY BE THE FORECAST OF RECORD — one predicate for every reader (forecastOfRecord, the frozen
 * carry, and through them the official snapshot, the ledger, the Theater and the audit).
 *
 * A receipt is eligible only when
 *   1. it was generated strictly before its kickoff (unchanged rule);
 *   2. every input it records (`inputs.<name>.sourceAsOf`) precedes kickoff — the event-window contract's stamp rule
 *      (input-stamps.mjs); receipts written before inputs were recorded carry none and pass this check;
 *   3. it is not listed in RECORD_EXCLUSIONS (record-exclusions.mjs), the append-only list for receipts written
 *      before (2) existed whose inputs are known to postdate kickoff.
 * Pure.
 */
import { postKickoffStamps } from "./input-stamps.mjs";
import { exclusionFor } from "./record-exclusions.mjs";

export const INELIGIBLE = Object.freeze({
  INCOMPLETE: "INCOMPLETE",
  GENERATED_AT_OR_AFTER_KICKOFF: "GENERATED_AT_OR_AFTER_KICKOFF",
  INPUT_AFTER_KICKOFF: "INPUT_AFTER_KICKOFF",
  EXCLUDED: "EXCLUDED",
});

/** @returns {{ eligible: true } | { eligible: false, code: string, detail: string }} */
export function recordEligibility(receipt) {
  if (!receipt?.providerEventId || !receipt.generatedAt || !receipt.kickoffUtc) return { eligible: false, code: INELIGIBLE.INCOMPLETE, detail: "no event id, generatedAt or kickoff" };
  if (!(Date.parse(receipt.generatedAt) < Date.parse(receipt.kickoffUtc))) return { eligible: false, code: INELIGIBLE.GENERATED_AT_OR_AFTER_KICKOFF, detail: `generated ${receipt.generatedAt}, kickoff ${receipt.kickoffUtc}` };
  const recorded = receipt.inputs && typeof receipt.inputs === "object"
    ? Object.fromEntries(Object.entries(receipt.inputs).map(([k, v]) => [k, v?.sourceAsOf ?? null]))
    : null;
  const late = postKickoffStamps(recorded, receipt.kickoffUtc);
  if (late.length) return { eligible: false, code: INELIGIBLE.INPUT_AFTER_KICKOFF, detail: late.map((x) => x.reason).join("; ") };
  const ex = exclusionFor(receipt);
  if (ex) return { eligible: false, code: INELIGIBLE.EXCLUDED, detail: `${ex.reason}: ${ex.evidence.input} ${ex.evidence.field} ${ex.evidence.stamp} (record-exclusions)` };
  return { eligible: true };
}

export const isRecordEligible = (receipt) => recordEligibility(receipt).eligible;
