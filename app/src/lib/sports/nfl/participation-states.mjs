/**
 * The closed participation vocabulary (Program 182 · Release A).
 *
 * Lives in its own pure module because a script that validates `--now` at import time cannot be
 * imported by a test — and a vocabulary that only exists inside an executable is a vocabulary
 * nothing can check.
 */

/** Every state a player's participation may take. Anything else is a defect, not a new case. */
export const PARTICIPATION_STATES = Object.freeze([
  "CONFIRMED_OUT", "EXPECTED_STARTER", "EXPECTED_ROTATION", "LIMITED",
  "AVAILABLE_ROLE_UNCERTAIN", "DEPTH_ONLY", "UNKNOWN", "SOURCE_STALE", "STARTED_LOCKED",
]);

/**
 * States that require an authorized actives / inactives / depth-chart / coach-statement source.
 * Named explicitly so their absence is a DOCUMENTED refusal rather than an accident of which
 * branch happened to be written.
 */
export const REQUIRES_AUTHORIZED_ACTIVES = Object.freeze([
  "CONFIRMED_OUT", "EXPECTED_STARTER", "EXPECTED_ROTATION", "LIMITED",
]);
