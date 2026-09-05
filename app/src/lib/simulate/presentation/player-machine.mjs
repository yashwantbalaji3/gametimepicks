/**
 * THE PRESENTATION PLAYER MACHINE — Program 234 · Release B.
 *
 * The player has a clock, a chapter cursor and a close button, which is exactly enough moving parts
 * to produce the class of bug a reader cannot see: two timers advancing one cursor, a chapter from
 * the previous event arriving after the reader has switched games, a "replay" that restarts a
 * presentation the reader already closed. So the transitions live here, as a pure module with no
 * react and no timers, and the component is left with nothing to decide.
 *
 * STATES
 *   IDLE        nothing has started; the trigger is showing
 *   PLAYING     a chapter is on screen and the clock is running
 *   PAUSED      a chapter is on screen and the clock is not
 *   COMPLETED   the last chapter has been reached; controls stay live (replay, report, close)
 *   UNAVAILABLE the manifest refused to build; the reason is displayed, the report still reachable
 *   ERROR       something the player itself could not do; the report is still reachable
 *
 * There is no LOADING state and that is deliberate. The artifact is already in the page — a
 * loading state here would be theatre, and the charter's own instruction is not to make a reader
 * wait through a ceremony to reach a result that is already available. The opening chapter carries
 * the short animation instead, and it is skippable like every other chapter.
 *
 * WHAT THE MACHINE REFUSES
 *   · advancing past the last chapter (COMPLETED is a terminal, not chapter n+1)
 *   · moving before the first
 *   · starting twice (a double-activated trigger must not spawn a second clock)
 *   · any action on a manifest whose event id differs from the one in context — a late response
 *     belonging to a different game is dropped rather than rendered under the current title
 */

export const PLAYER_STATES = Object.freeze(["IDLE", "PLAYING", "PAUSED", "COMPLETED", "UNAVAILABLE", "ERROR"]);

export const PLAYER_ACTIONS = Object.freeze(["START", "PAUSE", "RESUME", "NEXT", "PREV", "REPLAY", "FAIL"]);

/** Which actions each state will consider at all. Anything absent is ignored, never thrown at a user. */
const ACCEPTS = Object.freeze({
  IDLE: ["START", "FAIL"],
  PLAYING: ["PAUSE", "NEXT", "PREV", "REPLAY", "FAIL"],
  PAUSED: ["RESUME", "NEXT", "PREV", "REPLAY", "FAIL"],
  COMPLETED: ["REPLAY", "PREV", "FAIL"],
  UNAVAILABLE: [],
  ERROR: [],
});

/**
 * @param {{ eventId: string, chapterCount: number, unavailable?: boolean, reason?: string | null }} init
 */
export function createPlayer({ eventId, chapterCount, unavailable = false, reason = null }) {
  if (!eventId) throw new Error("player-machine: eventId is required");
  if (!Number.isInteger(chapterCount) || chapterCount < 0) {
    throw new Error("player-machine: chapterCount must be a non-negative integer");
  }
  if (unavailable || chapterCount === 0) {
    return Object.freeze({
      state: "UNAVAILABLE",
      eventId,
      chapterCount,
      index: 0,
      reason: reason ?? "This event has no presentation to play.",
      /** Increments on every REPLAY so a component can key its animations without a timer of its own. */
      run: 0,
    });
  }
  return Object.freeze({ state: "IDLE", eventId, chapterCount, index: 0, reason: null, run: 0 });
}

/** Is the clock running? The single question a component's timer effect should ask. */
export const isRunning = (p) => p.state === "PLAYING";

/** Is this the last chapter? */
export const atLast = (p) => p.index >= p.chapterCount - 1;

/**
 * Apply an action. Always returns a context — an unaccepted action returns the SAME frozen object,
 * so a component may compare by reference to know whether anything happened.
 *
 * @param {object} p
 * @param {"START"|"PAUSE"|"RESUME"|"NEXT"|"PREV"|"REPLAY"|"FAIL"} action
 * @param {{ eventId?: string, reason?: string }} [opts] `eventId` guards a late/stale caller.
 */
export function apply(p, action, opts = {}) {
  /* A response for a different event is not this player's business. Drop it. */
  if (opts.eventId && opts.eventId !== p.eventId) return p;
  if (!(ACCEPTS[p.state] ?? []).includes(action)) return p;

  switch (action) {
    case "START":
      return Object.freeze({ ...p, state: "PLAYING", index: 0 });
    case "PAUSE":
      return Object.freeze({ ...p, state: "PAUSED" });
    case "RESUME":
      return Object.freeze({ ...p, state: "PLAYING" });
    case "NEXT":
      /* The end of the last chapter is COMPLETED, never an index nobody wrote a chapter for. */
      return atLast(p)
        ? Object.freeze({ ...p, state: "COMPLETED" })
        : Object.freeze({ ...p, index: p.index + 1 });
    case "PREV":
      if (p.state === "COMPLETED") return Object.freeze({ ...p, state: "PAUSED", index: p.chapterCount - 1 });
      return p.index === 0 ? p : Object.freeze({ ...p, index: p.index - 1 });
    case "REPLAY":
      return Object.freeze({ ...p, state: "PLAYING", index: 0, run: p.run + 1 });
    case "FAIL":
      return Object.freeze({
        ...p,
        state: "ERROR",
        reason: opts.reason ?? "The presentation stopped unexpectedly. The full report is unaffected.",
      });
    default:
      return p;
  }
}
