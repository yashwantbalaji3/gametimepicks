/**
 * THE NO_PLAY SENTENCE of the daily product receipt (build-daily-product-receipts). "A real candidate pool" is a claim
 * about the count beside it: receipts wrote it with candidatesEvaluated 0, where nothing was tested and nothing failed
 * policy. The state stays NO_PLAY either way; this keeps its words true going forward. Committed receipts are history
 * and are never rewritten. Pure.
 */
export function noPlayReason(candidatesEvaluated) {
  return candidatesEvaluated > 0
    ? "the daily evaluation completed over a real candidate pool and nothing met policy — a hold is the product's answer, not an outage"
    : "the daily evaluation ran but its pool held no legs for this product, so no leg was tested against policy — each lane's own reason is in rejections";
}
