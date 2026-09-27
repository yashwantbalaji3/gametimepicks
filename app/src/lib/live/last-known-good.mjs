/**
 * LAST-KNOWN-GOOD LIVE STATE (§9) — a provider failure is not a change in the world.
 *
 * ── WHAT REPRODUCES AND WHAT DOES NOT ──────────────────────────────────────────────────────────
 *
 * §9 reports that forcing HTTP 503 turned live and final games into "Starting Soon". That half does
 * NOT reproduce: `derivePresentationState` was fixed in #705 and a refused feed with no envelope
 * yields UNKNOWN, never PRE. Saying otherwise would overstate the defect.
 *
 * What DOES reproduce is the information loss, and the existing reason code names the gap itself —
 * `FEED_REFUSED_NO_PRIOR_STATE`. A 503 mid-game currently renders "Status unknown" and drops
 * BUF 21 - DET 17 / Q3 08:42 entirely, because `derivePresentationState` is MEMORYLESS: it sees one
 * envelope and has no way to know a better one existed a minute ago.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────────────────────────────
 *
 * A feed failure is a fact about OUR READING, not about the game. So the last state we actually
 * observed is still the best available truth, and it is presented AS OF WHEN IT WAS OBSERVED:
 *
 *     BUF 21 - DET 17
 *     Q3 08:42
 *     Live feed temporarily unavailable
 *     Last factual update 2m ago
 *
 * ⚠ THE CARRIED ENVELOPE IS RETURNED VERBATIM. Nothing here advances a clock, a score, or a stat.
 * §9: "Do not invent continued clock/stat movement while stale." An interpolated clock would be a
 * fabricated observation, which is the one thing this product exists not to do — so the carry has no
 * arithmetic in it at all, only a timestamp and a notice.
 *
 * ⚠ AND IT NEVER MOVES A GAME BACKWARDS. A carried LIVE or FINAL is never replaced by a fresh PRE or
 * UNKNOWN. That direction is proved exhaustively in the tests over every state pair.
 */
import { CLOCK, DOMAIN, readClock, CLOCK_STATE } from "../freshness/clocks.mjs";

export const FEED_STATE = Object.freeze({
  /** The read succeeded. */
  OK: "OK",
  /** The read succeeded but what came back is older than the bound. */
  STALE: "STALE",
  /** The read failed — 503, timeout, refusal. */
  UNAVAILABLE: "UNAVAILABLE",
  /** We did not look. Not a failure. */
  NOT_ASKED: "NOT_ASKED",
});

/**
 * States that describe a game that has started. A carried one of these outranks any fresh state that
 * describes a game that has not.
 */
const STARTED = Object.freeze(new Set(["LIVE", "DELAYED", "FINAL"]));
/**
 * States that assert nothing about a started game — the ones a fresh read must not move us back to.
 *
 * ⚠ A MISSING ENVELOPE IS NOT A MEMBER OF THIS SET, and putting `null` in it was a real bug of mine:
 * a plain 503 then reported "Live feed returned an earlier state" instead of "temporarily
 * unavailable", because an absent envelope counted as the provider having SAID "not started". A
 * failed read is a fact about our transport; a PRE row after a LIVE one is a fact about the
 * provider. A code naming the wrong subsystem misdirects everything after it.
 */
const NOT_STARTED = Object.freeze(new Set(["PRE", "UNKNOWN"]));

export const CARRY = Object.freeze({
  /** The fresh envelope is what is presented. */
  FRESH: "FRESH",
  /** The last observed envelope is presented, with a notice and its own timestamp. */
  CARRIED: "CARRIED",
  /** Nothing to present — no fresh envelope and no prior one. */
  NOTHING_KNOWN: "NOTHING_KNOWN",
});

/**
 * Decide which envelope to present.
 *
 * @param current   the envelope this read produced, or null when the read failed
 * @param lastGood  the last envelope we successfully observed, or null
 * @param feedState one of FEED_STATE
 * @param asOf      the instant the page is being rendered for — never a wall clock inside here
 * @param staleAfterMs  REQUIRED when a notice may claim staleness; no safe default
 */
