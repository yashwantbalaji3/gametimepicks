/**
 * THE UFC ADAPTER (§9) — replayed against a REAL completed card.
 *
 * The bout fixtures are sanitized captures of the ESPN MMA scoreboard for UFC 331 (2026-09-19,
 * completed) and tonight's scheduled card (2026-09-26). A finished event is immutable, which is
 * what makes it a fixture rather than a live artifact; the scheduled one is used only for its PRE
 * shape, where the fields under test (no round, no clock, no winner) cannot change either.
 *
 * Run: cd app && npx tsx --test src/lib/live/adapters/ufc-tracked.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  MEASUREMENT_STATES as M, RAIL_STATE as R, FINALITY, SETTLEMENT_STATUS, MARKET_KIND,
  railStateOf, isResultState, buildTrackedPredictions,
} from "../tracked-prediction.mjs";
import { normalizeMmaScoreboard, normalizeMmaBout, mapMmaState } from "./espn-mma.mjs";
import { ufcTrackedRows, predictedWinnerAthleteId, UFC_FAMILIES } from "./ufc-tracked.mjs";

const FIX = (n) => JSON.parse(fs.readFileSync(path.join(process.cwd(), `src/lib/live/fixtures/${n}.json`), "utf8"));
const AT = "2026-09-26T20:25:00Z";
const finalBouts = normalizeMmaScoreboard(FIX("mma-scoreboard-final"), AT);
const preBouts = normalizeMmaScoreboard(FIX("mma-scoreboard-pre"), AT);
const liveBouts = normalizeMmaScoreboard(FIX("mma-scoreboard-live"), AT);

/** A card whose bouts are the REAL completed ones, so the replay is a real join. */
const card = (o = {}) => ({
  generatedAt: "2026-09-19T20:00:00Z",
  model: { id: "ufc-fight-model@e657fc40b64d", publishes: ["winner", "method", "rounds"],
           verdicts: { winner: "PASS", method: "PASS", round: "PASS" } },
  bouts: [
    { boutId: "401905382", scheduledRounds: 3,
      red: { athleteId: "3957071", name: "Giga Chikadze" },
      blue: { athleteId: "4422355", name: "Joanderson Brito" },
      /* The model picked the fighter who actually won. */
      prediction: { winner: { name: "Joanderson Brito", probability: 0.61 },
                    method: { most: "DEC" }, rounds: { endsIn: "3+" } } },
    { boutId: "401905381", scheduledRounds: 3,
      red: { athleteId: "4354318", name: "Edmen Shahbazyan" },
      blue: { athleteId: "5077131", name: "Brunno Ferreira" },
      /* And here it picked the fighter who lost. */
      prediction: { winner: { name: "Brunno Ferreira", probability: 0.58 },
                    method: { most: "KO" }, rounds: { endsIn: "1" } } },
    { boutId: "401903511", scheduledRounds: 3,
      red: { athleteId: "4699589", name: "Casey O'Neill" },
      blue: { athleteId: "5143888", name: "Eduarda Moura" },
      unmodelledReason: "Neither fighter has enough UFC history in our corpus to build a read from." },
  ],
  ...o,
});

const rows = (o = {}) => ufcTrackedRows({ card: card(), bouts: finalBouts, ...o });
const pick = (rs, boutId, family) => rs.find((r) => r.eventId === boutId && r.marketFamily === family);

/* ── the normaliser, on real payloads ───────────────────────────────────────────────────────── */

test("§9 · a completed bout states round, clock and a winner BY ESPN ATHLETE ID", () => {
  const b = finalBouts.find((x) => x.boutId === "401905382");
  assert.equal(b.state, "FINAL");
  assert.equal(b.round, 1);
  assert.equal(b.clock, "1:57");
  assert.equal(b.winnerAthleteId, "4422355");
  assert.equal(b.fighters.length, 2);
  for (const f of b.fighters) assert.ok(f.athleteId, "every fighter must carry an id");
});

