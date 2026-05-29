/**
 * PR `feature/learning-signal-tables` (2026-05-29) — pure helper
 * that turns the live optimizer summary + audit policy into a
 * read-only "tracking" table for the /results page.
 *
 * Why this exists:
 *   - The /results page has long shown total hit rates per profile.
 *     What it didn't show: which audit signals the model is
 *     watching, how big the sample is, and whether the signal has
 *     cleared the confirming-days threshold the audit policy
 *     requires before the optimizer is allowed to act on it.
 *   - This module produces a list of `LearningSignalRow` objects
 *     the UI renders as a flat table. No new data, no new HTTP, no
 *     fabricated results.
 *
 * Honesty:
 *   - Statuses come from explicit numeric gates already documented
 *     in `docs/AUDIT_INFORMED_OPTIMIZER_NOTES_2026-05-28.md`.
 *   - When a sample is below the minimum-n threshold the status is
 *     "Too small to act on" — never "tracking" + a fake direction.
 *   - "Confirmed" status fires only when the live audit policy file
 *     says `confirmed: true` for the relevant signal. Today none of
 *     them are confirmed.
 *   - We do NOT say "the model learned" anywhere.
 *   - We do NOT change optimizer behavior — this is purely
 *     informational.
 *
 * Inputs:
 *   - `summary` — the post-era optimizer summary (lifetime
 *     + byProfile + byPublicSection + bySportBucket).
 *   - `policy` — the audit policy JSON (`audit/policy.json`).
 */
import type {
  OptimizerSummary,
  OptimizerSummaryBucket,
} from "./parlay-results";

export type LearningSignalStatus =
  | "tracking"
  | "too-small"
  | "shadow-test-candidate"
  | "confirmed-not-consumed";

export interface LearningSignalRow {
  /** Stable identifier for the row (used for React keys). */
  id: string;
  /** Display name of the signal — short. */
  signal: string;
  /** Observed sample size relevant to the signal. */
  sample: number;
  /** Threshold below which the signal is "too small". Pulled from
   *  the audit-informed notes doc. */
  minSample: number;
  /** Direction of the observed effect. Free-text, e.g. "+8.3pp
   *  below lifetime" or "matches lifetime" — never fabricated. */
  direction: string;
  /** Status — driven by the gates documented in
   *  `docs/AUDIT_INFORMED_OPTIMIZER_NOTES_2026-05-28.md`. */
  status: LearningSignalStatus;
  /** One-line plain-English rationale. */
  explanation: string;
}

/** Live audit policy shape. We only read a small subset. */
export interface AuditPolicyLike {
  confirmed?: boolean;
  signals?: Record<
    string,
    {
      fires?: number;
      daysRequired?: number;
      confirmed?: boolean;
      strength?: number;
      weightMultiplier?: number;
    } | Record<string, unknown>
  >;
}

/** Threshold sourced from `AUDIT_INFORMED_OPTIMIZER_NOTES_2026-05-28.md`. */
const _PROFILE_DEMOTION_MIN_N = 60;
const _PROFILE_DEMOTION_GAP_PP = 8;
const _SECTION_CAP_MIN_N = 40;

/** Compute "X pp" delta (signed) between an observed hit rate and a
 *  baseline. Returns null when either input is unusable. */
function _ppDelta(
  observedRate: number | null,
  baselineRate: number | null,
): number | null {
  if (
    observedRate == null ||
    baselineRate == null ||
    !Number.isFinite(observedRate) ||
    !Number.isFinite(baselineRate)
  ) {
    return null;
  }
  return Math.round((observedRate - baselineRate) * 1000) / 10;
}

