/**
 * NBA THEATER GATE POLICY — the one constant both the consistency gate (audit.mjs theaterActivationGate) and the
 * Theater's run labels (simulation-theater/representative-labels.mjs) read. Pure, dependency-free (client-safe).
 *
 *   ANCHORED                    the replayed v1 simulation must agree with the official forecast (nbaSimAnchorCheck)
 *                               and its closest run is shown as the "Official representative simulation".
 *   LABELLED_SUPPORTING_RUNS    founder decision 2026-10-20 ("approved in principle"): the official panel shows the
 *                               canonical snapshot only; replayed runs are individual runs of the supporting simulation
 *                               engine (never "official"); nothing a run shows changes an official value. No anchor.
 *
 * IN FORCE is a reviewed-PR constant. It governs the GATE and the LABELS only — the public Theater flag
 * (simulation-theater/nba/feature-manifest.mjs NBA_THEATER_PUBLIC_ENABLED) is separate and stays false until the
 * preregistration §13 Theater activation (amendment B) and the release-owner verification are complete.
 */
export const NBA_THEATER_GATE_POLICY = Object.freeze({ ANCHORED: "ANCHORED", LABELLED_SUPPORTING_RUNS: "LABELLED_SUPPORTING_RUNS" });
export const NBA_THEATER_GATE_POLICY_IN_FORCE = NBA_THEATER_GATE_POLICY.LABELLED_SUPPORTING_RUNS;
