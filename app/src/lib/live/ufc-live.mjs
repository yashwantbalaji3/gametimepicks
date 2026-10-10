/**
 * UFC LIVE STATE (UFC-001 · live hub) — what one bout card on /live may say, derived in ONE place.
 *
 * Pure: no I/O, no clock of its own, no Node imports. The browser (after a poll) and the tests call
 * it with the same inputs and get the same answer.
 *
 * ── THE CANONICAL LIVE-STATE CONTRACT FOR A BOUT ────────────────────────────────────────────────
 *
 *   UPCOMING           no evidence the bout has begun: scheduled, PRE-FIGHT or WALKOUTS (ESPN says
 *                      `state: "in"` for both, with period 0 — nobody is fighting), or not in the feed
 *   LIVE               the provider states the bout is in a round. Round and clock are carried
 *                      ONLY when the provider stated them — never a default round, never "0:00".
 *                      The in-round clock is time REMAINING in the round (it counts down, observed
 *                      2026-10-10). Between rounds ("End R2") there is a round and NO clock.
 *   FINAL_PROVISIONAL  the provider says the bout is over. Its winner is shown as REPORTED; the
 *                      pick is NOT marked right or wrong, because a provider final is not a
 *                      settlement (a decision can be overturned, a no-contest declared later)
 *   FINAL_CANONICAL    ONLY from a settlement record (the graded ledger), handed in by the caller.
 *                      Nothing in this file can produce one from a feed.
 *
 * plus one exceptional state, NOT_TRACKABLE, for a bout the provider itself calls postponed or
 * cancelled. (ESPN's MMA scoreboard has not been observed to do that: a replaced bout DISAPPEARS.
 * That is why a bout missing from a feed that otherwise answered is labelled "not in the live feed"
 * and never "cancelled" — the absence is the observation, not its explanation.)
 *
 * ── WHAT NEVER HAPPENS HERE ─────────────────────────────────────────────────────────────────────
 *
 *   - NO IN-FIGHT PROBABILITY. The pregame pick is passed through BY REFERENCE from the build-time
 *     roster (which read it from the frozen card), so it cannot be recomputed, nudged or replaced by
 *     anything the feed says. There is no input through which a live probability could arrive.
 *   - NO METHOD. The scoreboard states no KO/SUB/DEC and the summary endpoint 404s for this card.
 *   - NO WRONG-FIGHTER JOIN. An envelope is attached to a bout only when its id is the bout's id AND
 *     its two athlete ids are exactly the card's two athlete ids. A pairing the provider changed is a
 *     different fight, and attaching its result to our pick would grade a forecast nobody made.
 */
import { derivePresentationState } from "./lifecycle.mjs";
import { freshnessOf } from "./freshness.mjs";

export const UFC_LIVE_STATE = Object.freeze({
  UPCOMING: "UPCOMING",
  LIVE: "LIVE",
  FINAL_PROVISIONAL: "FINAL_PROVISIONAL",
  FINAL_CANONICAL: "FINAL_CANONICAL",
  NOT_TRACKABLE: "NOT_TRACKABLE",
});

/** The four sections the hub shows, in reading order. */
export const UFC_HUB_GROUPS = Object.freeze(["LIVE", "UPCOMING", "AWAITING_OFFICIAL_RESULT", "FINAL"]);

export const UFC_HUB_GROUP_LABEL = Object.freeze({
  LIVE: "Live now",
  UPCOMING: "Upcoming",
  AWAITING_OFFICIAL_RESULT: "Awaiting official result",
  FINAL: "Final",
});

/** Stated once, so every surface says the same thing about the missing field. */
export const UFC_METHOD_NOTE = "Method of victory is not reported by the live feed.";

/**
 * Does this envelope describe THIS bout, between THESE two fighters?
 *
 * Exact id equality only. The card and the feed are both ESPN, so the competition id and both athlete
 * ids are the provider's own keys; no name is compared anywhere in this check.
 */
export function envelopeMatchesBout(envelope, bout) {
  if (!envelope || !bout) return false;
  if (String(envelope.eventId ?? "") !== String(bout.boutId ?? "")) return false;
  const want = [bout.red?.athleteId, bout.blue?.athleteId].map((x) => String(x ?? "")).sort();
  const got = (envelope.competitors?.fighters ?? []).map((f) => String(f?.athleteId ?? "")).sort();
  return want.length === 2 && got.length === 2 && want[0] !== "" && want[0] === got[0] && want[1] === got[1];
}

