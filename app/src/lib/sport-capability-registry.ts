/**
 * SPORT CAPABILITY REGISTRY (Sprint 019 · Phase 1) — the single source of truth for what GameTimePicks can
 * ACTUALLY do per sport, and why.
 *
 * The problem it solves: capability was previously implied by a DISPLAY field. `sports-coverage.ts` marked
 * NBA `level: "full"`, which `sport-capabilities.ts` converted into hasProjections / hasSuggestedParlays /
 * hasBuildYourOwn / hasGrading = true and put NBA into MODELED_SPORT_KEYS. That contradicted the repo's own
 * evidence (status/nba-first-market-recommendation.json = HISTORICAL_ONLY, publicApproved:false) and made
 * /events advertise "Projections + Parlays" for a sport with no live data. A marketing label had become a
 * product gate.
 *
 * Rules:
 *   • One state per sport, each with a REASON and the EVIDENCE files that justify it. A status nobody can
 *     audit is just an opinion.
 *   • Fails CLOSED: an unknown sport is DISABLED, not assumed capable.
 *   • Permissions are DERIVED from state — never hand-set per sport, so no surface can quietly disagree.
 *
 * This registry states capability. It does not decide layout; display modules should ask it rather than
 * infer capability from their own labels.
 */

export type CapabilityState =
  /** Live modelled product: simulations, predictions, and graded results all real and current. */
  | "FULL_MODEL"
  /** Real settled history worth publishing, but NO live capability right now (off-season, dead source). */
  | "HISTORICAL_ONLY"
  /** Internal research exists and is leakage-safe, but nothing is validated for public prediction use. */
  | "RESEARCH_ONLY"
  /** Routes/components exist; the underlying data or validation does not. Publish nothing predictive. */
  | "SCAFFOLD_ONLY"
  /** Not offered at all. Also the fail-closed default for anything unknown. */
  | "DISABLED";

export interface SportCapability {
  key: string;
  label: string;
  state: CapabilityState;
  /** WHY this sport has this state, in one sentence a non-engineer can check. */
  reason: string;
  /** Repo paths whose contents justify `state`. Keeps the claim auditable instead of asserted. */
  evidence: string[];
}

/**
 * The registry. Every state below is backed by a file in `evidence` — if you change a state, change the
 * evidence with it, or the guard test will ask you why.
 */
export const SPORT_CAPABILITIES: ReadonlyArray<SportCapability> = [
  {
    key: "mlb",
    label: "MLB",
    state: "FULL_MODEL",
    reason:
      "Daily board, 10,000-run full-game simulations, a canonical prediction layer, and nightly settlement all run and publish for the current slate.",
    evidence: [
      "app/public/data/mlb/full-game-simulations/",
      "app/public/data/mlb/predictions/",
      "app/src/lib/mlb/prediction/decision.ts",
      ".github/workflows/mlb-daily-production.yml",
    ],
  },
  {
    key: "nba",
    label: "NBA",
    state: "HISTORICAL_ONLY",
    reason:
      "Off-season, and the primary source is failing: every board since 2026-06-13 carries dataMode ScheduleUnavailable from stats.nba.com timeouts. The settled record is real and stays published; there is no live projection capability.",
    evidence: [
      "status/nba-first-market-recommendation.json",
      "app/public/data/results/lifetime_summary.json",
      "app/scripts/build-market-coverage-matrix.mjs",
    ],
  },
  {
    key: "ufc",
    label: "UFC",
    state: "SCAFFOLD_ONLY",
    reason:
      "Formally downgraded 2026-07-23: the moneyline is a de-vigged market price with a capped nudge (no independent signal), and zero bouts are cleanly backtestable because there is no point-in-time pregame odds capture.",
    evidence: [
      "status/ufc-graduation-decision.json",
      "app/public/data/ufc/readiness-latest.json",
      "app/public/data/ufc/ops-status-latest.json",
    ],
  },
  {
    key: "soccer",
    label: "Soccer",
    state: "SCAFFOLD_ONLY",
    reason:
      "The market-implied team-market read is genuine and reusable, but there is no live competition and no stats provider — readiness fails closed on 'no soccer stats/xG/minutes provider connected', so every player market is unsettleable.",
    evidence: [
      "app/public/data/world-cup/projection-readiness-latest.json",
      "app/src/lib/market-coverage.ts",
    ],
  },
  {
    key: "nhl",
    label: "NHL",
    state: "SCAFFOLD_ONLY",
    reason:
      "No ingest script exists anywhere in the repo; the handful of schedule files came from a single manual run and nothing can refresh them, let alone project.",
    evidence: ["app/public/data/nhl/schedule/", "app/src/lib/data-nhl.ts"],
  },
  {
    key: "ipl",
    label: "IPL",
    state: "SCAFFOLD_ONLY",
    reason:
      "Schedule-only. There is no per-batsman/per-bowler stats source, and the projection pipeline was deliberately removed from every user-facing surface.",
    evidence: ["app/public/data/ipl/schedule/", "app/src/lib/cricket-projection.ts"],
  },
  {
    key: "wnba",
    label: "WNBA",
    state: "SCAFFOLD_ONLY",
    reason:
      "Schedule snapshot only, hand-maintained in event-schedules.ts with no refresh job. No projections, no odds, no simulation path.",
    evidence: ["app/src/lib/event-schedules.ts", "app/src/lib/sports-coverage.ts"],
  },
  {
    key: "mls",
    label: "MLS",
    state: "SCAFFOLD_ONLY",
    reason:
      "Schedule snapshot only. It shares the soccer market-implied path, which is itself blocked on a stats provider, so nothing predictive can publish.",
    evidence: ["app/src/lib/event-schedules.ts", "app/public/data/world-cup/projection-readiness-latest.json"],
  },
  {
    key: "epl",
    label: "EPL",
    state: "DISABLED",
    reason:
      "Nothing is published at all — not even a schedule. Listed as a future intention only, so it must never imply coverage.",
    evidence: ["app/src/lib/sports-coverage.ts"],
  },
  {
    key: "nfl",
    label: "NFL",
    state: "DISABLED",
    reason:
      "Nothing exists: no provider, no schedule, no route, no ingest. Any NFL surface would be entirely fabricated.",
    evidence: ["app/scripts/build-market-coverage-matrix.mjs"],
  },
];

