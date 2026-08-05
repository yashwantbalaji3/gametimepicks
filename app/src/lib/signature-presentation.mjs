/**
 * Signature-state PRESENTATION adapter (Program 136).
 *
 * `signature-state.mjs` decides WHICH state is true. This module decides how that state is shown,
 * and nothing else in the app may re-derive availability: components call `presentSignatureState`
 * and render what it returns.
 *
 * WHY THIS EXISTS — a real, measured defect. `/moonshot` mapped its lane status to a surface
 * status with an inline ternary:
 *
 *     lane?.status === "stopped" ? "settled" : lane?.status === "active" ? "live" : "data_pending"
 *
 * That ternary reads the lane's own `status` field and nothing else — not the date. On 2026-08-05
 * the committed lane artifact was `moonshot-lane-mlb-2026-07-21` with `status: "active"`, so the
 * page rendered **"Slate in progress"** for a lane generated fifteen days earlier. Stale content
 * presented as live is the single most damaging thing a research product can do, and no amount of
 * correct copy elsewhere on the page undoes it.
 *
 * Freshness therefore OUTRANKS the artifact's self-declared status here, exactly as it does in the
 * derivation: a product whose inputs are not today's cannot be ACTIVE, whatever its own file says.
 */
import { deriveSignatureState, SIGNATURE_STATES } from "./signature-state.mjs";

/** Presentation for each derived state. Tone maps to the existing PicksSurfaceStatus vocabulary. */
const PRESENTATION = {
  [SIGNATURE_STATES.ACTIVE]: {
    surfaceStatus: "live",
    label: "Live for today",
    explanation: "Today's card is published and settlement-supported.",
    tone: "positive",
  },
  [SIGNATURE_STATES.AWAITING_APPROVAL]: {
    surfaceStatus: "review",
    label: "Awaiting approval",
    explanation: "A qualified card is waiting on approval before it appears.",
    tone: "warn",
  },
  [SIGNATURE_STATES.AWAITING_QUALIFIED_CARD]: {
    surfaceStatus: "data_pending",
    label: "Awaiting a qualified card",
    explanation: "Nothing cleared the bar today. Nothing is shown rather than lowering it.",
    tone: "muted",
  },
  [SIGNATURE_STATES.AWAITING_MARKETS]: {
    surfaceStatus: "pregame",
    label: "Awaiting markets",
    explanation: "Waiting on the sportsbook to post markets for today's games.",
    tone: "info",
  },
  [SIGNATURE_STATES.STALE]: {
    surfaceStatus: "data_pending",
    label: "Not published today",
    explanation: "The most recent published card is from an earlier slate — shown as history, not as today's play.",
    tone: "muted",
  },
  [SIGNATURE_STATES.ARCHIVED]: {
    surfaceStatus: "settled",
    label: "Archived",
    explanation: "Kept as a record. This product is no longer updated.",
    tone: "neutral",
  },
};

/**
 * @returns {{state:string, surfaceStatus:string, label:string, explanation:string, tone:string,
 *            isActive:boolean, reason:string}}
 */
export function presentSignatureState(inputs) {
  const derived = deriveSignatureState(inputs);
  // Fail closed: an unmapped state must never fall through to something that looks live.
  const p = PRESENTATION[derived.state] ?? PRESENTATION[SIGNATURE_STATES.STALE];
  return {
    state: derived.state,
    reason: derived.reason,
    ...p,
    isActive: derived.state === SIGNATURE_STATES.ACTIVE,
  };
}

/**
 * Convenience for a product whose artifact carries its own `status` plus a generation date.
 * `artifactDate` is derived from the artifact, never from the clock, so a stale file cannot
 * borrow today's date.
 */
export function presentFromArtifact({ slateDate, artifactDate, artifactStatus, archived = false, requiresApproval = false }) {
  const stopped = artifactStatus === "stopped" || artifactStatus === "completed";
  return presentSignatureState({
    slateDate,
    artifactDate,
    archived: archived || stopped,
    // A published card implies its markets existed and it qualified; the derivation's earlier
    // precedence steps (date/freshness) still run first, which is the entire point.
    marketsPosted: true,
    candidates: artifactStatus ? 1 : 0,
    qualified: artifactStatus === "active" || artifactStatus === "awaiting" ? 1 : 0,
    approved: artifactStatus === "active",
    requiresApproval,
  });
}
