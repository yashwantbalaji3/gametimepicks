/**
 * PR `feature/consolidated-results-tab` (2026-05-29) — pure helpers
 * that compute the public risk-section and sport-mix breakdown of
 * already-graded official optimizer slips.
 *
 * Why this lives in the loader/client layer:
 *   - The May 28 nightly settle graded `uniqueSlips` (the official
 *     model-recommended pool) with `status: win | loss | push |
 *     pending`. It does NOT yet grade the separately-generated
 *     `publicRiskSections` slips (PR 152 added them; the grader
 *     hasn't been taught about them).
 *   - PR 3 will add pipeline-side grading + summary fields. Until
 *     then this module re-buckets the already-settled `uniqueSlips`
 *     into the same Low / Medium / High / Longshot windows the
 *     public Suggested mode uses (`classifySlipBySection`), so the
 *     UI can answer "how did the Low / Medium / High / Longshot
 *     SECTIONS perform" without waiting for the pipeline change.
 *   - The math is the same strict gate: BOTH combined odds AND leg
 *     count must align with a section. Slips that don't qualify go
 *     in `unaligned` — they're tracked, never silently dropped.
 *
 * Honesty rules:
 *   - Never fabricates a status. `pending` slips are tracked
 *     separately from decisive (`win` + `loss`).
 *   - Pushes excluded from hit-rate denominator.
 *   - When a slip lacks a usable combined-odds value (some leg has
 *     `oddsForSide: null`), we drop it from sections — same rule the
 *     pre-game classifier uses (PR 152).
 *   - Sport bucket derivation matches the optimizer: NBA-only,
 *     MLB-only, Mixed (any other multi-sport combo). A slip whose
 *     legs all share one sport is bucketed under that sport.
 */
import {
  RISK_SECTION_ORDER,
  classifySlipBySection,
  combinedAmericanOddsFromLegs,
  type RiskSectionKey,
} from "./parlay-risk-sections";

export type GradedStatus = "win" | "loss" | "push" | "pending" | "void";

export interface GradedSlip {
  /** A slip we treat as graded — `status` lives on the object. */
  status?: GradedStatus | string | null;
  legs: ReadonlyArray<{
    sport?: string | null;
    oddsForSide?: number | null;
  }>;
}

export interface BreakdownRow {
  /** Total slips in this row (including pending / pushes). */
  total: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  /** Decisive = wins + losses (pushes excluded). */
  decisive: number;
  /** Hit rate over decisive. `null` when decisive is 0 — never
   *  fabricated. */
  hitRate: number | null;
}

export type SportBucketKey = "nba" | "mlb" | "multi";

const _EMPTY: BreakdownRow = {
  total: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
  pending: 0,
  decisive: 0,
  hitRate: null,
};

/** Pure: combined-American-odds helper that delegates to the
 *  parlay-risk-sections module so the math stays in one place.
 *  Normalizes the leg shape so the helper's required-field signature
 *  is satisfied; legs with missing `oddsForSide` flow through as
 *  `null` and trigger the honest unaligned bucket downstream. */
function _combinedOddsForSlip(slip: GradedSlip): number | null {
  const normalized = slip.legs.map((l) => ({
    oddsForSide: l.oddsForSide ?? null,
  }));
  return combinedAmericanOddsFromLegs(normalized);
}

function _bucketAdd(row: BreakdownRow, status: string | null | undefined): BreakdownRow {
  const s = (status ?? "pending").toString().toLowerCase();
  const next: BreakdownRow = {
    ...row,
    total: row.total + 1,
    wins: row.wins + (s === "win" ? 1 : 0),
    losses: row.losses + (s === "loss" ? 1 : 0),
    pushes: row.pushes + (s === "push" ? 1 : 0),
    pending:
      row.pending +
      (s === "pending" || s === "void" || s === "" ? 1 : 0),
    decisive: row.decisive + (s === "win" || s === "loss" ? 1 : 0),
    hitRate: null,
  };
  next.hitRate = next.decisive > 0 ? next.wins / next.decisive : null;
  return next;
}

/** Bucket every input slip into a risk section (Low / Medium / High
 *  / Longshot) using the strict odds + leg-count gate. Slips that
 *  fail either filter land in `unaligned`. */
export interface RiskSectionBreakdown {
  sections: Record<RiskSectionKey, BreakdownRow>;
  /** Slips that don't fit any section's odds + leg-count window. */
  unaligned: BreakdownRow;
}

