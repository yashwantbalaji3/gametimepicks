/**
 * CANONICAL research-eligibility RE-VALIDATION gate (node-importable; used by the settlement join, the observation
 * assembler, and the quarantine script — all of which run under plain `node`). This is the single runtime source of
 * truth for re-checking an INHERITED market-row eligibility against the authoritative event start.
 *
 * The one rule: an inherited researchEligible flag is NEVER trusted on its own. A settlement join copies a flag that
 * was computed upstream against a provider commence_time which can differ from the official first pitch (StatsAPI).
 * Every boundary that consumes a carried-forward row MUST re-validate here:
 *
 *   eligible  ⟺  inherited !== false
 *                AND capturedAt is a valid time
 *                AND eventStartTime is a valid time
 *                AND capturedAt < eventStartTime            (equality is INELIGIBLE)
 *                AND (availableAt is absent OR availableAt < eventStartTime)
 *
 * Missing capturedAt or eventStartTime ⇒ ineligible. availableAt is optional on legacy joined rows (the inherited
 * flag already encoded availability at capture); when present it is re-checked. Never infers eligibility.
 *
 * A `.test.mjs` pins these cases; a parity note lives in src/lib/mlb/pregame-archive/eligibility.ts.
 */

const ms = (iso) => (iso ? Date.parse(iso) : NaN);

/** @returns {{ eligible: boolean, reason: string, quality: string }} */
export function revalidateMarketEligibility({ inherited, capturedAt, availableAt, eventStartTime } = {}) {
  if (inherited === false) return { eligible: false, reason: "inherited ineligible (a join never upgrades)", quality: "MISSING" };
  const start = ms(eventStartTime), cap = ms(capturedAt);
  if (!Number.isFinite(start)) return { eligible: false, reason: "no authoritative event start time", quality: "TIMESTAMP_UNPROVEN" };
  if (!Number.isFinite(cap)) return { eligible: false, reason: "no capture time", quality: "TIMESTAMP_UNPROVEN" };
  if (cap >= start) return { eligible: false, reason: "captured at/after first pitch (re-validated vs authoritative event start)", quality: "POST_START_ONLY" };
  if (availableAt != null) {
    const avail = ms(availableAt);
    if (!Number.isFinite(avail)) return { eligible: false, reason: "availability time present but unparseable", quality: "TIMESTAMP_UNPROVEN" };
    if (avail >= start) return { eligible: false, reason: "value available only at/after first pitch", quality: "POST_START_ONLY" };
  }
  return { eligible: true, reason: "inherited-eligible + captured (and available, when known) strictly before first pitch", quality: "COMPLETE" };
}

/** Convenience boolean wrapper. */
export function isMarketRowResearchEligible(row, eventStartTime) {
  return revalidateMarketEligibility({ inherited: row?.researchEligible, capturedAt: row?.capturedAt ?? null, availableAt: row?.availableAt ?? null, eventStartTime }).eligible;
}
