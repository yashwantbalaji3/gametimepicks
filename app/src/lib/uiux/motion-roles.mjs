/**
 * THE MOTION ROLE CONTRACT — Program 185, Release B4.
 *
 * The charter asks for "named motion roles: ambient, entrance, exit, emphasis, progress, state
 * change, number transition, chart draw, hover/focus, disclosure and route transition", each with
 * "a duration, easing, distance, performance budget and reason to exist".
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────
 * Measured before writing it: 44 keyframes, ZERO named motion tokens, and 77 reduced-motion blocks
 * added one at a time. Every animation hard-coded its own timing, which produced the same shape as
 * the colour problem this programme started with — six interaction durations (120/160/180/200/220/
 * 240ms) that are one intent typed six ways, and FOUR near-identical decelerate curves:
 *
 *     cubic-bezier(0.22, 0.61, 0.36, 1)   x11
 *     cubic-bezier(0.2,  0.8,  0.2,  1)   x5
 *     cubic-bezier(0.22, 1,    0.36, 1)   x4
 *
 * A role system is the motion equivalent of "one token per hue": the reason to move is named once,
 * and the timing follows from the reason instead of from whoever wrote the component.
 *
 * ── THE REDUCED-MOTION RULE ────────────────────────────────────────────────────────────────────
 * The charter is precise, and it is NOT "turn everything off": reduced mode "removes nonessential
 * spatial/looping movement but keeps focus, progress, state and loading feedback understandable".
 * So each role declares what happens to it, and the answer is a property of the role rather than a
 * per-component afterthought:
 *
 *     keep     — the motion IS the information (progress, focus). Removing it removes feedback.
 *     shorten  — the motion aids understanding but the distance is the decoration (disclosure).
 *     remove   — spatial or looping decoration. Nothing is lost but the flourish.
 *
 * ── WHAT MOTION MAY NOT DO HERE ────────────────────────────────────────────────────────────────
 * This product publishes DETERMINISTIC artifacts. No role may imply a number is being recomputed,
 * rerolled or arrived at live, and no role may run on a stale or unavailable state to make it look
 * busy. `forbidden` on each role records that, because the constraint is what a future author will
 * otherwise reach for.
 */

/** @typedef {"keep"|"shorten"|"remove"} ReducedBehaviour */

export const EASING = Object.freeze({
  /* One decelerate curve, replacing four near-identical ones. Fast out of the gate, settles soft. */
  decelerate: "cubic-bezier(0.22, 0.61, 0.36, 1)",
  /* Symmetric, for things that leave the way they arrived. */
  standard: "cubic-bezier(0.6, 0, 0.3, 1)",
  /* Constant rate. Only honest choice for anything that represents elapsed progress. */
  linear: "linear",
});

export const MOTION_ROLES = Object.freeze([
  {
    role: "hover-focus", duration: 160, easing: EASING.decelerate, distance: "0",
    budget: "compositor-only (opacity/transform); never layout", reduced: "keep",
    reason: "A control must answer the pointer and the keyboard. Focus feedback is an accessibility affordance, not decoration, so it survives reduced motion.",
    forbidden: "Never move the control itself — a target that shifts under the cursor is harder to hit.",
  },
  {
    role: "state-change", duration: 200, easing: EASING.decelerate, distance: "0",
    budget: "compositor-only; one property", reduced: "keep",
    reason: "A row going from pending to settled should be seen changing, or the reader misses that anything happened.",
    forbidden: "Never animate a state the data did not actually change.",
  },
  {
    role: "progress", duration: 0, easing: EASING.linear, distance: "0",
    budget: "one transform per frame; duration is DATA, not a constant", reduced: "keep",
    reason: "A simulation running or a ladder filling is elapsed work made visible. Removing it removes the only signal that the product is doing something.",
    forbidden: "Never loop a progress animation on a finished or unavailable artifact to imply live work.",
  },
  {
    role: "disclosure", duration: 220, easing: EASING.decelerate, distance: "4px",
    budget: "height/opacity on one container", reduced: "shorten",
    reason: "Opening a panel should read as this content coming from that control. The direction carries the meaning; the distance is the flourish.",
    forbidden: "Never animate a disclosure so slowly that a reader taps twice.",
  },
  {
    role: "entrance", duration: 420, easing: EASING.decelerate, distance: "8px",
    budget: "opacity + translateY, staggered ≤ 5 items", reduced: "remove",
    reason: "A staged reveal gives a dense board an order to be read in.",
    forbidden: "Never stagger a long list — rows 20+ arrive after the reader has already started reading.",
  },
  {
    role: "exit", duration: 160, easing: EASING.standard, distance: "4px",
    budget: "opacity + transform", reduced: "remove",
    reason: "Something leaving should be seen leaving, faster than it arrived.",
    forbidden: "Never delay a dismissal behind its own animation.",
  },
  {
    role: "emphasis", duration: 900, easing: EASING.decelerate, distance: "0",
    budget: "one glow/scale, single shot", reduced: "remove",
    reason: "A one-shot highlight for a genuinely notable event — a rung clearing, a card settling.",
    forbidden: "Never emphasise routinely; a highlight that fires every render stops meaning anything.",
  },
  {
    role: "number-transition", duration: 480, easing: EASING.decelerate, distance: "0",
    budget: "text content only, tabular-nums to stop reflow", reduced: "remove",
    reason: "A bankroll moving to a new figure reads as a change rather than a redraw.",
    forbidden: "NEVER count up to a deterministic published number. It implies the value is being computed now; it was computed once and committed.",
  },
  {
    role: "chart-draw", duration: 700, easing: EASING.decelerate, distance: "0",
    budget: "stroke-dashoffset on one path", reduced: "remove",
    reason: "Drawing a distribution shows its shape being traced, which is how a reader learns to read it.",
    forbidden: "Never redraw on every re-render — the artifact is fixed, and repeated drawing implies resampling.",
  },
  {
    role: "ambient", duration: 3200, easing: EASING.standard, distance: "0",
    budget: "one looping compositor property, ≤ 0.06 opacity delta", reduced: "remove",
    reason: "Slow background life keeps a dark product from reading as a screenshot.",
    forbidden: "Never place ambient motion behind text, and never let it read as a status indicator.",
  },
  {
    role: "route-transition", duration: 240, easing: EASING.decelerate, distance: "0",
    budget: "opacity only; must not delay first paint", reduced: "remove",
    reason: "A short cross-fade stops a navigation reading as a flash.",
    forbidden: "Never hold content back for a transition — the page is the point.",
  },
]);

/** Roles whose motion carries information, so reduced mode keeps them. */
export const ESSENTIAL_ROLES = Object.freeze(
  MOTION_ROLES.filter((r) => r.reduced !== "remove").map((r) => r.role),
);

/** CSS custom-property name for a role's duration / easing. One source, two consumers. */
export const durationVar = (role) => `--motion-${role}-duration`;
export const easingVar = (role) => `--motion-${role}-easing`;

/** The token block this contract renders to, so globals.css and the contract cannot disagree. */
export function motionTokenBlock() {
  return MOTION_ROLES.map((r) =>
    `  ${durationVar(r.role)}: ${r.duration}ms;\n  ${easingVar(r.role)}: ${r.easing};`,
  ).join("\n");
}
