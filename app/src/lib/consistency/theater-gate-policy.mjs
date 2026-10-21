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

/**
 * THE ENGINE THE PUBLIC NBA THEATER REPLAYS — founder decision 2026-10-21, docs/launch/approvals/
 * NBA_THEATER_PUBLIC_2026-10-21.md ("ALLOW nba-possession-sim-v0 as the NBA Theater replay engine … not a promotion").
 * Role C: the labelled research replay; the official forecast (role A) and the v1 Challenger (role B, evaluation only)
 * are unchanged. Under LABELLED_SUPPORTING_RUNS the gate (audit.mjs theaterActivationGate) opens an NBA game only when
 * THIS engine's stored runs for it are valid, checked against the game's current official snapshot. Changing it is a
 * founder decision recorded in the same reviewed PR. The label is labels.mjs ROLE_C_LABEL (a test pins the two equal).
 */
export const NBA_THEATER_REPLAY_ENGINE = Object.freeze({
  id: "nba-possession-sim-v0",
  role: "RESEARCH_POSSESSION_SIMULATION",
  label: "Research Possession Simulation — Unvalidated",
  decision: "docs/launch/approvals/NBA_THEATER_PUBLIC_2026-10-21.md",
});
