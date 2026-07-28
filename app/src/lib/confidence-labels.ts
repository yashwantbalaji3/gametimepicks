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
 * On product surfaces we instead render NEUTRAL CATEGORY NAMES:
 *   - "Category A" for High   — model and market differed by >= 5pp
 *   - "Category B" for Medium — differed by 2.5-5pp
 *   - "Category C" for Low    — differed by < 2.5pp, or anomaly-flagged
 *   - "Sample too small" for insufficient_data — model declined to
 *                                                emit a projection
 *
 * Sprint 035: the previous names ("Stronger signal" / "Watch" /
 * "High-variance") ranked the tiers in the reader's mind in exactly the
 * wrong order. Measured over 21,192 settled rows the ordering is
 * INVERTED — A .4934, B .5063, C .5172 — so the labels are now letters
 * that carry no built-in ranking, and each caption states the measured
 * settle rate alongside it.
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

/**
 * Reader-facing label for a confidence tier.
 *
 * SPRINT 035 — these labels used to invert the reader's instruction.
 * "High" rendered as "Stronger signal" and "Low" as "High-variance", while on 21,192 settled rows
 * "High" hit .4934 and "Low" hit .5172. The rename was more persuasive than the raw tier: it endorsed
 * the worst-performing bucket harder and discouraged the best-performing one harder.
 *
 * The tier DESCRIBES how a projection was produced — it is a relabelled edge bucket (90.8%
 * deterministic) and has never been shown to predict outcome. Labels are therefore neutral and
 * categorical: they name the band a row fell in and imply no ordering of quality.
 */
export function confidenceLabel(c: RawConfidence | null | undefined): string {
  switch (c) {
    case "High":
      return "Category A";
    case "Medium":
      return "Category B";
    case "Low":
      return "Category C";
    case "insufficient_data":
      return "Sample too small";
    case "no_play":
      return "No play";
    default:
      return typeof c === "string" ? c : "";
  }
}

/**
 * One-line explanation suited for tooltip / sub-line text.
 *
 * Each caption states the band a row fell in AND how that band has actually settled, so a reader is
 * never left to infer that an earlier letter is a better one. The rates are the reason these categories
 * no longer affect ordering.
 *
 * ⚠️ THESE RATES ARE A HARDCODED SNAPSHOT and the ledger grows every night. Sprint 036 measured the
 * Category C rate drift from 51.7% to 51.0% after a SINGLE overnight settle, while the Sprint 035 test
 * kept passing because it asserted the string rather than the data. `confidence-rate-accuracy.test.mjs`
 * now recomputes all three from the committed ledger and fails when a caption drifts, so a stale public
 * claim blocks the build instead of aging quietly. Deriving these automatically is the proper fix and is
 * on the Sprint 036 roadmap; until then the guard is what keeps them honest.
 */
export function confidenceCaption(c: RawConfidence | null | undefined): string {
  switch (c) {
    case "High":
      return "Model and market differed by 5pp or more. These have settled at 49.3% — the lowest of the three categories.";
    case "Medium":
      return "Model and market differed by 2.5–5pp. These have settled at 50.6%.";
    case "Low":
      return "Model and market differed by under 2.5pp, or the row was anomaly-flagged. These have settled at 51.0% — the highest of the three categories.";
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