/** The card's own name for an athlete id, or null. */
function nameForAthlete(bout, athleteId) {
  if (!athleteId) return null;
  for (const corner of ["red", "blue"]) {
    if (bout?.[corner]?.athleteId && String(bout[corner].athleteId) === String(athleteId)) return bout[corner].name ?? null;
  }
  return null;
}

/** The card's athlete id for a name, by EXACT equality against this bout's own two names. */
function athleteForName(bout, name) {
  if (!name) return null;
  for (const corner of ["red", "blue"]) {
    if (bout?.[corner]?.name === name) return bout[corner].athleteId ?? null;
  }
  return null;
}

const str = (x) => (typeof x === "string" && x.length ? x : null);

/**
 * Derive what one bout card may present.
 *
 * - `bout`: the build-time roster bout (frozen pregame pick, settlement or null)
 * - `envelope`: the gateway's envelope for this bout id, or null
 * - `feed`: what the caller knows about the feed — NOT_ASKED (live off, or nothing fetched yet),
 *   OK (a slate answered), REFUSED (the gateway refused or failed and nothing usable is held)
 * - `nowMs`: the reader's clock, for freshness. Null = not evaluated.
 *
 * @param {{ bout: any, envelope?: any, feed?: "NOT_ASKED"|"OK"|"REFUSED", nowMs?: number|null }} input
 */
