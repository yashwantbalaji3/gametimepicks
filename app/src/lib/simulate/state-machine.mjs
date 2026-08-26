/**
 * SIMULATION STATE MACHINE (P209 · Release B) — the one truth owner for the generation moment.
 *
 * The application is deterministic and static-exported: every "simulation" a visitor opens is a
 * committed artifact. The machine therefore models the REAL operation — resolve the event, read
 * committed inputs, validate gates, prepare the verified report — and its copy says so. It never
 * claims to run new trials in the browser, never invents progress units, and never lets a
 * schedule/baseline/blocked event emerge as SIMULATION_READY: the terminal phase is derived from
 * the event's OWN readiness state (the day-view matrix), fail-closed.
 *
 * Pure module (no react, no fs) so servers, clients and tests share the exact rules.
 */

/** Canonical phases, in the only order they may occur. */
export const PHASES = Object.freeze([
  "CHECKING_EVENT",
  "LOADING_INPUTS",
  "VALIDATING",
  "PREPARING",
  "SUMMARIZING",
  "COMPLETE",
  "REFUSED",
  "FAILED",
]);

/** Allowed transitions. Anything absent is refused — including CHECKING_EVENT → COMPLETE. */
export const TRANSITIONS = Object.freeze({
  CHECKING_EVENT: ["LOADING_INPUTS", "REFUSED", "FAILED"],
  LOADING_INPUTS: ["VALIDATING", "REFUSED", "FAILED"],
  VALIDATING: ["PREPARING", "REFUSED", "FAILED"],
  PREPARING: ["SUMMARIZING", "FAILED"],
  SUMMARIZING: ["COMPLETE", "FAILED"],
  COMPLETE: [],
  REFUSED: [],
  FAILED: [],
});

/** Honest per-phase copy — precomputed vocabulary, never "running new trials". */
export const PHASE_COPY = Object.freeze({
  CHECKING_EVENT: "Finding the event and its product date…",
  LOADING_INPUTS: "Loading the committed schedule, model and market inputs…",
  VALIDATING: "Checking freshness, identity and eligibility gates…",
  PREPARING: "Preparing the verified simulation report…",
  SUMMARIZING: "Laying out distributions, picks and definitions…",
  COMPLETE: "Report ready.",
  REFUSED: "This event has no report to show — the reason is stated below.",
  FAILED: "Something went wrong reading this report.",
});

/**
 * Fresh context for one event. Everything unknown starts null and must be earned.
 * @param {{ sport: string, eventId: string, productDate?: string | null, readiness: string, href: string }} init
 */
export function createContext({ sport, eventId, productDate, readiness, href }) {
  if (!sport || !eventId || !readiness || !href) {
    throw new Error("state-machine: sport, eventId, readiness and href are required");
  }
  return Object.freeze({
    phase: "CHECKING_EVENT",
    sport,
    eventId,
    productDate: productDate ?? null,
    readiness,
    href,
    artifactId: null,
    reason: null,
    /** Progress is indeterminate unless real completed units exist — we never invent them. */
    progress: { kind: "indeterminate" },
  });
}

/**
 * Advance the machine. Illegal transitions THROW (a programming error, caught by tests);
 * legal-but-unearned terminals fail closed:
 *   · COMPLETE requires an artifactId (an artifact identity, not a hope);
 *   · REFUSED and FAILED require a stated reason.
 */
export function advance(ctx, next, patch = {}) {
  const allowed = TRANSITIONS[ctx.phase] ?? [];
  if (!allowed.includes(next)) {
    throw new Error(`state-machine: illegal transition ${ctx.phase} → ${next}`);
  }
  const merged = { ...ctx, ...patch, phase: next };
  if (next === "COMPLETE" && !merged.artifactId) {
    return Object.freeze({ ...merged, phase: "FAILED", reason: "Report identity missing — refusing to present an artifact that has no id." });
  }
  if ((next === "REFUSED" || next === "FAILED") && !merged.reason) {
    return Object.freeze({ ...merged, phase: "FAILED", reason: "Stopped without a stated reason — refusing to end silently." });
  }
  return Object.freeze(merged);
}

/**
 * The phase SCRIPT for one readiness state — which real steps the stage narrates, and where they
 * honestly end. Ready states run to COMPLETE; every non-ready state ends REFUSED with the event's
 * own reason. Unknown readiness fails closed to a refusal.
 * @param {string} readiness
 * @param {string | null} [reason]
 * @returns {{ steps: string[], terminal: "COMPLETE" | "REFUSED", reason: string | null }}
 */
export function scriptForReadiness(readiness, reason = null) {
  switch (readiness) {
    case "SIMULATION_READY":
    case "MODEL_ONLY_NO_MARKET":
    case "BASELINE_ONLY":
      return { steps: ["CHECKING_EVENT", "LOADING_INPUTS", "VALIDATING", "PREPARING", "SUMMARIZING"], terminal: "COMPLETE", reason: null };
    case "SETTLED":
      // A settled report still loads, validates and lays out — the same real steps, same order.
      return { steps: ["CHECKING_EVENT", "LOADING_INPUTS", "VALIDATING", "PREPARING", "SUMMARIZING"], terminal: "COMPLETE", reason: null };
    case "ARTIFACT_READY":
      return { steps: ["CHECKING_EVENT", "LOADING_INPUTS", "VALIDATING"], terminal: "REFUSED", reason: reason ?? "The artifact exists, but an event-specific gate is not satisfied." };
    case "NO_PLAY":
      return { steps: ["CHECKING_EVENT", "LOADING_INPUTS", "VALIDATING"], terminal: "REFUSED", reason: reason ?? "The model assessed this event and chose not to play it." };
    case "SCHEDULE_ONLY":
      return { steps: ["CHECKING_EVENT", "LOADING_INPUTS"], terminal: "REFUSED", reason: reason ?? "This event has a schedule entry and no model artifact." };
    case "SOURCE_STALE":
      return { steps: ["CHECKING_EVENT", "LOADING_INPUTS"], terminal: "REFUSED", reason: reason ?? "The source behind this event is stale — see System Status." };
    default:
      return { steps: ["CHECKING_EVENT"], terminal: "REFUSED", reason: reason ?? `Unknown readiness "${readiness}" — failing closed.` };
  }
}

/** Milliseconds each narrated phase holds on screen. Short, deterministic, interruptible. */
export const PHASE_DURATION_MS = 620;
