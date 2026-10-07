/**
 * Which EPL forecast row PUBLISHED a probability, and where its numbers live. Pure. One rule for the 1X2 grader and
 * the derived-markets grader, so "was it forecast?" can never be answered two ways.
 *
 *   CURRENT_PRE_EVENT + model.probs        priced forecast                     basis MODEL
 *   READY_EXCEPT_ODDS + modelOnly.probs    model-only forecast, no price yet   basis MODEL_ONLY (P243 publishes these
 *                                          on /epl with the same numbers; a price is not a precondition for a forecast)
 *   anything else                          WITHHELD: no probability was ever shown, so there is nothing to grade. It is
 *                                          never PENDING and never a loss (Stage 3 Q5: excluded and disclosed).
 *
 * Before 2026-09-07 the builder had no model-only path, and odds rows for "Brighton and Hove Albion" were quarantined
 * until the P240 alias (first joined in the 2026-09-11 capture). So four played matches were WITHHELD, never forecast:
 * Aston Villa v Brighton (Aug 23), Crystal Palace v Man City (Aug 28), Brighton v Chelsea (Aug 30), Brighton v Leeds
 * (Sep 5). That is the correct state for them; grading them would invent a forecast nobody published.
 */
export const FORECAST_BASIS = Object.freeze({ MODEL: "MODEL", MODEL_ONLY: "MODEL_ONLY" });

const hasProbs = (m) => m && m.probs && ["home", "draw", "away"].every((k) => typeof m.probs[k] === "number" && Number.isFinite(m.probs[k]));

/** @returns {{ model: object, basis: string } | null} the block holding the published numbers, or null when withheld */
export function publishedModel(row) {
  if (row?.state === "CURRENT_PRE_EVENT" && hasProbs(row.model)) return { model: row.model, basis: FORECAST_BASIS.MODEL };
  if (row?.state === "READY_EXCEPT_ODDS" && hasProbs(row.modelOnly)) return { model: row.modelOnly, basis: FORECAST_BASIS.MODEL_ONLY };
  return null;
}

/** Why a row published no probability (for disclosure), or null when it did. */
export function withheldReason(row) {
  if (publishedModel(row)) return null;
  return row?.reason ?? row?.unavailableReason ?? `state ${row?.state ?? "unknown"} carries no probabilities`;
}
