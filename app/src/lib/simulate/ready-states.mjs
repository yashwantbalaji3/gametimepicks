/**
 * WHICH EVENT STATES ARE READY — Program 234 · Release C.
 *
 * Split out of `day-view.ts` for one reason: day-view reads the filesystem, so importing a constant
 * from it drags `node:fs` into a client bundle and fails the export build outright. A list of five
 * strings does not need a filesystem, and a client component that has to know whether an event is
 * ready should not have to import a server module to find out.
 *
 * `day-view.ts` re-exports this, so it remains the name everything else already imports and there is
 * still exactly one definition.
 */

/** Ready = the event's own state says a model artifact is presentable (charter's readiness contract). */
export const READY_STATES = Object.freeze([
  "SIMULATION_READY",
  "MODEL_ONLY_NO_MARKET",
  "BASELINE_ONLY",
]);
