/**
 * MLB pregame market normalizer — the pure de-vig + eligibility math for captured Odds-API market snapshots.
 *
 * This is the tested source of truth for the odds math; the runtime capture script
 * (app/scripts/capture-mlb-pregame-markets.mjs) mirrors these exact formulas (it must run under plain `node` in
 * CI, so it cannot import this .ts at runtime — keep the two in sync). Internal research only: no public output.
 *
 * Rules:
 *   - De-vig only when a market has a complete PAIR at the same line (h2h: both teams; totals/spreads: both sides).
 *     Never infer the missing side; over-only / unpaired ⇒ noVigProbability = null.
 *   - A market record is research-eligible only when capturedAt < eventStartTime AND availableAt < eventStartTime.
 */

export const americanToProb = (a: number | null | undefined): number | null =>
  a == null || !Number.isFinite(a) ? null : a < 0 ? -a / (-a + 100) : 100 / (a + 100);

export const americanToDecimal = (a: number | null | undefined): number | null =>
  a == null || !Number.isFinite(a) ? null : a > 0 ? a / 100 + 1 : 100 / -a + 1;

export type DeVigStatus = "paired" | "incomplete" | "over_only_or_unpaired";

/** Proportional de-vig of a two-way market: fair(side) = implied(side) / (implied(side) + implied(other)). */
export function deVig(sideOdds: number, otherOdds: number | null): { noVigProbability: number | null; status: DeVigStatus } {
  const p = americanToProb(sideOdds);
  const q = americanToProb(otherOdds ?? null);
  if (p == null) return { noVigProbability: null, status: "incomplete" };
  if (q == null) return { noVigProbability: null, status: "over_only_or_unpaired" };
  return { noVigProbability: +(p / (p + q)).toFixed(4), status: "paired" };
}

export interface MarketEligibilityInput {
  capturedAt: string | null;
  availableAt: string | null;
  eventStartTime: string | null;
}
export interface MarketEligibilityResult {
  researchEligible: boolean;
  eligibilityReason: string;
}

/** The market-record eligibility gate — identical spirit to the family eligibility: proven pregame only. */
export function marketRecordEligibility(x: MarketEligibilityInput): MarketEligibilityResult {
  const start = x.eventStartTime ? Date.parse(x.eventStartTime) : NaN;
  const cap = x.capturedAt ? Date.parse(x.capturedAt) : NaN;
  const avail = x.availableAt ? Date.parse(x.availableAt) : NaN;
  if (!Number.isFinite(start)) return { researchEligible: false, eligibilityReason: "no event start time" };
  if (!Number.isFinite(cap)) return { researchEligible: false, eligibilityReason: "no capture time" };
  if (cap >= start) return { researchEligible: false, eligibilityReason: "captured at/after first pitch" };
  if (!Number.isFinite(avail) || avail >= start) return { researchEligible: false, eligibilityReason: "provider availability at/after first pitch" };
  return { researchEligible: true, eligibilityReason: "captured + available pregame" };
}

/** availableAt = the earliest provable existence: the provider's last_update if it is before capture, else capture. */
export function resolveAvailableAt(sourceLastUpdate: string | null, capturedAt: string): string {
  return sourceLastUpdate && Date.parse(sourceLastUpdate) < Date.parse(capturedAt) ? sourceLastUpdate : capturedAt;
}