/** Compose "<signed pp> vs lifetime" or "matches lifetime". */
function _formatDirection(
  observed: OptimizerSummaryBucket | undefined,
  baseline: OptimizerSummaryBucket,
): string {
  const delta = _ppDelta(
    observed?.hitRate ?? null,
    baseline?.hitRate ?? null,
  );
  if (delta == null) return "—";
  if (delta === 0) return "matches lifetime";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}pp vs lifetime`;
}

/** Status for a sample + delta against the profile-demotion gates. */
function _profileStatus(
  n: number,
  observedRate: number | null,
  baselineRate: number | null,
): LearningSignalStatus {
  if (n < _PROFILE_DEMOTION_MIN_N) return "too-small";
  const delta = _ppDelta(observedRate, baselineRate);
  if (delta == null) return "too-small";
  // A negative delta below the gap → shadow-test candidate.
  if (delta <= -_PROFILE_DEMOTION_GAP_PP) return "shadow-test-candidate";
  return "tracking";
}

/** Status for a section-cap candidate row. */
function _sectionStatus(n: number): LearningSignalStatus {
  if (n < _SECTION_CAP_MIN_N) return "too-small";
  return "tracking";
}

/** Build the table from the summary + (optional) audit policy. Pure;
 *  never fetches; never fabricates. Returns rows in display order.
 *  The caller renders them top-down. */
export function buildLearningSignalRows(
  summary: OptimizerSummary | null,
  policy: AuditPolicyLike | null,
): LearningSignalRow[] {
  const rows: LearningSignalRow[] = [];
  if (!summary) return rows;

  const lifetime = summary.lifetime;
  const byProfile = summary.byProfile ?? {};
  const sectionLifetime =
    summary.byPublicSection?.lifetime ?? {};
  const sportBucketLifetime =
    summary.bySportBucket?.lifetime ?? {};

  // ---------- Profile rows ----------
  // Each safe lane is a candidate for demotion / promotion. The
  // strict gates live in `docs/AUDIT_INFORMED_OPTIMIZER_NOTES_2026-05-28.md`.
  const profileOrder: Array<{ key: string; label: string }> = [
    { key: "conservative", label: "Conservative profile" },
    { key: "balanced", label: "Balanced profile" },
    { key: "aggressive", label: "Aggressive profile" },
    { key: "star_power", label: "Star Power profile" },
  ];
  for (const { key, label } of profileOrder) {
    const bucket = byProfile[key];
    if (!bucket) continue;
    const n = bucket.decisive;
    const status = _profileStatus(
      n,
      bucket.hitRate,
      lifetime.hitRate,
    );
    const direction = _formatDirection(bucket, lifetime);
    rows.push({
      id: `profile:${key}`,
      signal: label,
      sample: n,
      minSample: _PROFILE_DEMOTION_MIN_N,
      direction,
      status,
      explanation:
        status === "shadow-test-candidate"
          ? "Past the n + gap thresholds — qualifies for shadow evaluation before any optimizer change."
          : status === "too-small"
            ? "Below the n=60 floor; honest read requires more decisive slips."
            : "Within the variance band; no action needed.",
    });
  }

  // ---------- Public risk-section rows ----------
  // Each section is a candidate for cap-tightening when both n and
  // observed hit-rate floor gates clear.
  const sectionOrder: Array<{ key: string; label: string; floor: number }> = [
    { key: "low", label: "Low Risk section", floor: 0.35 },
    { key: "medium", label: "Medium Risk section", floor: 0.22 },
    { key: "high", label: "High Risk section", floor: 0.12 },
    { key: "longshot", label: "Longshot section", floor: 0.06 },
  ];
  for (const { key, label, floor } of sectionOrder) {
    const bucket = sectionLifetime[key];
    const n = bucket?.decisive ?? 0;
    let status = _sectionStatus(n);
    if (status === "tracking" && bucket?.hitRate != null && bucket.hitRate < floor) {
      status = "shadow-test-candidate";
    }
    const direction =
      bucket && bucket.decisive > 0
        ? `${(bucket.hitRate! * 100).toFixed(1)}% hit · floor ${(floor * 100).toFixed(0)}%`
        : "—";
    rows.push({
      id: `section:${key}`,
      signal: label,
      sample: n,
      minSample: _SECTION_CAP_MIN_N,
      direction,
      status,
      explanation:
        status === "shadow-test-candidate"
          ? "Below the published floor and past the n=40 gate — flagged for shadow evaluation."
          : status === "too-small"
            ? "Section sample below n=40; cap stays where PR #152 set it."
            : "Within the published floor; section cap stays unchanged.",
    });
  }

  // ---------- Sport-bucket rows ----------
  const sportOrder: Array<{ key: string; label: string }> = [
    { key: "nba", label: "NBA-only public" },
    { key: "mlb", label: "MLB-only public" },
    { key: "multi", label: "Mixed (NBA + MLB) public" },
  ];
  for (const { key, label } of sportOrder) {
    const bucket = sportBucketLifetime[key];
    const n = bucket?.decisive ?? 0;
    rows.push({
      id: `sport:${key}`,
      signal: label,
      sample: n,
      minSample: _SECTION_CAP_MIN_N,
      direction:
        bucket && bucket.decisive > 0
          ? `${(bucket.hitRate! * 100).toFixed(1)}% hit · ${bucket.wins}-${bucket.losses}`
          : "—",
      status: n < _SECTION_CAP_MIN_N ? "too-small" : "tracking",
      explanation:
        n < _SECTION_CAP_MIN_N
          ? "Sample below n=40; honest read requires more decisive slips."
          : "Tracked at the audit-policy level — no behavior change yet.",
    });
  }

  // ---------- Audit-policy signals ----------
  // Surface every signal the policy file already tracks. The status
  // comes directly from the policy — we never invent confirmation.
  const policySignals = policy?.signals ?? {};
  for (const [name, sig] of Object.entries(policySignals)) {
    if (!sig || typeof sig !== "object") continue;
    const fires = Number((sig as { fires?: number }).fires ?? 0);
    const required = Number(
      (sig as { daysRequired?: number }).daysRequired ?? 3,
    );
    const confirmed = Boolean(
      (sig as { confirmed?: boolean }).confirmed,
    );
    const strength = Number(
      (sig as { strength?: number; weightMultiplier?: number })
        .strength ??
        (sig as { weightMultiplier?: number }).weightMultiplier ??
        0,
    );
    rows.push({
      id: `policy:${name}`,
      signal: `Audit signal · ${name}`,
      sample: fires,
      minSample: required,
      direction:
        strength !== 0
          ? `strength ${strength.toFixed(2)}`
          : "fires tracked",
      status: confirmed ? "confirmed-not-consumed" : "tracking",
      explanation: confirmed
        ? "Confirming-days threshold cleared — pending operator approval before optimizer consumes it."
        : `Fired ${fires} of ${required} required days; still under threshold.`,
    });
  }

  return rows;
}

/** Display label + tone for each status. */
export function getStatusDisplay(status: LearningSignalStatus): {
  label: string;
  toneVar: string;
} {
  switch (status) {
    case "confirmed-not-consumed":
      return {
        label: "Confirmed — not consumed",
        toneVar: "var(--vault-gold-bright)",
      };
    case "shadow-test-candidate":
      return {
        label: "Shadow-test candidate",
        toneVar: "var(--vault-warn)",
      };
    case "too-small":
      return {
        label: "Too small to act on",
        toneVar: "var(--vault-text-faint)",
      };
    case "tracking":
    default:
      return {
        label: "Tracking",
        toneVar: "var(--vault-text-mute)",
      };
  }
}
