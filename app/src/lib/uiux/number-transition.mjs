/**
 * NUMBER TRANSITION (role: number-transition, P262) — the arithmetic between two values a READER
 * caused, one frame at a time.
 *
 * THE ROLE'S HARD RULE: never count up to a deterministic published number. A settled record, a
 * graded price, a committed projection — those were computed once and committed, and animating them
 * implies the site is working them out while you watch. This is for the other case only: a number the
 * reader just changed themselves, where the movement shows THEIR input flowing through to the result.
 *
 * Pure, so the easing and the end state can be tested without a browser.
 */

/** The contract's decelerate curve, as a function rather than a bezier string. */
export const decelerate = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Where the number sits `elapsed` into the transition. Always lands exactly on `to` — a transition
 * that stops a cent short would publish a wrong figure to save a frame.
 */
export function frameValue(from, to, elapsed, duration) {
  if (!(duration > 0) || elapsed >= duration) return to;
  if (elapsed <= 0) return from;
  return from + (to - from) * decelerate(elapsed / duration);
}
