/**
 * Command-center information architecture — the ONE documented IA (Program 166 · Release A).
 *
 * Eleven operator groups over the single /launch page (anchors, not routes — the route inventory
 * and prune contract stay untouched). Every group maps to sections whose data comes from exactly
 * one authority; the guard proves every anchor exists on the page and no section is claimed by
 * two groups. The nav renders FROM this contract, so the menu and the truth cannot drift.
 *
 * UI-STATE CONTRACT (rendered convention, asserted where cheap): ACTIVE (real current data),
 * EMPTY ("nothing here" with the reason in words — a no-task queue is not an outage), STALE
 * (dated evidence says its age), UNKNOWN (unreadable source renders as unknown, never green),
 * INCIDENT (danger tone + owner), REALITY_GATED (time-gated, never urgent-styled).
 */

export const LAUNCH_IA_VERSION = 2;

/**
 * v2 (Program 167 · Release B): task-first order — what needs me now, then league state, then
 * planning, then evidence drill-downs — plus the Onboarding group (sanitized operator guide).
 * Groups, anchors and authorities are otherwise the Program 166 contract, unchanged.
 */
export const IA_SECTIONS = Object.freeze([
  { group: "Overview", anchors: ["health", "exec"], authority: "evidence-ledger + launch gates" },
  { group: "Today", anchors: ["today-queue", "today"], authority: "today-board over work-board + watches (derived) + MLB daily board" },
  { group: "Sports", anchors: ["sports", "gates", "closure"], authority: "sport-assessments via completion-matrix + closure packets (P196 control plane)" },
  { group: "Founder", anchors: ["founder-actions", "queues"], authority: "shared-blockers registry" },
  { group: "Work Board", anchors: ["board"], authority: "work-board (derived, no ticket store)" },
  { group: "Sprints", anchors: ["sprints"], authority: "roadmap horizons + build clock" },
  { group: "Roadmap", anchors: ["roadmap"], authority: "completion-matrix ROADMAP_30D" },
  { group: "Departments", anchors: ["depts", "matrix"], authority: "completion-matrix buckets" },
  { group: "Incidents & Watches", anchors: ["watches", "ledger"], authority: "watches.mjs + evidence-ledger" },
  { group: "Evidence", anchors: ["product-truth", "routes-assurance", "uiux", "browser-assurance", "registry", "history", "alpha"], authority: "committed audit artifacts, rendered verbatim" },
  { group: "Runbooks & Transition", anchors: ["runbooks", "transition"], authority: "docs/ runbooks + transition checklist (PLANNED only)" },
  { group: "Onboarding", anchors: ["onboarding"], authority: "sanitized operator guide (static, versioned, zero secrets)" },
]);