const BY_KEY = new Map(SPORT_CAPABILITIES.map((c) => [c.key, c]));

/** The fail-closed default. An unrecognised sport is never assumed capable. */
export const UNKNOWN_SPORT: SportCapability = {
  key: "unknown",
  label: "Unknown",
  state: "DISABLED",
  reason: "Not in the capability registry — fails closed rather than defaulting to capable.",
  evidence: [],
};

/** Look up a sport's capability. Case/whitespace insensitive; unknown → DISABLED. */
export function capabilityOf(sport: string | null | undefined): SportCapability {
  const key = String(sport ?? "").trim().toLowerCase();
  return BY_KEY.get(key) ?? UNKNOWN_SPORT;
}

export function capabilityState(sport: string | null | undefined): CapabilityState {
  return capabilityOf(sport).state;
}

// ── DERIVED PERMISSIONS ─────────────────────────────────────────────────────────────────────────
// Each answers one product question from `state` alone. Never add a per-sport exception here: if a sport
// needs different behaviour, its STATE is wrong and the evidence should say so.

/**
 * May this sport enter official prediction products — published picks, suggested parlays, Bank Builder /
 * Moonshot candidates? FULL_MODEL only. This is the gate that decides what the product stakes its name on.
 */
export function canEnterPredictionProducts(sport: string | null | undefined): boolean {
  return capabilityState(sport) === "FULL_MODEL";
}

/** May we show forward-looking projections/simulations for this sport? FULL_MODEL only. */
export function canShowLiveProjections(sport: string | null | undefined): boolean {
  return capabilityState(sport) === "FULL_MODEL";
}

/**
 * How results should be presented.
 *   "live"    — current, still accruing (FULL_MODEL)
 *   "archive" — real settled history, explicitly frozen (HISTORICAL_ONLY)
 *   "none"    — nothing to report
 * Blending "live" and "archive" into one figure is what made /results misleading; this keeps them separable.
 */
export function resultsMode(sport: string | null | undefined): "live" | "archive" | "none" {
  const s = capabilityState(sport);
  if (s === "FULL_MODEL") return "live";
  if (s === "HISTORICAL_ONLY") return "archive";
  return "none";
}

/** Should this sport appear in navigation / the sports directory at all? DISABLED sports must not. */
export function isPubliclyListed(sport: string | null | undefined): boolean {
  return capabilityState(sport) !== "DISABLED";
}

/** Sports the product will stake a live prediction on. Derived — never hand-maintained. */
export const FULL_MODEL_SPORTS: ReadonlyArray<string> = SPORT_CAPABILITIES.filter(
  (c) => c.state === "FULL_MODEL",
).map((c) => c.key);

/** Honest, capability-driven badge text. Replaces labels that promised more than the data supports. */
export const CAPABILITY_BADGE: Record<CapabilityState, string> = {
  FULL_MODEL: "Simulations + Predictions",
  HISTORICAL_ONLY: "Historical archive",
  RESEARCH_ONLY: "Research only",
  SCAFFOLD_ONLY: "Schedule only",
  DISABLED: "Not covered",
};
