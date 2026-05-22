/**
 * Friendly confidence labels — single source of truth for how the
 * dashboard-style High / Medium / Low tier names render in user-facing
 * copy.
 *
 * The internal pipeline stores `confidence` as "High" | "Medium" | "Low"
 * | "insufficient_data" | "no_play". Internal tooling (CLI output, JSON
 * exports, audit pages, model methodology docs) keeps those exact
 * strings so they remain stable contract values. But casual readers
 * find "High / Medium / Low" unhelpful — they read like dashboard
 * jargon and don't communicate what the tier actually means.
 *
 * On product surfaces we instead render:
 *   - "Stronger signal"  for High  — the model has both edge AND
 *                                    sample depth behind the call
 *   - "Watch"            for Medium — edge is present but smaller or
 *                                     the sample is thinner
 *   - "High-variance"    for Low   — anomaly-flagged or thin-sample
 *                                    picks that pass the guardrails
 *                                    but should be treated as noisier
 *   - "Sample too small" for insufficient_data — model declined to
 *                                                emit a projection
 *
 * The audit/methodology pages can still show the raw tier names; this
 * helper is for the consumer-facing surfaces (matchup cards, results
 * cards, board KPIs).
 */

export type RawConfidence =
  | "High"
  | "Medium"
  | "Low"
  | "insufficient_data"
  | "no_play"
  | string;

/** Friendly label suitable for casual reader-facing surfaces. */
export function confidenceLabel(c: RawConfidence | null | undefined): string {
  switch (c) {
    case "High":
      return "Stronger signal";
    case "Medium":
      return "Watch";
    case "Low":
      return "High-variance";
    case "insufficient_data":
      return "Sample too small";
    case "no_play":
      return "No play";
    default:
      return typeof c === "string" ? c : "";
  }
}

/** One-line explanation suited for tooltip / sub-line text. */
export function confidenceCaption(c: RawConfidence | null | undefined): string {
  switch (c) {
    case "High":
      return "Edge ≥ 5pp and recent10 sample is healthy.";
    case "Medium":
      return "Edge ≥ 2.5pp with adequate sample depth.";
    case "Low":
      return "Anomaly-flagged or thin sample — treat as noisier.";
    case "insufficient_data":
      return "Recent10 sample is too thin — no projection emitted.";
    case "no_play":
      return "Model abstained from this market on this slate.";
    default:
      return "";
  }
}

/** Vault color token for confidence accent. Falls through to faint. */
export function confidenceAccentVar(
  c: RawConfidence | null | undefined,
): string {
  switch (c) {
    case "High":
      return "var(--vault-success)";
    case "Medium":
      return "var(--vault-gold-bright)";
    case "Low":
      return "var(--vault-warn)";
    default:
      return "var(--vault-text-faint)";
  }
}