test("⚠ the id is `competitor.id`; `competitor.athlete.id` does not exist", () => {
  /*
   * My first probe read `competitor.athlete.id`, found null on every fighter, and I was one step
   * from recording "UFC has no stable live identity" — which is exactly backwards. The id is one
   * level up, and it is present in PRE as well as POST.
   */
  const raw = FIX("mma-scoreboard-pre").events[0].competitions[0].competitors[0];
  assert.equal(raw.athlete.id, undefined, "the fixture must keep proving the nested id is absent");
  assert.ok(raw.id, "and that the real id is on the competitor");
  assert.equal(preBouts[0].fighters[0].athleteId, String(raw.id));
});

test("§3 · a scheduled bout is in NO round and has NO winner — not round 1, not a loss for both", () => {
  for (const b of preBouts) {
    assert.equal(b.state, "PRE");
    assert.equal(b.round, null, "a bout that has not started is in no round");
    assert.equal(b.clock, null);
    assert.equal(b.winnerAthleteId, null);
    /* ESPN sets `winner: false` on BOTH competitors before a bout. Reading it would report both
       fighters as having lost for the whole broadcast. */
    for (const f of b.fighters) assert.equal(f.winner, null);
  }
});

test("the method is stated as ABSENT with a reason, never omitted", () => {
  for (const b of finalBouts) {
    assert.equal(b.method, null);
    assert.match(b.methodAbsentReason, /no KO\/SUB\/DEC|winner-only/);
  }
});

test("an unknown provider state degrades to UNKNOWN rather than travelling on", () => {
  assert.equal(mapMmaState({ type: { state: "wat", name: "STATUS_WAT" } }), "UNKNOWN");
  assert.equal(mapMmaState(undefined), "UNKNOWN");
  assert.equal(mapMmaState({ type: { state: "pre", name: "STATUS_POSTPONED" } }), "PRE");
});

/* ── identity ───────────────────────────────────────────────────────────────────────────────── */

test("the predicted winner resolves to an id by EXACT equality inside the bout, or not at all", () => {
  const b = card().bouts[0];
  assert.equal(predictedWinnerAthleteId(b), "4422355");
  // Nothing is normalised. A near-miss is a refusal, because the moment it is not, this becomes
  // the name matching the live join exists to avoid.
  for (const name of ["joanderson brito", "J. Brito", "Joanderson  Brito", "", null]) {
    assert.equal(predictedWinnerAthleteId({ ...b, prediction: { winner: { name } } }), null, `resolved "${name}"`);
  }
});

test("an unresolvable predicted winner is IDENTITY_UNRESOLVED, never joined to a fighter", () => {
  const c = card();
  c.bouts[0].prediction.winner.name = "Someone Else";
  const r = pick(ufcTrackedRows({ card: c, bouts: finalBouts }), "401905382", "fight_winner");
  assert.equal(r.participantId, null);
  assert.equal(r.live.measurementState, M.IDENTITY_UNRESOLVED);
  assert.equal(isResultState(railStateOf(r)), false);
});

/* ── §3 · a bout the model could not read contributes no prediction ─────────────────────────── */

test("an unmodelled bout emits NO tracked prediction — UNKNOWN is not a forecast", () => {
  const rs = rows();
  assert.equal(rs.some((r) => r.eventId === "401903511"), false,
    "a bout with no forecast must not invite a reader to follow one");
  assert.equal(rs.length, 2 * Object.keys(UFC_FAMILIES).length, "two modelled bouts × three families");
});

/* ── §5.2 / §9 · provider final is not settlement ───────────────────────────────────────────── */

test("🔴 an ESPN `post` bout is PROVISIONAL — no win, no loss, not even for the correct pick", () => {
  /*
   * The model picked Joanderson Brito and Joanderson Brito won. The provider says so. This product
   * still may not: a decision can be reversed and a no-contest declared weeks later on a failed
   * test, and the settlement contract owns that, not the scoreboard.
   */
  const r = pick(rows(), "401905382", "fight_winner");
  assert.equal(r.final.finality, FINALITY.FINAL_PROVISIONAL);
  assert.equal(r.settlement.forecastResult, null);
  assert.equal(railStateOf(r), R.FINAL_AWAITING_SETTLEMENT);
  assert.equal(isResultState(railStateOf(r)), false);
});