export function carryLastKnownGood({ current = null, lastGood = null, feedState = FEED_STATE.NOT_ASKED, asOf, staleAfterMs } = {}) {
  if (!Number.isFinite(staleAfterMs)) {
    throw new Error("carryLastKnownGood: staleAfterMs is required — staleness has no safe default (§15)");
  }

  const freshState = current?.state ?? null;
  const priorState = lastGood?.state ?? null;

  /*
   * ⚠ THE REGRESSION GUARD, AND IT APPLIES EVEN WHEN THE FEED SAYS OK. A provider that answers 200
   * with a PRE row for a game we already watched go live has told us something impossible; treating
   * it as news would wipe the score. The rule is about the STATES, not about the transport.
   */
  /*
   * ONE RULE, NOT TWO. This also tested `current != null`, which made the pair redundant: removing
   * either line alone changed no test, so neither probed — the redundancy-hides-from-mutation-testing
   * trap. `NOT_STARTED` holds provider STATE STRINGS, and a failed read produces no state at all, so
   * a missing envelope is simply not a member. That is the whole guard.
   */
  const wouldRegress = STARTED.has(priorState) && NOT_STARTED.has(freshState);

  const usable = feedState === FEED_STATE.OK && current && !wouldRegress;
  if (usable) {
    return { decision: CARRY.FRESH, envelope: current, notice: null, observedAt: current[CLOCK.LIVE_OBSERVED_AT] ?? current.observedAt ?? null };
  }

  if (!lastGood) {
    /* No prior state to carry. UNKNOWN is the honest answer and `derivePresentationState` already
       produces it; this says so explicitly rather than inventing a PRE. */
    return { decision: CARRY.NOTHING_KNOWN, envelope: current ?? null, notice: noticeFor({ feedState, ageMs: null, regressed: wouldRegress }), observedAt: null };
  }

  const observedAt = lastGood[CLOCK.LIVE_OBSERVED_AT] ?? lastGood.observedAt ?? null;
  const read = readClock({ [CLOCK.LIVE_OBSERVED_AT]: observedAt }, CLOCK.LIVE_OBSERVED_AT, { domain: DOMAIN.LIVE, asOf });
  const ageMs = read.state === CLOCK_STATE.KNOWN ? read.ageMs : null;

  return {
    /* ⚠ VERBATIM. Same object, no clock advanced, no score touched. */
    decision: CARRY.CARRIED,
    envelope: lastGood,
    notice: noticeFor({ feedState, ageMs, regressed: wouldRegress }),
    observedAt,
    ageMs,
    /* §9 asks for a retry affordance; offering one is only honest while we intend to look again. */
    retryAvailable: feedState !== FEED_STATE.NOT_ASKED,
  };
}

/**
 * The reader-facing notice. ⚠ AN UNKNOWN AGE SAYS SO — "Last factual update 0m ago" would be a
 * confident claim about a timestamp we could not read.
 */
export function noticeFor({ feedState, ageMs, regressed = false }) {
  const age = ageMs == null
    ? "Last factual update: time unknown"
    : `Last factual update ${humanAge(ageMs)} ago`;

  if (regressed) {
    /* Distinct on purpose: this is not a transport failure, it is a provider contradicting itself,
       and an operator reading "temporarily unavailable" would look in the wrong place. */
    return { kind: "PROVIDER_REGRESSED", headline: "Live feed returned an earlier state", detail: age };
  }
  switch (feedState) {
    case FEED_STATE.UNAVAILABLE:
      return { kind: "FEED_UNAVAILABLE", headline: "Live feed temporarily unavailable", detail: age };
    case FEED_STATE.STALE:
      return { kind: "FEED_STALE", headline: "Live feed is behind", detail: age };
    case FEED_STATE.NOT_ASKED:
      return { kind: "FEED_NOT_ASKED", headline: "Not checked for live updates", detail: age };
    default:
      return null;
  }
}

function humanAge(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
