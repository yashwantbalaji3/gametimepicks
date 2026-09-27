/**
 * THE THREE NFL ROLE VOCABULARIES — registered, because they were already leaking into each other.
 *
 * A player's role is described by three DIFFERENT typed vocabularies in this repo, each owned by a
 * different artifact. That is defensible: they answer different questions from different sources. What
 * is not defensible is a consumer testing a name from one vocabulary against a value from another —
 * which silently never matches, and reads exactly like a working check.
 *
 * ── THE THREE ──────────────────────────────────────────────────────────────────────────────────
 *
 *   PARTICIPATION   lib/sports/nfl/participation-states.mjs      what the PLAYER BOARD publishes
 *                   CONFIRMED_OUT · EXPECTED_STARTER · EXPECTED_ROTATION · LIMITED ·
 *                   AVAILABLE_ROLE_UNCERTAIN · DEPTH_ONLY · UNKNOWN · SOURCE_STALE · STARTED_LOCKED
 *
 *   ROLE_EVIDENCE   data/internal/nfl/role-evidence/<date>.json  what the EVIDENCE BUILDER concluded
 *                   ACTIVE_EXPECTED · ACTIVE_UNCERTAIN · QUESTIONABLE · OUT · NOT_ON_ROSTER ·
 *                   SOURCE_STALE · NOT_YET_PUBLISHED · UNSUPPORTED
 *
 *   POOL_COUNTS     data/internal/nfl/current/<date>/*.json      participationCounts on a snapshot
 *                   ACTIVE_PROJECTED · QUESTIONABLE · INACTIVE
 *
 * ── THE LEAKS THIS EXISTS TO CATCH ─────────────────────────────────────────────────────────────
 *
 * Both were found in `build-end-zone-vault.mjs`, and NEITHER is currently harmful — which is exactly
 * why they would have survived indefinitely:
 *
 *   · `AVAILABLE_STATES` contains ACTIVE_PROJECTED, a POOL_COUNTS name, and is tested against a
 *     ROLE_EVIDENCE `role.state`. It can never match. The set still works only because
 *     ACTIVE_UNCERTAIN is also in it and IS emitted.
 *   · `roleEvidence` tests `counts.ACTIVE_CONFIRMED`, a name in NO vocabulary at all — 0 occurrences
 *     across 105 committed snapshots. That half of the `||` is dead. It still works only because
 *     `counts.ACTIVE_PROJECTED > 0` is the real check.
 *
 * ⚠ I FIRST SUSPECTED `roleEvidence` WAS ALWAYS FALSE and it is not: ACTIVE_PROJECTED is a genuine
 * POOL_COUNTS key with 210 occurrences. Checking before claiming is the reason this module describes
 * two dead names rather than a broken product.
 */

export const ROLE_VOCABULARY = Object.freeze({
  PARTICIPATION: Object.freeze({
    owner: "lib/sports/nfl/participation-states.mjs",
    subject: "what the player board publishes for a player",
    states: Object.freeze([
      "CONFIRMED_OUT", "EXPECTED_STARTER", "EXPECTED_ROTATION", "LIMITED",
      "AVAILABLE_ROLE_UNCERTAIN", "DEPTH_ONLY", "UNKNOWN", "SOURCE_STALE", "STARTED_LOCKED",
    ]),
  }),
  ROLE_EVIDENCE: Object.freeze({
    owner: "data/internal/nfl/role-evidence/<date>.json",
    subject: "what the evidence builder concluded from authorized sources",
    states: Object.freeze([
      "ACTIVE_EXPECTED", "ACTIVE_UNCERTAIN", "QUESTIONABLE", "OUT",
      "NOT_ON_ROSTER", "SOURCE_STALE", "NOT_YET_PUBLISHED", "UNSUPPORTED",
    ]),
  }),
  POOL_COUNTS: Object.freeze({
    owner: "data/internal/nfl/current/<date>/*.json · research.perTeam[*].participationCounts",
    subject: "a snapshot's per-team participation tally",
    states: Object.freeze(["ACTIVE_PROJECTED", "QUESTIONABLE", "INACTIVE"]),
  }),
});

/** Names that appear in more than one vocabulary. Shared names are the likeliest place to cross wires. */
export function sharedStateNames() {
  const count = new Map();
  for (const v of Object.values(ROLE_VOCABULARY)) {
    for (const s of v.states) count.set(s, (count.get(s) ?? 0) + 1);
  }
  return [...count].filter(([, n]) => n > 1).map(([s]) => s).sort();
}

/** Which vocabulary a state name belongs to. Several, for a shared name; none, for an invented one. */
export function vocabulariesFor(state) {
  return Object.entries(ROLE_VOCABULARY).filter(([, v]) => v.states.includes(state)).map(([k]) => k);
}

/**
 * Does a set of names a consumer tests belong to the vocabulary it is reading?
 *
 * @returns names that do NOT belong — a cross-vocabulary leak or an invented state.
 */
export function foreignStates(names, vocabularyKey) {
  const v = ROLE_VOCABULARY[vocabularyKey];
  if (!v) throw new Error(`foreignStates: ${vocabularyKey} is not a registered role vocabulary`);
  return [...new Set(names)].filter((n) => !v.states.includes(n)).sort();
}

/**
 * ⚠ ROLE CERTAINTY IS NOT REACHABLE TODAY, AND THE REASON IS A RIGHTS GATE, NOT A CONSUMER GAP.
 *
 * `ACTIVE_EXPECTED` is the only ROLE_EVIDENCE state that establishes a confirmed role, and the
 * evidence artifact's own `sources.gameDayActives` reads:
 *
 *     id: null · status: "UNSUPPORTED"
 *     cannotEstablish: "everything — no authorized source carries the official inactive list"
 *     nextObservationWindow: "~90 minutes before kickoff, if a rights-cleared source is ever added"
 *
 * So on 2026-09-27 all 15 events carry `familyVerdict: ROLE_UNCERTAIN` with the reason "no
 * event-bound active evidence is available from an authorized source". Two facts follow, and both
 * matter more than any code change:
 *
 *   1. no engineering can upgrade role here — the data does not exist to read;
 *   2. even with a rights-cleared source, actives publish ~90 MINUTES PRE-KICKOFF, which is AFTER
 *      the board freeze. A product that requires a confirmed role therefore cannot select at freeze
 *      time under this gate, whatever source is added later.
 *
 * That second point is an architecture question for the founder — select later, or gate differently —
 * not something to resolve by loosening the gate.
 */
export const ROLE_CERTAINTY_BLOCKER = Object.freeze({
  blockedState: "ACTIVE_EXPECTED",
  requires: "official game-day actives / inactives",
  sourceStatus: "UNSUPPORTED",
  reason: "no authorized source carries the official inactive list",
  publishesAt: "~90 minutes pre-kickoff",
  publishesAfterBoardFreeze: true,
  resolution: "FOUNDER_GATE_DATA_RIGHTS",
});
