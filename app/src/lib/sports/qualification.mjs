/**
 * THE `qualification` GATE STAGE — "a written policy with thresholds, applied by code, with no-play
 * as a first-class outcome".
 *
 * Shared machinery. Every sport's shadow run already speaks one ladder vocabulary; this states it
 * once, classifies each rung as PLAY or NO_PLAY, and lets the guard beside it prove the code agrees.
 *
 * WHY NO_PLAY IS THE POINT. The stage does not ask whether a sport can produce a pick. It asks
 * whether declining is a real outcome the code can reach — a policy that can only say yes is not a
 * policy. Three of the five rungs withhold, and each names WHY it withheld, which is what makes an
 * abstention auditable rather than a silent gap.
 *
 * THE VOCABULARY IS CLOSED. A sport may implement a subset; it may not invent a rung. That rule is
 * here because it was broken: a `MODELLED_EXPERIMENTAL` state was once added outside the closed
 * coverage axis to let a sport read as further along than its evidence supported, and the adapter
 * guard caught it. A new rung is a change to this file, reviewed — never a local string in one
 * sport's module.
 */

/** Every rung, and whether reaching it means a pick is published. */
export const LADDER = Object.freeze({
  REFUSED_POST_START: { play: false, meaning: "the run clock is at or after event start — post-start generation is refused outright" },
  ABSTAIN:            { play: false, meaning: "the model declined: sparse history, uncertain card, or unresolved identity — stated, never guessed past" },
  READY_EXCEPT_ODDS:  { play: false, meaning: "the model is ready but no authorized market exists — probabilities are withheld, not approximated" },
  CURRENT_PRE_EVENT:  { play: true,  meaning: "model and authorized market both present before start — the only rung that publishes" },
  PREDICTED:          { play: true,  meaning: "a published prediction on a sport whose ladder separates prediction from market pricing" },
});

export const LADDER_STATES = Object.freeze(Object.keys(LADDER));
export const NO_PLAY_STATES = Object.freeze(LADDER_STATES.filter((s) => !LADDER[s].play));

/** sport → the module that applies the policy, and the rungs it implements. */
export const QUALIFICATION = Object.freeze({
  ufc: { module: "src/lib/sports/ufc/shadow-run.mjs", states: ["REFUSED_POST_START", "ABSTAIN", "READY_EXCEPT_ODDS", "CURRENT_PRE_EVENT"] },
  nfl: { module: "src/lib/sports/nfl/shadow-run.mjs", states: ["REFUSED_POST_START", "ABSTAIN", "READY_EXCEPT_ODDS", "CURRENT_PRE_EVENT"] },
  epl: { module: "src/lib/sports/epl/shadow-run.mjs", states: ["REFUSED_POST_START", "ABSTAIN", "READY_EXCEPT_ODDS", "CURRENT_PRE_EVENT", "PREDICTED"] },
});

export const QUALIFIED_SPORTS = Object.freeze(Object.keys(QUALIFICATION));

/** True when a sport's policy can DECLINE — the condition the stage actually tests. */
export function canDecline(sport) {
  const q = QUALIFICATION[String(sport ?? "").toLowerCase()];
  return Boolean(q && q.states.some((s) => LADDER[s] && !LADDER[s].play));
}