test("a settlement record — and only that — produces the result, correct in both directions", () => {
  const settlement = {
    "401905382": { canonical: true, canonicalAt: "2026-09-20T02:10:00Z", status: SETTLEMENT_STATUS.SETTLED, forecastResult: "HIT" },
    "401905381": { canonical: true, canonicalAt: "2026-09-20T02:10:00Z", status: SETTLEMENT_STATUS.SETTLED, forecastResult: "MISS" },
  };
  const rs = rows({ settlement });
  assert.equal(railStateOf(pick(rs, "401905382", "fight_winner")), R.FINAL_WIN);
  assert.equal(railStateOf(pick(rs, "401905381", "fight_winner")), R.FINAL_LOSS);
  // And the model's own probability rode through untouched.
  assert.equal(pick(rs, "401905382", "fight_winner").pregame.modelProbability, 0.61);
});

/* ── the three families behave differently, on purpose ──────────────────────────────────────── */

test("§9 · method is MARKET_UNSUPPORTED everywhere, and carries the reason", () => {
  /*
   * The measurement state never changes — no feed states a method at any point in a bout's life.
   * The RAIL WORDS do, because tense matters: before and during, "not trackable live"; once the
   * event is over, the honest statement is that it ended without a measurement, which is also what
   * the row reads after settlement lands. Both are refusals; neither is ever a loss.
   */
  const settled = { "401905382": { canonical: true, canonicalAt: "x", status: SETTLEMENT_STATUS.SETTLED, forecastResult: "HIT" } };
  for (const [settlement, expected] of [[null, R.FINAL_NO_MEASUREMENT], [settled, R.FINAL_NO_MEASUREMENT]]) {
    const r = pick(rows({ settlement }), "401905382", "fight_method");
    assert.equal(r.live.measurementState, M.MARKET_UNSUPPORTED);
    assert.equal(railStateOf(r), expected);
    assert.equal(isResultState(railStateOf(r)), false, "an unmeasurable market may never carry a result");
    assert.equal(r.settlement.forecastResult, null);
    assert.match(r.pregame.provenance, /no KO\/SUB\/DEC/);
  }
  // Before the bout, the same row says the live column will never fill.
  const preCard = card({ bouts: [{ boutId: "401914472", scheduledRounds: 3,
    red: { athleteId: "4683395", name: "Vanessa Demopoulos" }, blue: { athleteId: "5063403", name: "Yazmin Jauregui" },
    prediction: { winner: { name: "Yazmin Jauregui", probability: 0.71 }, method: { most: "DEC" }, rounds: { endsIn: "3+" } } }] });
  const pre = pick(ufcTrackedRows({ card: preCard, bouts: preBouts }), "401914472", "fight_method");
  assert.equal(railStateOf(pre), R.NOT_LIVE_TRACKABLE);
});

test("§9 · rounds is MEASURED but UNGRADED — the round is observable, the outcome is not graded", () => {
  const settlement = { "401905382": { canonical: true, canonicalAt: "x", status: SETTLEMENT_STATUS.SETTLED, forecastResult: "HIT" } };
  const r = pick(rows({ settlement }), "401905382", "fight_rounds");
  assert.equal(r.live.measurementState, M.MEASURED);
  assert.equal(r.live.periodState, "R1", "the round is carried where the rail renders it");
  assert.equal(r.settlement.forecastResult, null);
  assert.equal(r.settlement.status, SETTLEMENT_STATUS.UNGRADED);
  assert.equal(railStateOf(r), R.FINAL_NO_MEASUREMENT, "ungraded is an honest unknown, never a loss");
  // ⚠ the winner's HIT must not leak sideways onto another family of the same bout.
  assert.notEqual(railStateOf(r), R.FINAL_WIN);
});