export function deriveUfcBoutState({ bout, envelope = null, feed = "NOT_ASKED", nowMs = null }) {
  const offered = envelope ?? null;
  const matched = offered && envelopeMatchesBout(offered, bout) ? offered : null;
  const identityMismatch = Boolean(offered) && !matched;
  const settlement = bout?.settlement ?? null;

  const life = derivePresentationState({
    envelope: matched,
    settlement,
    feedState: feed === "REFUSED" ? "REFUSED" : "NOT_ASKED",
  });

  /** @type {string} */
  let state;
  /** @type {"LIVE"|"UPCOMING"|"AWAITING_OFFICIAL_RESULT"|"FINAL"} */
  let group;
  /** @type {string} */
  let label;
  switch (life.state) {
    case "SETTLED":
      state = UFC_LIVE_STATE.FINAL_CANONICAL; group = "FINAL"; label = "Final · official";
      break;
    case "FINAL_PENDING_SETTLEMENT":
      state = UFC_LIVE_STATE.FINAL_PROVISIONAL; group = "AWAITING_OFFICIAL_RESULT";
      /* ⚠ A FINAL WITH NO WINNER FLAG IS REAL (Gatto–Kareckaite, 2026-10-10: STATUS_FINAL, completed,
         neither corner flagged — for at least 45 minutes). It is "result pending", never a draw and
         never a winner inferred from anything else. */
      label = str(matched?.winnerAthleteId) ? "Final · awaiting official result" : "Final · result pending";
      break;
    case "LIVE":
    case "DELAYED":
      state = UFC_LIVE_STATE.LIVE; group = "LIVE"; label = "Live";
      break;
    case "POSTPONED":
    case "CANCELLED":
      state = UFC_LIVE_STATE.NOT_TRACKABLE; group = "FINAL"; label = life.state === "POSTPONED" ? "Postponed" : "Cancelled";
      break;
    case "UNKNOWN":
      state = UFC_LIVE_STATE.UPCOMING; group = "UPCOMING"; label = "Status unknown";
      break;
    default: // PRE
      state = UFC_LIVE_STATE.UPCOMING; group = "UPCOMING";
      label = matched?.phase === "WALKOUTS" ? "Walkouts" : matched?.phase === "PRE_FIGHT" ? "Pre-fight" : "Scheduled";
  }

  /* A bout the feed should have listed and did not. Said as an observation, never as "cancelled". */
  const notInFeed = !matched && !identityMismatch && feed === "OK" && !settlement;
  if (state === UFC_LIVE_STATE.UPCOMING && notInFeed) label = "Not in the live feed";
  if (state === UFC_LIVE_STATE.UPCOMING && identityMismatch) label = "Live feed lists different fighters";

  /* Freshness only means something for a bout in progress; a final or scheduled bout is not stale. */
  const fresh = state === UFC_LIVE_STATE.LIVE && matched && typeof nowMs === "number"
    ? freshnessOf(matched, nowMs)
    : { level: "NOT_APPLICABLE", ageMs: null };
  const stale = fresh.level === "STALE";

  /* Round and clock: LIVE only, and only what the provider stated. The clock only while IN a round,
     where it is time remaining; between rounds the bout has a round and no clock. */
  const round = state === UFC_LIVE_STATE.LIVE && typeof matched?.period?.number === "number" && matched.period.number > 0
    ? matched.period.number : null;
  const betweenRounds = state === UFC_LIVE_STATE.LIVE && matched?.phase === "ROUND_ENDED";
  const clock = state === UFC_LIVE_STATE.LIVE && matched?.period?.clockMeaning === "REMAINING_IN_ROUND"
    ? str(matched?.period?.clock) : null;

  /* The provider's end-of-bout round and time, as REPORTED (a final bout's period/clock). */
  const endRound = matched?.state === "FINAL" && typeof matched?.period?.number === "number" && matched.period.number > 0
    ? matched.period.number : null;
  /* Elapsed at the finish, provider-reported and UNOFFICIAL (it has been corrected after the fact). */
  const endClock = matched?.state === "FINAL" && matched?.period?.clockMeaning === "ELAPSED_AT_FINISH_UNOFFICIAL"
    ? str(matched?.period?.clock) : null;

  /** @type {{ source: "PROVIDER"|"SETTLEMENT", winnerAthleteId: string|null, winnerName: string|null, round: number|null, clock: string|null, clockUnofficial: boolean } | null} */
  let result = null;
  if (state === UFC_LIVE_STATE.FINAL_PROVISIONAL) {
    const winnerAthleteId = str(matched?.winnerAthleteId);
    result = {
      source: "PROVIDER",
      winnerAthleteId,
      winnerName: nameForAthlete(bout, winnerAthleteId),
      round: endRound,
      clock: endClock,
      clockUnofficial: endClock !== null,
    };
  } else if (state === UFC_LIVE_STATE.FINAL_CANONICAL) {
    const winnerName = str(settlement?.winnerName);
    result = {
      source: "SETTLEMENT",
      winnerAthleteId: athleteForName(bout, winnerName),
      winnerName,
      round: endRound,
      clock: endClock,
      clockUnofficial: endClock !== null,
    };
  }

  /* The prediction outcome exists ONLY on a canonical settlement that states one. */
  const outcome = state === UFC_LIVE_STATE.FINAL_CANONICAL && bout?.pregame && typeof settlement?.hit === "boolean"
    ? (settlement.hit ? "HIT" : "MISS")
    : null;

  return {
    boutId: bout?.boutId ?? null,
    state,
    group,
    label,
    lifecycleState: life.state,
    providerState: matched?.state ?? null,
    providerDetail: str(matched?.stateDetail),
    phase: matched?.phase ?? null,
    betweenRounds,
    round,
    clock,
    freshness: fresh,
    stale,
    notInFeed,
    identityMismatch,
    result,
    outcome,
    /* By reference: the frozen pick from the build-time roster, untouched. */
    pregame: bout?.pregame ?? null,
    methodNote: UFC_METHOD_NOTE,
    pollingAllowed: life.pollingAllowed,
  };
}

/**
 * Group a roster's bouts for the hub, keeping the card's own order (main event first) in each group.
 *
 * @template B
 * @param {B[]} bouts
 * @param {Record<string, any> | null | undefined} envelopesById
 * @param {{ feed?: "NOT_ASKED"|"OK"|"REFUSED", nowMs?: number|null }} [opts]
 */
export function groupUfcBouts(bouts, envelopesById, { feed = "NOT_ASKED", nowMs = null } = {}) {
  /** @type {Record<"LIVE"|"UPCOMING"|"AWAITING_OFFICIAL_RESULT"|"FINAL", Array<{ bout: B, view: ReturnType<typeof deriveUfcBoutState> }>>} */
  const out = { LIVE: [], UPCOMING: [], AWAITING_OFFICIAL_RESULT: [], FINAL: [] };
  for (const bout of bouts ?? []) {
    const envelope = envelopesById?.[String(/** @type {any} */ (bout).boutId)] ?? null;
    const view = deriveUfcBoutState({ bout, envelope, feed, nowMs });
    out[view.group].push({ bout, view });
  }
  return out;
}
