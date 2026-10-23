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
 *
 * EVIDENCE IS NOT HERE (Housekeeping 10-22). This module is imported by client code (e.g. custom-parlay-builder.tsx
 * → custom-parlay.ts → sport-capabilities.ts), so every string in it ships to the browser. Each sport's evidence
 * paths — some under data/internal — live in the SERVER-ONLY sport-capability-evidence.ts (`evidenceOf(key)`),
 * read only by tests and scripts/audit-sports.mjs. Nothing here may name a data/internal path
 * (lib/client-graph-internal-paths.test.mjs).
 */

export type CapabilityState =
  /** Live modelled product: simulations, predictions, and graded results all real and current. */
  | "FULL_MODEL"
  /**
   * Public EXPERIMENTAL forecasts (P243 · B-2): real simulations/forecasts publish under an
   * explicit experimental banner, settled results accrue against them, but the sport has NOT
   * cleared the bar to enter official prediction products. NFL and EPL live here: schedules,
   * routes, evaluated models and graded records all exist — calling them DISABLED was false.
   */
  | "EXPERIMENTAL_PUBLIC"
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
  /* The repo paths whose contents justify `state` are server-only: sport-capability-evidence.ts evidenceOf(key). */
}

/**
 * The registry. Every state below is backed by files in sport-capability-evidence.ts — if you change a state,
 * change its evidence with it, or the guard test will ask you why.
 */
export const SPORT_CAPABILITIES: ReadonlyArray<SportCapability> = [
  {
    key: "mlb",
    label: "MLB",
    state: "FULL_MODEL",
    reason:
      "Daily board, 10,000-run full-game simulations, a canonical prediction layer, and nightly settlement all run and publish for the current slate.",
  },
  {
    key: "nba",
    label: "NBA",
    state: "HISTORICAL_ONLY",
    reason:
      "Schedule and official finals publish on /nba (free ESPN capture + the write-once finals record); no NBA model has cleared its preregistered bars, so no validated forecast publishes — only the frozen experimental projections of the §13 lane on /nba (not validated, never product-eligible). The May–June 2026 settled player-prop record is a retired model's archive and stays published as one.",
  },
  {
    key: "ufc",
    label: "UFC",
    state: "SCAFFOLD_ONLY",
    reason:
      "Formally downgraded 2026-07-23: the moneyline is a de-vigged market price with a capped nudge (no independent signal), and zero bouts are cleanly backtestable because there is no point-in-time pregame odds capture.",
  },
  {
    key: "soccer",
    label: "Soccer",
    state: "SCAFFOLD_ONLY",
    reason:
      "The generic soccer key is the World Cup market-implied path: genuine and reusable, but its tournament is over and readiness fails closed on 'no soccer stats/xG/minutes provider connected', so every player market is unsettleable. Club leagues that publish carry their OWN keys (epl, ligue-1).",
  },
  {
    key: "nhl",
    label: "NHL",
    state: "SCAFFOLD_ONLY",
    reason:
      "No ingest script exists anywhere in the repo; the handful of schedule files came from a single manual run and nothing can refresh them, let alone project.",
  },
  {
    key: "ipl",
    label: "IPL",
    state: "SCAFFOLD_ONLY",
    reason:
      "Schedule-only. There is no per-batsman/per-bowler stats source, and the projection pipeline was deliberately removed from every user-facing surface.",
  },
  {
    key: "wnba",
    label: "WNBA",
    state: "SCAFFOLD_ONLY",
    reason:
      "Schedule snapshot only, hand-maintained in event-schedules.ts with no refresh job. No projections, no odds, no simulation path.",
  },
  {
    key: "mls",
    label: "MLS",
    state: "SCAFFOLD_ONLY",
    reason:
      "Schedule snapshot only. It shares the soccer market-implied path, which is itself blocked on a stats provider, so nothing predictive can publish.",
  },
  {
    key: "epl",
    label: "EPL",
    state: "EXPERIMENTAL_PUBLIC",
    reason:
      "Fixtures, exact-Poisson match forecasts, a validated scorer head and priced paper cards all publish under an experimental banner, and the lab ledger grades them; the model has not beaten the market out of sample, so nothing enters official prediction products.",
  },
  {
    /* Soccer V2 · C-3: Ligue 1 had published since P257 but had no row here, so every capability lookup
       answered "unknown → DISABLED" for a live page. */
    key: "ligue-1",
    label: "Ligue 1",
    state: "EXPERIMENTAL_PUBLIC",
    reason:
      "Model-only match forecasts publish at /soccer/ligue-1 after the preregistered league backtest accepted the Premier League model unchanged (draw calibration 0.0271 against a 0.030 bar); forward grading has too few matches to assess, there are no odds and no player markets, so nothing enters official prediction products.",
  },
  {
    key: "nfl",
    label: "NFL",
    state: "EXPERIMENTAL_PUBLIC",
    reason:
      "Schedule capture, weekly forecasts-of-record from the evaluated regular-season identity, weekly player boards and graded history all exist; every game is classified PUBLIC_EXPERIMENTAL, and only VALIDATED_PICK may become a product leg — so nothing enters official prediction products yet (see nfl/product-eligibility.json for the live gate).",
  },
];

const BY_KEY = new Map(SPORT_CAPABILITIES.map((c) => [c.key, c]));

/** The fail-closed default. An unrecognised sport is never assumed capable. */
export const UNKNOWN_SPORT: SportCapability = {
  key: "unknown",
  label: "Unknown",
  state: "DISABLED",
  reason: "Not in the capability registry — fails closed rather than defaulting to capable.",
};

/** Look up a sport's capability. Case/whitespace insensitive; unknown → DISABLED. */
export function capabilityOf(sport: string | null | undefined): SportCapability {
  const key = String(sport ?? "").trim().toLowerCase();
  return BY_KEY.get(key) ?? UNKNOWN_SPORT;
}

