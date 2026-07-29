/**
 * SPRINT 048 — should this prediction be shown, and how?
 *
 * THE DESIGN DECISION THAT MATTERS
 * The obvious implementation of "publishing gates" is a filter: hide anything that looks bad. That is
 * the wrong shape for a research product, and it fails in a specific way — a market quietly vanishes,
 * the remaining numbers look better, and the platform has silently curated itself into a flattering
 * subset. The measured record would improve without the model improving at all.
 *
 * So eligibility here returns a PRESENTATION, not a yes/no. A market whose 95% interval sits below
 * break-even (`batter_total_bases`: 43.76% on 4,120 rows) is still shown — labelled, with its record
 * attached. That is more useful than silence and cannot be mistaken for a good result.
 *
 * Only one thing is genuinely withheld: a probability we cannot stand behind. If provenance is missing
 * or the sample cannot support any statement, the row is shown WITHOUT a probability rather than with
 * an unsupported one.
 *
 * Data-only. No I/O, no React.
 */
import type { ProbabilityLayers } from "./probability-layers";

/** Mirrors the market registry's statuses. See `scripts/build-learning-report.mjs`. */
export type MarketStatus = "APPROVED" | "MONITOR" | "RECALIBRATE" | "DISABLED";

export interface MarketEvidence {
  readonly market: string;
  readonly status: MarketStatus;
  readonly n: number;
  readonly hitRate: number | null;
  readonly hitRate95: { readonly low: number | null; readonly high: number | null };
  /** True when measured against the de-vigged market on identical rows. */
  readonly beatsMarketBrier: boolean;
  readonly overconfidencePp: number | null;
}

export type PublishTreatment =
  /** Show the prediction and its probability normally, with its evidence available. */
  | "SHOW"
  /** Show it, but lead with the market's measured record — the number needs context to be read fairly. */
  | "SHOW_WITH_WARNING"
  /** Show that a prediction exists, but withhold the probability: we cannot stand behind the number. */
  | "SHOW_WITHOUT_PROBABILITY";

export interface EligibilityDecision {
  readonly treatment: PublishTreatment;
  /** One sentence a user could read. States the limitation plainly; never hedged into meaninglessness. */
  readonly disclosure: string;
  /** Machine-readable reasons, for the ops surface and for tests. */
  readonly reasons: readonly string[];
  /** Whether the displayed probability came from a calibrated layer. */
  readonly probabilityIsCalibrated: boolean;
}

export interface EligibilityInput {
  readonly layers: ProbabilityLayers;
  readonly evidence: MarketEvidence;
  /** False when capture provenance for this row is missing or unprovable. */
  readonly provenanceComplete: boolean;
}

const pct = (v: number | null | undefined, d = 1) => (v == null ? "n/a" : `${(v * 100).toFixed(d)}%`);

/**
 * Decide how a prediction should be presented.
 *
 * The order of checks is the order of severity, and provenance comes first: a number whose timing we
 * cannot prove is not a weak claim, it is an unverifiable one, and no amount of good market history
 * rescues it.
 */
export function decideEligibility(input: EligibilityInput): EligibilityDecision {
  const { layers, evidence, provenanceComplete } = input;
  const reasons: string[] = [];
  const calibrated = layers.displayedSource === "calibrated";

  if (!provenanceComplete) {
    return {
      treatment: "SHOW_WITHOUT_PROBABILITY",
      disclosure:
        "We can't show a probability for this one — we can't prove when the underlying market data was captured, so we won't state a number we can't stand behind.",
      reasons: ["provenance incomplete — capture timing not provable"],
      probabilityIsCalibrated: calibrated,
    };
  }

  if (evidence.status === "MONITOR") {
    return {
      treatment: "SHOW_WITHOUT_PROBABILITY",
      disclosure:
        `We've only settled ${evidence.n} result${evidence.n === 1 ? "" : "s"} in this market — not enough to say how accurate our probabilities are here, so we're not showing one yet.`,
      reasons: [`sample of ${evidence.n} is below the minimum for any accuracy statement`],
      probabilityIsCalibrated: calibrated,
    };
  }

  if (evidence.status === "DISABLED") {
    reasons.push(
      `measured ${pct(evidence.hitRate)} over ${evidence.n} settled results, with the full 95% range ` +
        `[${pct(evidence.hitRate95.low)}, ${pct(evidence.hitRate95.high)}] below break-even`,
    );
    return {
      treatment: "SHOW_WITH_WARNING",
      // Shown, not hidden. Hiding it would quietly improve every other number on the page.
      disclosure:
        `Our record in this market is poor: ${pct(evidence.hitRate)} across ${evidence.n.toLocaleString()} settled results, ` +
        `and the whole confidence range sits below break-even. We're showing it because hiding our worst market would ` +
        `make everything else look better than it is.`,
      reasons,
      probabilityIsCalibrated: calibrated,
    };
  }

  if (evidence.status === "RECALIBRATE") {
    reasons.push(`does not out-score the sportsbook on this market's ${evidence.n.toLocaleString()} settled results`);
    if (evidence.overconfidencePp != null && Math.abs(evidence.overconfidencePp) > 5) {
      reasons.push(`stated probabilities run ${Math.abs(evidence.overconfidencePp).toFixed(1)}pp ${evidence.overconfidencePp > 0 ? "high" : "low"}`);
    }
    return {
      treatment: "SHOW_WITH_WARNING",
      disclosure: calibrated
        ? `Probabilities here are calibrated against ${evidence.n.toLocaleString()} settled results, so the number should be roughly true. On this market our model still doesn't score better than the sportsbook.`
        : `This market's probabilities aren't calibrated yet and have run ${evidence.overconfidencePp != null ? `${Math.abs(evidence.overconfidencePp).toFixed(1)}pp too high` : "high"} historically. Read the number with that in mind.`,
      reasons,
      probabilityIsCalibrated: calibrated,
    };
  }

  return {
    treatment: "SHOW",
    disclosure: `Measured ${pct(evidence.hitRate)} across ${evidence.n.toLocaleString()} settled results in this market.`,
    reasons: ["market meets the evidence bar on a sufficient sample"],
    probabilityIsCalibrated: calibrated,
  };
}

/**
 * Whether a probability should be rendered at all.
 *
 * Split out because several surfaces need the boolean without the prose, and duplicating the rule at
 * each call site is how the two drift apart.
 */
export const shouldShowProbability = (d: EligibilityDecision): boolean =>
  d.treatment !== "SHOW_WITHOUT_PROBABILITY";
