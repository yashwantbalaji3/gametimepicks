/**
 * ESPN MMA SCOREBOARD → the live contract, one BOUT at a time (§9).
 *
 * §9 insists UFC "must not be forced into a fake baseball/football shape", and the shape that fits
 * is the bout: two fighters, a round, a clock, and — at the end — a winner. An event is a container
 * for bouts and is never itself the unit a prediction attaches to.
 *
 * ── WHAT THE REGISTERED SOURCE ACTUALLY STATES, VERIFIED ON REAL EVENTS ────────────────────────
 *
 * Checked against completed cards on 2026-08-29 and 2026-09-19, and a scheduled one on 2026-09-26:
 *
 *   competitor.id        the ESPN athlete id — present in PRE as well as POST
 *   competitor.winner    the winner, by that id
 *   status.type.state    pre | in | post
 *   status.period        the round in progress, or the round the bout ended in
 *   status.displayClock  the clock, or the time at the end
 *
 * ⚠ IT IS `competitor.id`, NOT `competitor.athlete.id`. The nested `athlete` object carries
 * `displayName` and no id at all — my first probe read it, found null, and I nearly recorded "UFC
 * has no stable live identity", which would have been exactly backwards. The id is one level up.
 *
 * ── AND WHAT IT DOES NOT STATE: THE METHOD ─────────────────────────────────────────────────────
 *
 * There is no KO/SUB/DEC field anywhere in the payload, and the `summary` endpoint answers a
 * code/message error for these ids. `capture-ufc-results.mjs` already records the consequence: this
 * product grades UFC through a WINNER-ONLY settlement contract that quarantines draw and no-contest
 * rather than guessing. Inferring a method from prose would be the name-matching the live join
 * exists to avoid, so this adapter states no method and the tracked rows say so.
 *
 * NEVER FABRICATE. A bout with no period is null, not round 1. `winner: false` on BOTH competitors
 * of a scheduled bout is the provider's default, not a draw — so a winner is read only from a
 * completed bout.
 */
import { LIVE_STATES } from "../contract.mjs";

/** ESPN's three bout states → the shared vocabulary. Anything else is UNKNOWN, never a guess. */
export function mapMmaState(status) {
  const t = status?.type ?? {};
  if (t.state === "post" || t.completed === true) return "FINAL";
  if (t.state === "in") return "LIVE";
  if (t.state === "pre") return "PRE";
  const name = String(t.name ?? "");
  if (name.includes("POSTPONED")) return "POSTPONED";
  if (name.includes("CANCELED") || name.includes("CANCELLED")) return "CANCELLED";
  return "UNKNOWN";
}

const str = (x) => (typeof x === "string" && x.length ? x : null);

/** A provider placeholder is not a clock. `-` and the empty string are absence, stated as such. */
function cleanClock(x) {
  const v = str(x);
  return v === null || v === "-" || v === "--" ? null : v;
}
const int = (x) => (Number.isFinite(Number(x)) && x !== null && x !== "" ? Number(x) : null);

/**
 * One bout.
 *
 * `winner` is populated ONLY when the bout is FINAL. In PRE and LIVE every competitor carries
 * `winner: false`, which is a default and not a fact — reading it earlier would report both
 * fighters as having lost for the whole broadcast.
 */
export function normalizeMmaBout(competition, event, fetchedAt) {
  const status = competition?.status ?? {};
  const state = mapMmaState(status);
  const final = state === "FINAL";

  const fighters = (competition?.competitors ?? []).map((c) => ({
    /* ⚠ `c.id`, not `c.athlete.id` — see the header. */
    athleteId: str(c?.id),
    name: str(c?.athlete?.displayName),
    order: int(c?.order),
    winner: final ? c?.winner === true : null,
  }));

  return {
    sport: "ufc",
    provider: "espn_scoreboard",
    eventId: str(event?.id),
    eventName: str(event?.name),
    boutId: str(competition?.id),
    startTime: str(competition?.date) ?? str(event?.date),
    state: LIVE_STATES.includes(state) ? state : "UNKNOWN",
    /* The provider's own words, shown verbatim so we never paraphrase a feed. */
    stateDetail: str(status?.type?.detail),
    /*
     * ⚠ NULL, NOT 0 AND NOT 1 — AND THE LIVE CARD IS WHAT PROVED IT.
     *
     * The fixtures (a scheduled card and a completed one) both looked right with `state === "PRE"`
     * as the only guard. On the real card of 2026-09-26, the first bout went `in` while ESPN still
     * reported `period: 0` and `displayClock: "-"`, and the tracked row rendered `R0` — a round no
     * bout has ever been in — with a dash for a clock.
     *
     * A period of 0 is the provider saying "not yet", exactly as an absent one does, and `-` is a
     * placeholder rather than a time. Both become null, because a row that says R0 is worse than a
     * row that says nothing: it looks like a measurement.
     */
    round: int(status?.period) > 0 ? int(status?.period) : null,
    clock: cleanClock(status?.displayClock),
    fighters,
    /* The winner's ESPN athlete id, or null. Never a name. */
    winnerAthleteId: final ? (fighters.find((f) => f.winner)?.athleteId ?? null) : null,
    /* ⚠ STATED AS ABSENT, not omitted. A consumer that reads `method` gets an explicit null and the
       reason, rather than discovering the gap by finding no key. */
    method: null,
    methodAbsentReason: "the ESPN MMA scoreboard states no KO/SUB/DEC, and this product grades UFC through a winner-only settlement contract",
    fetchedAt,
  };
}

/** Every bout on a scoreboard payload. An event with no competitions yields an empty list. */
export function normalizeMmaScoreboard(payload, fetchedAt) {
  const out = [];
  for (const event of payload?.events ?? []) {
    for (const competition of event?.competitions ?? []) {
      out.push(normalizeMmaBout(competition, event, fetchedAt));
    }
  }
  return out;
}
