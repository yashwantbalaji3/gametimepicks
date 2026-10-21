/**
 * THE ENGINE THE PUBLIC NBA THEATER REPLAYS — founder decision 2026-10-21, docs/launch/approvals/
 * NBA_THEATER_PUBLIC_2026-10-21.md ("ALLOW nba-possession-sim-v0 as the NBA Theater replay engine … not a promotion").
 * Role C: the labelled research replay; the official forecast (role A) and the v1 Challenger (role B, evaluation only)
 * are unchanged. Under LABELLED_SUPPORTING_RUNS the gate (audit.mjs theaterActivationGate) opens an NBA game only when
 * THIS engine's stored runs for it are valid, checked against the game's current official snapshot. Changing it is a
 * founder decision recorded in the same reviewed PR. The label is labels.mjs ROLE_C_LABEL (a test pins the two equal).
 *
 * SERVER-ONLY (#1173 CI run 39624904702): theater-gate-policy.mjs is reached by client components through
 * representative-labels.mjs, and a frozen object there shipped this id in a shared client chunk of the flag-OFF
 * export. Import this module only from server / build-time code (audit.mjs, the possession loaders, scripts, tests);
 * client-graph-engine-id.test.mjs walks every "use client" import graph and fails if one reaches it.
 */
export const NBA_THEATER_REPLAY_ENGINE = Object.freeze({
  id: "nba-possession-sim-v0",
  role: "RESEARCH_POSSESSION_SIMULATION",
  label: "Research Possession Simulation — Unvalidated",
  decision: "docs/launch/approvals/NBA_THEATER_PUBLIC_2026-10-21.md",
});