export function summarizeByRiskSection(
  slips: ReadonlyArray<GradedSlip>,
): RiskSectionBreakdown {
  const out: RiskSectionBreakdown = {
    sections: {
      low: { ..._EMPTY },
      medium: { ..._EMPTY },
      high: { ..._EMPTY },
      longshot: { ..._EMPTY },
    },
    unaligned: { ..._EMPTY },
  };
  for (const slip of slips) {
    const am = _combinedOddsForSlip(slip);
    const section = classifySlipBySection(am, slip.legs.length);
    if (section == null) {
      out.unaligned = _bucketAdd(out.unaligned, slip.status ?? undefined);
      continue;
    }
    out.sections[section] = _bucketAdd(
      out.sections[section],
      slip.status ?? undefined,
    );
  }
  return out;
}

/** Sport mix derivation matches the pipeline: every leg shares one
 *  sport → bucket under that sport; otherwise `multi`. Slips with no
 *  legs are skipped — never fabricated. */
function _sportBucket(slip: GradedSlip): SportBucketKey | null {
  const sports = new Set<string>();
  for (const l of slip.legs) {
    if (l.sport && typeof l.sport === "string") sports.add(l.sport.toLowerCase());
  }
  if (sports.size === 0) return null;
  if (sports.size === 1) {
    const s = sports.values().next().value;
    if (s === "nba" || s === "mlb") return s;
    return null;
  }
  // 2+ sports → "multi" (mixed).
  return "multi";
}

export interface SportBucketBreakdown {
  nba: BreakdownRow;
  mlb: BreakdownRow;
  multi: BreakdownRow;
  /** Slips whose sport could not be determined (no legs / unknown
   *  sport string). Tracked so we never fabricate. */
  other: BreakdownRow;
}

export function summarizeBySportBucket(
  slips: ReadonlyArray<GradedSlip>,
): SportBucketBreakdown {
  const out: SportBucketBreakdown = {
    nba: { ..._EMPTY },
    mlb: { ..._EMPTY },
    multi: { ..._EMPTY },
    other: { ..._EMPTY },
  };
  for (const slip of slips) {
    const bucket = _sportBucket(slip);
    if (bucket == null) {
      out.other = _bucketAdd(out.other, slip.status ?? undefined);
      continue;
    }
    out[bucket] = _bucketAdd(out[bucket], slip.status ?? undefined);
  }
  return out;
}

/** A settled record (W/L/P/pending + decisive + hit rate). Mirrors the
 *  optimizer-summary bucket shape so the Results hero can show two clearly
 *  separated lifetime records: published cards vs the generated pool. */
export interface SettledRecord {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  decisive: number;
  hitRate: number | null;
}

/**
 * Aggregate a per-section / per-bucket map (each value a record with
 * wins/losses/pushes/pending) into ONE record. Used to turn
 * `byPublicSection.lifetime` (low/medium/high/longshot) or
 * `byPublicSection.byDate[date]` into the single "published cards" record. Pure;
 * never fabricates — sums only what is present. hitRate = wins / (wins+losses).
 */
export function summarizePublishedRecord(
  sectionMap:
    | Record<string, { wins?: number; losses?: number; pushes?: number; pending?: number }>
    | null
    | undefined,
): SettledRecord {
  const acc = { wins: 0, losses: 0, pushes: 0, pending: 0 };
  if (sectionMap) {
    for (const r of Object.values(sectionMap)) {
      if (!r) continue;
      acc.wins += r.wins ?? 0;
      acc.losses += r.losses ?? 0;
      acc.pushes += r.pushes ?? 0;
      acc.pending += r.pending ?? 0;
    }
  }
  const decisive = acc.wins + acc.losses;
  return {
    ...acc,
    decisive,
    hitRate: decisive > 0 ? acc.wins / decisive : null,
  };
}

/** Format a hit rate row for display. Always returns a stable
 *  shape; the UI decides whether to render "—" for the rate when
 *  decisive is 0. */
export function formatHitRateLabel(
  wins: number,
  losses: number,
): string {
  const decisive = wins + losses;
  if (decisive === 0) return "—";
  const r = wins / decisive;
  return `${(r * 100).toFixed(1)}%`;
}

export { RISK_SECTION_ORDER };
