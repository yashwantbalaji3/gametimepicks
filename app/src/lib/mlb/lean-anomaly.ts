import type { MlbBoardLean } from "@/lib/types-mlb";

/**
 * GTP-14 — ONE definition of an anomalous lean, for the row label and the board's tiles alike. An R5 anomaly
 * is a model-vs-market gap too LARGE to trust; it must never be counted or labelled as a gap-size tier.
 */
export function isAnomalyLean(lean: Pick<MlbBoardLean, "riskFlags">): boolean {
  return (lean.riskFlags || []).includes("r5_model_anomaly");
}