export function capabilityState(sport: string | null | undefined): CapabilityState {
  return capabilityOf(sport).state;
}

// ── TWO CAPABILITY LEVELS (founder policy, 2026-10-23 09:16 ET) ─────────────────────────────────────────────────
//
// LEVEL B — PRICED SPORTSBOOK RECOMMENDATIONS (real odds, EV, book comparison, payouts, handoff). Decided by the
//   `state` above and `canEnterPredictionProducts` — UNCHANGED. Nothing below loosens it.
// LEVEL A — MODEL-SUGGESTED PICKS AND PARLAYS. Non-transactional: no price, no EV, no payout, no handoff. A sport is
//   OPEN only where an OFFICIAL, FROZEN, PRE-EVENT forecast exists and its owner is named. This is a SEPARATE axis on
//   purpose: it neither reads nor repurposes `state` (HISTORICAL_ONLY etc.) or any promotion gate.
//
// `probabilityPublished` records whether the official forecast itself publishes an outcome probability. Only then may
// a Level A leg enter a tiered card (the tier is read from that probability; see lib/products/level-a). NBA's official
// composition publishes the Elo SIDE but withholds the probability (founder N2), so NBA legs are untiered.
export type SuggestionLevelState = "OPEN" | "CLOSED";
export interface ModelSuggestionCapability {
  key: string;
  state: SuggestionLevelState;
  /** The official forecast owner Level A legs are read from (verbatim, never recomputed). */
  forecastOwner: string | null;
  /** Markets the owner's frozen forecast defines a selection for. */
  markets: ReadonlyArray<string>;
  /** Does the official forecast publish an outcome probability for those markets? */
  probabilityPublished: boolean;
  reason: string;
}

export const LEVEL_A_DECISION_REF = "founder Level A / Level B policy, 2026-10-23 09:16 ET";
/** The founder's text, verbatim. */
export const LEVEL_A_DECISION_DOC = "docs/decisions/2026-10-23-LEVEL-A-MODEL-SUGGESTIONS.md";

export const MODEL_SUGGESTION_CAPABILITIES: ReadonlyArray<ModelSuggestionCapability> = Object.freeze([
  { key: "mlb", state: "OPEN", forecastOwner: "mlb-prediction official snapshot (moneyline simulation probability)", markets: ["winner"], probabilityPublished: true,
    reason: "An official prediction snapshot is frozen before first pitch and publishes each game's predicted winner and its simulation probability." },
  { key: "nba", state: "OPEN", forecastOwner: "nba-official-composition@1 (Elo favoured side + v0.1 player projections)", markets: ["winner"], probabilityPublished: false,
    reason: "The official NBA forecast is frozen before tip: the Elo favoured side and the v0.1 player projections. Its win probability is withheld (no graded regular-season record), so NBA suggestions show the side without a chance and are never tiered." },
  { key: "epl", state: "OPEN", forecastOwner: "epl-model-v2-elo-poisson public forecast", markets: ["1x2"], probabilityPublished: true,
    reason: "The public Premier League forecast publishes home/draw/away probabilities for every current pre-event match." },
  { key: "ligue-1", state: "OPEN", forecastOwner: "soccer-league-forecasts (Ligue 1, model-only)", markets: ["1x2"], probabilityPublished: true,
    reason: "The public Ligue 1 forecast publishes model-only home/draw/away probabilities for each fixture, stamped before kickoff." },
  { key: "nfl", state: "CLOSED", forecastOwner: null, markets: [], probabilityPublished: false,
    reason: "No reader for the NFL official game forecast has been reviewed for Level A yet; NFL stays out until one is." },
  { key: "ufc", state: "CLOSED", forecastOwner: null, markets: [], probabilityPublished: false,
    reason: "UFC has no independent official forecast: its moneyline is a de-vigged market price with a capped nudge." },
] as ModelSuggestionCapability[]);

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

/**
 * May we show forward-looking projections/simulations for this sport? FULL_MODEL, plus
 * EXPERIMENTAL_PUBLIC — whose surfaces carry the experimental banner and whose outputs are the
 * genuinely published forecasts, never product picks.
 */
export function canShowLiveProjections(sport: string | null | undefined): boolean {
  const s = capabilityState(sport);
  return s === "FULL_MODEL" || s === "EXPERIMENTAL_PUBLIC";
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
  if (s === "FULL_MODEL" || s === "EXPERIMENTAL_PUBLIC") return "live";
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
  EXPERIMENTAL_PUBLIC: "Experimental simulations",
  HISTORICAL_ONLY: "Historical archive",
  RESEARCH_ONLY: "Research only",
  SCAFFOLD_ONLY: "Schedule only",
  DISABLED: "Not covered",
};

// ── LEVEL A LOOKUPS (derived from the Level A table above, never from a sport key) ──────────────────────────
const SUGGESTION_BY_KEY = new Map(MODEL_SUGGESTION_CAPABILITIES.map((c) => [c.key, c]));

/** Level A capability for a sport. Unknown or unlisted sports are CLOSED (fail closed). */
export function modelSuggestionOf(sport: string | null | undefined): ModelSuggestionCapability {
  const key = String(sport ?? "").trim().toLowerCase();
  return SUGGESTION_BY_KEY.get(key) ?? { key, state: "CLOSED", forecastOwner: null, markets: [], probabilityPublished: false, reason: "Not listed for model suggestions — fails closed." };
}

/** May this sport appear in Level A (non-transactional) model suggestions? Separate from canEnterPredictionProducts. */
export function canEnterModelSuggestions(sport: string | null | undefined): boolean {
  return modelSuggestionOf(sport).state === "OPEN";
}
