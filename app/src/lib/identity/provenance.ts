/**
 * Research provenance — the record that answers "when did we know this?" for a single input.
 *
 * WHY
 * The Sprint 043 multi-sport audit found one failure shared by every sport: nothing forces a row to
 * state when it was captured relative to when its event started. Every "market baseline" claim outside
 * one internal 2022 World Cup file rests on a file-level `generatedAt`, which describes when the build
 * ran, not when the value was observed. UFC's feature set is built from career aggregates that include
 * the fight being predicted; NBA stores tip-off as the display string "8:30 PM ET", so `capturedAt <
 * start` cannot be proven for a single date.
 *
 * A research claim without provenance is not a weak claim; it is an unverifiable one.
 *
 * DESIGN RULES
 *  1. Eligibility is DERIVED, never stored as an assertion. A row cannot declare itself research-safe.
 *  2. Missing information means ineligible, never "probably fine". Fail closed, always.
 *  3. Ineligible data is RETAINED and labelled, never dropped. Deleting it destroys the audit trail
 *     that makes the ineligibility provable — and "we deleted the bad rows" is indistinguishable from
 *     "we never had bad rows" six months later.
 *
 * Sport-independent by construction: this module imports nothing from any sport's code.
 */
import { isLeakageSafe, type CaptureProvenance } from "./sport-adapter";

/** Why a row is or is not usable as a research input. Derived — never supplied by the caller. */
export type ResearchEligibility =
  /** Captured, and provably before the event started. Usable as a pregame feature. */
  | "ELIGIBLE"
  /** Captured at or after the event started. The value may encode its own outcome. */
  | "POST_EVENT_CAPTURE"
  /** No event start to compare against — the NBA "8:30 PM ET" case. */
  | "UNPROVABLE_TIMING"
  /** No capture timestamp at all — the UFC case. */
  | "NO_PROVENANCE"
  /** Structurally incomplete: missing event, provider, or market. */
  | "MALFORMED";

/**
 * One provenance record.
 *
 * `capturedAt` is when WE observed the value. `availableAt` is when it became knowable to anyone —
 * they differ for a line posted at 09:00 and captured at 11:00, and only the later of the two makes a
 * row safe. `sourceTimestamp` is what the upstream provider claimed, retained because a provider
 * disagreeing with our own clock is itself a finding (StatsAPI and the odds provider differ by up to a
 * minute on first pitch, which is what breaks equality joins on doubleheaders).
 */
export interface ProvenanceRecord {
  /** Canonical event id — never a provider id. See `event-identity.ts`. */
  readonly eventId: string;
  readonly provider: string;
  readonly marketType: string;
  readonly capturedAt: string | null;
  readonly availableAt?: string | null;
  /** The upstream's own timestamp, as given. Retained even when it disagrees with `capturedAt`. */
  readonly sourceTimestamp?: string | null;
  /** The event start this capture must precede. Null when the source gives no machine-readable start. */
  readonly eventStart: string | null;
}

/** A provenance record with its derived verdict attached. */
export interface EvaluatedProvenance extends ProvenanceRecord {
  readonly eligibility: ResearchEligibility;
  /** True only for `ELIGIBLE`. The single field downstream research should branch on. */
  readonly researchEligible: boolean;
  /** Human-readable justification. Present for every verdict, including eligible ones. */
  readonly reason: string;
}

const parse = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/**
 * Classify one record.
 *
 * The order of checks matters: structural problems are reported before timing ones, so a malformed row
 * is not mislabelled as merely late.
 */
export function evaluateProvenance(rec: ProvenanceRecord): EvaluatedProvenance {
  const base = { ...rec };

  if (!rec.eventId || !rec.provider || !rec.marketType) {
    return {
      ...base,
      eligibility: "MALFORMED",
      researchEligible: false,
      reason: "missing eventId, provider, or marketType — the row cannot be attributed to anything",
    };
  }

  if (!rec.capturedAt) {
    return {
      ...base,
      eligibility: "NO_PROVENANCE",
      researchEligible: false,
      reason: "no capture timestamp — a file-level generatedAt describes the build, not this row",
    };
  }

  const start = parse(rec.eventStart);
  if (start == null) {
    return {
      ...base,
      eligibility: "UNPROVABLE_TIMING",
      researchEligible: false,
      reason: rec.eventStart
        ? `event start "${rec.eventStart}" is not a machine-readable instant`
        : "no event start to compare the capture against",
    };
  }

  // Delegate the comparison itself so there is exactly one definition of leakage-safe in the codebase.
  const provenance: CaptureProvenance = {
    capturedAt: rec.capturedAt,
    availableAt: rec.availableAt ?? null,
    eventStart: rec.eventStart,
  };
  if (!isLeakageSafe(provenance)) {
    const observed = rec.availableAt ?? rec.capturedAt;
    return {
      ...base,
      eligibility: "POST_EVENT_CAPTURE",
      researchEligible: false,
      reason: `observed at ${observed}, at or after event start ${rec.eventStart} — the value may encode its own outcome`,
    };
  }

  return {
    ...base,
    eligibility: "ELIGIBLE",
    researchEligible: true,
    reason: `captured ${rec.capturedAt} before event start ${rec.eventStart}`,
  };
}

export interface ProvenanceSummary {
  readonly total: number;
  readonly eligible: number;
  readonly byEligibility: Readonly<Record<ResearchEligibility, number>>;
  /** Eligible / total, or 0 for an empty set. Never rounded up to flatter it. */
  readonly eligibleRate: number;
}

/**
 * Summarise a set of records.
 *
 * Returns every bucket including the zeroes, so a report cannot silently omit a failure category by
 * virtue of it being empty this run.
 */
export function summarizeProvenance(
  records: readonly EvaluatedProvenance[],
): ProvenanceSummary {
  const byEligibility: Record<ResearchEligibility, number> = {
    ELIGIBLE: 0,
    POST_EVENT_CAPTURE: 0,
    UNPROVABLE_TIMING: 0,
    NO_PROVENANCE: 0,
    MALFORMED: 0,
  };
  for (const r of records) byEligibility[r.eligibility] += 1;
  const total = records.length;
  return {
    total,
    eligible: byEligibility.ELIGIBLE,
    byEligibility,
    eligibleRate: total === 0 ? 0 : byEligibility.ELIGIBLE / total,
  };
}

/**
 * Partition records for research use WITHOUT discarding anything.
 *
 * Both halves are returned. A caller that wants only the eligible rows must still receive the
 * ineligible ones, because the count of what was excluded is part of any honest result — "n = 30"
 * means something different when 400 rows were silently dropped to get there.
 */
export function partitionForResearch(records: readonly EvaluatedProvenance[]): {
  eligible: readonly EvaluatedProvenance[];
  excluded: readonly EvaluatedProvenance[];
} {
  return {
    eligible: records.filter((r) => r.researchEligible),
    excluded: records.filter((r) => !r.researchEligible),
  };
}

export type { CaptureProvenance };
