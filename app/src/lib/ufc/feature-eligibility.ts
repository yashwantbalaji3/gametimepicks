/**
 * UFC leakage-safe feature eligibility (Phase 7). Applies the SAME discipline as the MLB research gate to UFC bouts,
 * and directly targets the two leakage bugs the forensic audit found (status/ufc-graduation-decision.json):
 *   (1) a date-agnostic name-key join pairing a rematch's pregame line with a PAST fight's result;
 *   (2) features built from CURRENT career stats that include the fight being predicted.
 *
 * A UFC feature value is research-eligible only when it was provably known BEFORE the bout AND was built ONLY from
 * fights strictly earlier than the bout date. Pure + deterministic. No modeling.
 */

const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

export interface UfcFeatureEligibilityInput {
  /** When the feature value was captured. */
  capturedAt: string | null;
  /** Official bout start (first bell). */
  boutStartTime: string | null;
  /** ISO dates of the fights the feature was derived from (career stats, finish rates, etc.). */
  sourceFightDates?: (string | null)[];
  /** The bout date (YYYY-MM-DD) — sources must be strictly earlier. Defaults to boutStartTime's date. */
  boutDate?: string | null;
  /** A stable bout identity used to guarantee a rematch never joins a past result. */
  boutId?: string | null;
}

export interface UfcFeatureEligibilityResult {
  eligible: boolean;
  reason: string;
}

export function ufcFeatureEligible(x: UfcFeatureEligibilityInput): UfcFeatureEligibilityResult {
  const start = ms(x.boutStartTime), cap = ms(x.capturedAt);
  if (!Number.isFinite(start)) return { eligible: false, reason: "no bout start time" };
  if (!Number.isFinite(cap)) return { eligible: false, reason: "no capture time" };
  if (cap >= start) return { eligible: false, reason: "captured at/after the first bell" };
  const boutDay = x.boutDate ?? day(x.boutStartTime);
  if (!boutDay) return { eligible: false, reason: "no bout date to bound source fights" };
  // CHRONOLOGICAL: every source fight must be STRICTLY earlier than the bout (no post-fight career stats).
  for (const d of x.sourceFightDates ?? []) {
    const sd = day(d);
    if (!sd) return { eligible: false, reason: "a source fight has no date (unprovable timing)" };
    if (sd >= boutDay) return { eligible: false, reason: `a source fight (${sd}) is not strictly earlier than the bout (${boutDay}) — leakage` };
  }
  return { eligible: true, reason: "captured pre-bell; every source fight strictly earlier than the bout" };
}

/**
 * A bout-identity key that a settlement join MUST use — so a rematch's pregame line can never join a past fight's
 * result. NEVER a bare fighter-name key (the confirmed leakage bug). Combines fighters + event date (or a native id).
 */
export function boutJoinKey(bout: { boutId?: string | null; fighters?: [string, string] | null; eventDate?: string | null }): string {
  if (bout.boutId) return `id:${bout.boutId}`;
  const f = (bout.fighters ?? ["?", "?"]).map((s) => (s || "?").toLowerCase().trim()).sort().join("|");
  const d = bout.eventDate ? bout.eventDate.slice(0, 10) : "nodate";
  return `fd:${f}@${d}`; // fighters + date → a rematch on a different date is a DISTINCT key
}
