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

/** "9-3-2" → { w, l, d }, or null. Only the three-part W-L-D form is read. */
function parseRecord(x) {
  const m = /^(\d+)-(\d+)-(\d+)/.exec(String(x ?? "").trim());
  return m ? { w: Number(m[1]), l: Number(m[2]), d: Number(m[3]) } : null;
}

/**
 * DRAW EVIDENCE — the same TWO independent provider signals the U4 rule relies on, both required:
 *
 *   1. the judges' cards compute to a draw: per judge, compare the two fighters' scores; neither
 *      fighter has a MAJORITY of judges (majority draw 28-28 / 27-29 / 28-28, split draw, unanimous
 *      draw). ⚠ Never the top-level totals (83 vs 85): a bout is decided judge by judge.
 *   2. BOTH fighters' records gained exactly one draw versus the card's pre-fight records, with wins
 *      and losses unchanged.
 *
 * Observed 2026-10-10, Gatto–Kareckaite (an official majority draw): STATUS_FINAL with no winner flag;
 * cards 28/27/28 vs 28/29/28; records 9-3-2 → 9-3-3 (21:37:31Z) and 6-2-1 → 6-2-2 (21:46:35Z).
 * With either signal missing the bout stays "no winner reported" — the official result decides.
 */
export function providerDrawEvidence(bout, envelope) {
  const fs = envelope?.competitors?.fighters ?? [];
  if (fs.length !== 2) return false;
  const [a, b] = fs;
  const ja = a?.judgeScores;
  const jb = b?.judgeScores;
  if (!Array.isArray(ja) || !Array.isArray(jb) || ja.length === 0 || ja.length !== jb.length) return false;
  let winsA = 0;
  let winsB = 0;
  for (let i = 0; i < ja.length; i++) {
    if (ja[i] > jb[i]) winsA++;
    else if (jb[i] > ja[i]) winsB++;
  }
  const majority = Math.floor(ja.length / 2) + 1;
  const judgesDraw = winsA < majority && winsB < majority;
  if (!judgesDraw) return false;
  const before = (athleteId) => {
    for (const corner of ["red", "blue"]) if (String(bout?.[corner]?.athleteId ?? "") === String(athleteId ?? "")) return parseRecord(bout[corner].record);
    return null;
  };
  return fs.every((f) => {
    const was = before(f.athleteId);
    const now = parseRecord(f.record);
    return Boolean(was && now && now.w === was.w && now.l === was.l && now.d === was.d + 1);
  });
}

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
      label = str(matched?.winnerAthleteId)
        ? "Final · awaiting official result"
        : providerDrawEvidence(bout, matched) ? "Draw (provider-reported, unofficial)" : "Final — no winner reported; awaiting official result";
      break;
    case "LIVE":
    case "DELAYED":
      state = UFC_LIVE_STATE.LIVE; group = "LIVE"; label = "Live";
      /* STATUS_END_OF_FIGHT: the fight is over and no result is stated yet. Still in play for the
         feed (polling continues), but never presented as fighting, and never with a winner. */
      if (matched?.phase === "FIGHT_OVER") { group = "AWAITING_OFFICIAL_RESULT"; label = "Fight over · result coming"; }
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
  const fightOver = state === UFC_LIVE_STATE.LIVE && matched?.phase === "FIGHT_OVER";
  const clock = state === UFC_LIVE_STATE.LIVE && matched?.period?.clockMeaning === "REMAINING_IN_ROUND"
    ? str(matched?.period?.clock) : null;

  /* The provider's end-of-bout round and time, as REPORTED (a final bout's period/clock). */
  const endRound = matched?.state === "FINAL" && typeof matched?.period?.number === "number" && matched.period.number > 0
    ? matched.period.number : null;
  /* Elapsed at the finish, provider-reported and UNOFFICIAL (it has been corrected after the fact). */
  const providerEndClock = matched?.state === "FINAL" && matched?.period?.clockMeaning === "ELAPSED_AT_FINISH_UNOFFICIAL"
    ? str(matched?.period?.clock) : null;
  /*
   * ⚠ A STOPPAGE'S FIRST FINAL TIME IS OFTEN THE TIME *REMAINING* — corrected to elapsed minutes later.
   *   Observed on every early stoppage of 2026-10-10 that ended mid-round between polls:
   *     Frye–Harris   FINAL 2:01 (22:09:14Z) → 2:59 (22:10:45Z)
   *     Ribeiro–Franco FINAL 3:11 (22:25:55Z) → 1:49 (22:28:59Z)
   *     Bonfim–Prado  FINAL 0:37 (23:12:49Z) → 4:23 (23:15:50Z)
   *   A single snapshot cannot tell which of the two it is holding, so a mid-round finish time is
   *   WITHHELD on a provider final. Only "5:00" is unambiguous — remaining time at a finish can never be
   *   5:00 — and it is shown, labelled unofficial (a distance bout, or a stoppage at the end of a round).
   */
  const endClock = providerEndClock === "5:00" ? providerEndClock : null;
  const finishTimeWithheld = providerEndClock !== null && endClock === null;

  /** @type {{ source: "PROVIDER"|"SETTLEMENT", winnerAthleteId: string|null, winnerName: string|null, round: number|null, clock: string|null, clockUnofficial: boolean, finishTimeWithheld: boolean, draw: boolean } | null} */
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
      finishTimeWithheld,
      /* Provider-reported and unofficial; only with BOTH draw signals, and never with a winner. */
      draw: !winnerAthleteId && providerDrawEvidence(bout, matched),
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
      finishTimeWithheld,
      draw: false,
    };
  }

  /* The prediction outcome exists ONLY on a canonical settlement that states one. */
  /* VOID (a draw or no contest) also comes only from the settlement — never from a provider draw. */
  const outcome = state === UFC_LIVE_STATE.FINAL_CANONICAL && bout?.pregame
    ? typeof settlement?.hit === "boolean" ? (settlement.hit ? "HIT" : "MISS") : settlement?.void === true ? "VOID" : null
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
    fightOver,
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