/* ── pregame, and the registry ──────────────────────────────────────────────────────────────── */

test("before the card, a modelled bout is AWAITING_EVENT with its frozen forecast intact", () => {
  const preCard = card({ bouts: [{
    boutId: "401914472", scheduledRounds: 3,
    red: { athleteId: "4683395", name: "Vanessa Demopoulos" },
    blue: { athleteId: "5063403", name: "Yazmin Jauregui" },
    prediction: { winner: { name: "Yazmin Jauregui", probability: 0.71 }, method: { most: "DEC" }, rounds: { endsIn: "3+" } },
  }] });
  const r = pick(ufcTrackedRows({ card: preCard, bouts: preBouts }), "401914472", "fight_winner");
  assert.equal(r.live.measurementState, M.AWAITING_EVENT);
  assert.equal(r.live.periodState, null);
  assert.equal(railStateOf(r), R.PRE);
  assert.equal(r.pregame.modelProbability, 0.71);
  assert.equal(r.participantId, "5063403");
  assert.equal(r.marketKind, MARKET_KIND.TERMINAL);
});

test("§6 · UFC is reachable through the registry and the bout is the event unit", () => {
  const out = buildTrackedPredictions("ufc", { card: card(), bouts: finalBouts });
  assert.equal(out.refused, null);
  assert.ok(out.rows.length > 0);
  for (const r of out.rows) {
    assert.notEqual(r.eventId, "600061266", "the CARD must never be the event id");
    assert.match(String(r.eventId), /^4019\d+$/, "the bout id is the event unit");
  }
});

test("🔴 §3 · a LIVE bout reporting period 0 is in NO round, and `-` is not a clock", () => {
  /*
   * ⚠ THE LIVE CARD FOUND THIS; THE FIXTURES DID NOT. A scheduled card and a completed one both
   * looked right with `state === "PRE"` as the only guard. On the real card of 2026-09-26 the first
   * bout went `in` while ESPN still reported `period: 0` and `displayClock: "-"`, and the tracked
   * row rendered `R0` — a round no bout has ever been in — with a dash for a clock.
   *
   * A row that says R0 is worse than a row that says nothing: it looks like a measurement.
   */
  assert.equal(liveBouts.length, 1);
  const b = liveBouts[0];
  assert.equal(b.state, "LIVE", "the fixture must actually be in progress, or this proves nothing");
  assert.equal(b.round, null, "period 0 is the provider saying 'not yet'");
  assert.equal(b.clock, null, "`-` is a placeholder, not a time");
  assert.equal(b.winnerAthleteId, null, "a live bout has no winner");

  // And it reaches the tracked row as absence, with the honest rail state.
  const card2 = card({ bouts: [{
    boutId: b.boutId, scheduledRounds: 3,
    red: { athleteId: b.fighters[0].athleteId, name: b.fighters[0].name },
    blue: { athleteId: b.fighters[1].athleteId, name: b.fighters[1].name },
    prediction: { winner: { name: b.fighters[1].name, probability: 0.64 }, method: { most: "DEC" }, rounds: { endsIn: "3+" } },
  }] });
  const r = pick(ufcTrackedRows({ card: card2, bouts: liveBouts }), b.boutId, "fight_winner");
  assert.equal(r.live.periodState, null, "no R0 may reach the row");
  assert.equal(r.live.clock, null);
  assert.equal(railStateOf(r), R.LIVE_UNRESOLVED, "§9's honest answer for a bout in progress");
});

test("a real round and clock still travel — the guard rejects placeholders, not values", () => {
  const withRound = normalizeMmaBout(
    { id: "1", status: { period: 2, displayClock: "3:41", type: { state: "in" } },
      competitors: [{ id: "a", athlete: { displayName: "A" } }, { id: "b", athlete: { displayName: "B" } }] },
    { id: "e" }, AT);
  assert.equal(withRound.round, 2);
  assert.equal(withRound.clock, "3:41");
});
