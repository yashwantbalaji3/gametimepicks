/**
 * NFL REGULAR-SEASON INPUT MATRIX (Program 197 · Release D).
 *
 * The regular season starts in two weeks and the question "can the lane run it?" must have one
 * derived answer per input, not a vibe. This module DECLARES the input contract — source, rights,
 * freshness window, cutoff rule, refusal behavior — and derives each input's live state from the
 * artifacts on disk. It fabricates nothing: an input with no licensed source is UNSUPPORTED or
 * BLOCKED_EXTERNAL by name, and a missing artifact is MISSING, never quietly healthy. The
 * assembly downstream (shadow-run) already emits READY_EXCEPT_<CAUSE>; this is the table those
 * causes come from.
 *
 * Rights lines repeat the registered-source terms (source-registry.mjs); nothing here widens a
 * license. The actives/depth-chart line encodes the standing refusal participation.mjs already
 * proves: ACTIVE_CONFIRMED is unreachable without an official actives source, and no such source
 * is licensed — that is a FOUNDER rights decision, not an engineering gap.
 */

export const RS_INPUT_STATES = Object.freeze(["AVAILABLE", "DERIVED", "STALE", "MISSING", "UNSUPPORTED", "BLOCKED_EXTERNAL"]);

/** The declared contract. Order is presentation order; ids are stable. */
export const REGULAR_SEASON_INPUTS = Object.freeze([
  { id: "schedule", source: "espn_scoreboard capture (sport-schedules daily)", rights: "public JSON, attribution", freshnessHours: 36, cutoff: "capture precedes kickoff", refusal: "stale schedule refuses forecast generation for uncovered windows" },
  { id: "teamStrength", source: "cutoff-versioned Elo strength state (committed corpus)", rights: "derived from licensed finals corpus", freshnessHours: null, cutoff: "strictly pre-kickoff by construction (P166-E)", refusal: "a game outside the corpus window runs BASELINE_ONLY" },
  { id: "injuries", source: "espn injuries capture (scripts/sports/capture-injuries, P162-H)", rights: "public JSON, attribution", freshnessHours: 48, cutoff: "capturedAt < kickoff", refusal: "absent/stale feed types players UNKNOWN — absence never implies health" },
  { id: "rosters", source: "32-team roster capture → durable-id registry (P169-A)", rights: "public JSON, attribution", freshnessHours: 24 * 8, cutoff: "effective-dated membership", refusal: "an unlisted player quarantines rather than minting identity" },
  { id: "participationRoles", source: "regular-season role corpus + participation.mjs states", rights: "derived from licensed play-by-play summaries", freshnessHours: null, cutoff: "corpus is season-to-date, strictly historical", refusal: "ROLE_UNCERTAIN caps confidence; ACTIVE_PROJECTED is the ceiling without actives" },
  { id: "activesInactives", source: "NONE — no authorized official-actives source", rights: "unresolved; scraping refused", freshnessHours: null, cutoff: "n/a", refusal: "ACTIVE_CONFIRMED states are unreachable by design (participation.mjs names this)" },
  { id: "depthCharts", source: "NONE — no licensed depth-chart source", rights: "unresolved", freshnessHours: null, cutoff: "n/a", refusal: "no player may be called a starter (participation-artifact guard)" },
  { id: "qbStatus", source: "derived from the injuries feed only", rights: "as injuries", freshnessHours: 48, cutoff: "as injuries", refusal: "DERIVED, stated as such — an injury feed is not a start/sit announcement" },
  { id: "weather", source: "NONE — not ingested", rights: "n/a", freshnessHours: null, cutoff: "n/a", refusal: "UNSUPPORTED; totals carry no weather adjustment and say so" },
  { id: "prices", source: "authorized Odds receipt (P171, bulk h2h/spreads/totals)", rights: "licensed, credit-guarded", freshnessHours: 30, cutoff: "capture precedes kickoff; lock at freeze", refusal: "no price → MODEL_ONLY_NO_MARKET, never zero-edge" },
]);

const hoursBetween = (aIso, bIso) => {
  const a = Date.parse(aIso ?? ""), b = Date.parse(bIso ?? "");
  return Number.isFinite(a) && Number.isFinite(b) ? (b - a) / 3_600_000 : null;
};

/**
 * Derive the live state of every declared input from injected artifact stamps.
 * @param {object} args
 * @param {Record<string, {stamp?: string|null, present?: boolean}>} args.artifacts keyed by input id where applicable
 * @param {string} args.nowIso
 */
export function deriveInputMatrix({ artifacts = {}, nowIso }) {
  return REGULAR_SEASON_INPUTS.map((decl) => {
    const art = artifacts[decl.id] ?? null;
    let state;
    let detail;
    if (decl.source.startsWith("NONE")) {
      state = decl.id === "activesInactives" || decl.id === "depthCharts" ? "BLOCKED_EXTERNAL" : "UNSUPPORTED";
      detail = decl.refusal;
    } else if (decl.id === "teamStrength" || decl.id === "participationRoles") {
      state = art?.present === false ? "MISSING" : "AVAILABLE";
      detail = decl.cutoff;
    } else if (decl.id === "qbStatus") {
      const age = hoursBetween(artifacts.injuries?.stamp, nowIso);
      state = artifacts.injuries?.present === false || age == null ? "MISSING" : age > (decl.freshnessHours ?? Infinity) ? "STALE" : "DERIVED";
      detail = decl.refusal;
    } else if (!art || art.present === false || !art.stamp) {
      state = "MISSING";
      detail = `no ${decl.id} artifact on disk`;
    } else {
      const age = hoursBetween(art.stamp, nowIso);
      state = decl.freshnessHours != null && age != null && age > decl.freshnessHours ? "STALE" : "AVAILABLE";
      detail = `${decl.id} as of ${art.stamp}`;
    }
    return { id: decl.id, state, detail, source: decl.source, rights: decl.rights, refusal: decl.refusal };
  });
}

/**
 * The one-line readiness verdict the lane status shows: which causes stand between today and a
 * fully-confident regular-season slate. BLOCKED_EXTERNAL and UNSUPPORTED are DESIGN facts, not
 * blockers to running — the engine runs with typed caps (ACTIVE_PROJECTED ceiling, no weather
 * term); MISSING/STALE inputs are operational and become tickets.
 */
export function readinessVerdict(matrix) {
  const operational = matrix.filter((m) => m.state === "MISSING" || m.state === "STALE").map((m) => `${m.id}:${m.state}`);
  const design = matrix.filter((m) => m.state === "BLOCKED_EXTERNAL" || m.state === "UNSUPPORTED").map((m) => m.id);
  return {
    state: operational.length === 0 ? "READY_WITH_DESIGN_CAPS" : "OPERATIONAL_GAPS",
    operationalGaps: operational,
    designCaps: design,
  };
}
