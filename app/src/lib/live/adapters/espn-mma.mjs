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
import { LIVE_STATES, makeEnvelope } from "../contract.mjs";

/** ESPN's three bout states → the shared vocabulary. Anything else is UNKNOWN, never a guess. */
export function mapMmaState(status) {
  const t = status?.type ?? {};
  if (t.state === "post" || t.completed === true) return "FINAL";
  if (t.state === "in") {
    /*
     * ⚠ WALKOUTS ARE NOT LIVE — THE SAME RULE `mlb-statsapi.mjs` ALREADY KEEPS.
     *
     * Observed on the real card of 2026-09-26 at 21:10Z, ten minutes after the bout "started":
     *
     *   type.name "STATUS_FIGHTERS_WALKING" · description "Walkouts"
     *   state "in" · period 0 · clock 0.0 · displayClock "-"
     *   details[] "Walkout", "Walkout", "Fight Open"
     *
     * The fighters are walking to the cage. ESPN's `state` says `in` because the broadcast segment
     * has begun; the bout has not. MLB's adapter makes exactly this call for StatsAPI's "Warmup"
     * (abstract state "Live", coded state "P") after a production incident in which `/live`, the
     * game page and Since Your Last Visit all claimed a game was under way before a pitch was
     * thrown. The provider's own period is its statement that play has not begun.
     *
     * TWO PIECES OF EVIDENCE, AND THE STRUCTURAL ONE IS THE GENERAL RULE. The named state is what
     * was observed; a bout in progress is always in SOME round, so `period: 0` means it is not. The
     * error direction is deliberate: reading a not-yet-started bout as PRE understates liveness for
     * a few seconds, where the reverse tells a reader a fight is happening that is not.
     */
    const round = Number(status?.period);
    if (t.name === "STATUS_FIGHTERS_WALKING" || !Number.isFinite(round) || round < 1) return "PRE";
    return "LIVE";
  }
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

/**
 * One normalised bout → the shared LiveEventEnvelope the gateway serves (UFC-001 live hub).
 *
 * ⚠ THE BOUT IS THE ENVELOPE'S `eventId`, NEVER THE CARD. Every reader of the gateway (the slate
 * hook, `scopeSlate`, the lifecycle) keys on `eventId`, and the unit a UFC pick attaches to is the
 * bout (`ufc-tracked.mjs` says the same). The card id travels beside it as `cardEventId`.
 *
 * ROUND AND CLOCK ARE CARRIED ONLY WHEN THE PROVIDER STATED THEM, AND ONLY ONCE THE BOUT HAS BEGUN.
 * `normalizeMmaBout` already turns ESPN's `period: 0` and `displayClock: "-"` into null; on top of
 * that a PRE bout carries no period at all, because ESPN's scheduled payload says `period: 0` and a
 * walkout says `state: "in"` with period 0 — neither is a round anyone fought.
 *
 * NOTHING PROBABILISTIC CAN ENTER HERE: the envelope is the provider-owned middle row of the
 * contract, and `makeEnvelope` has no field a forecast could ride in on.
 */
export function mmaBoutEnvelope(bout) {
  const begun = bout?.state === "LIVE" || bout?.state === "DELAYED" || bout?.state === "FINAL";
  const envelope = makeEnvelope({
    eventId: bout?.boutId ?? null,
    sport: "ufc",
    provider: "espn_scoreboard",
    providerEventId: bout?.boutId ?? null,
    startTime: bout?.startTime ?? null,
    state: bout?.state,
    stateDetail: bout?.stateDetail ?? null,
    sourceUpdatedAt: null, // ESPN's scoreboard publishes no source timestamp; age is fetch age.
    fetchedAt: bout?.fetchedAt ?? null,
    period: begun && (bout?.round != null || bout?.clock != null)
      ? { number: bout?.round ?? null, clock: bout?.clock ?? null, label: null }
      : null,
    competitors: { fighters: (bout?.fighters ?? []).map((f) => ({ ...f })) },
  });
  return {
    ...envelope,
    cardEventId: bout?.eventId ?? null,
    cardName: bout?.eventName ?? null,
    /* The provider's word on the winner, by athlete id, and only once the bout is FINAL. This is
       NOT a settlement: a consumer may show it as "reported", never as a graded outcome. */
    winnerAthleteId: bout?.winnerAthleteId ?? null,
    method: null,
    methodAbsentReason: bout?.methodAbsentReason ?? null,
  };
}

/** Every bout on a scoreboard payload as a gateway envelope. */
export function normalizeMmaEnvelopes(payload, fetchedAt) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.events)) {
    // A body with no `events` array is not "an empty card" — it is a payload we cannot read.
    throw new Error("PROVIDER_MALFORMED");
  }
  return normalizeMmaScoreboard(payload, fetchedAt).map(mmaBoutEnvelope);
}
