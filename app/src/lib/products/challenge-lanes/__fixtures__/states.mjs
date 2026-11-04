/**
 * TEST-ONLY synthetic lane states the Nov 2→3 replay cannot reach while P1 is open (no card can be staked, so no step can
 * settle): an ACTIVE lane on step 2 after a won step 1, and a LOST lane awaiting a founder-approved restart. Built from
 * the replay fixtures' own frozen cards, re-dated, then re-sealed with the engine's canonical digest. A won step's
 * bankroll stays withheld (P1), exactly as the engine projects it. Tagged `fixture: true` and `synthetic: true`; the
 * site loader refuses them. Used by the lane tests and the gated /dev/challenge-lanes-fixture route only.
 */
import { canonical, sha256 } from "../../../challenge-lanes/chain.mjs";

const reseal = (doc) => { const { contentSha256: _c, ...rest } = doc; return { ...rest, contentSha256: sha256(canonical(rest)) }; };
const note = "TEST-ONLY SYNTHETIC STATE. Not a real lane record; no card has been staked while P1 is open.";
const cardOf = (fixture) => structuredClone(fixture.runs[0].days.find((d) => d.card));
const results = (day, outcome) => day.card.legs.map((l, i) => ({ legId: l.legId, outcome: typeof outcome === "function" ? outcome(i) : outcome }));
const ev = (seq, type, date, step, extra = {}) => ({ seq, type, date, step, at: `${date}T18:00:00Z`, source: "SYNTHETIC", ...extra });

function lane(fixture, days, current, events) {
  const doc = structuredClone(fixture);
  const run = doc.runs.at(-1);
  run.days = days;
  run.events = [run.events[0], ...events];
  Object.assign(run, { status: current.status, statusReason: current.statusReason, step: current.step, stepText: `STEP ${current.step} OF ${doc.steps}`, inPlay: current.inPlay, stepsWon: days.filter((d) => d.stepOutcome === "WIN").length, trackedBankrollCents: null, trackedBankrollWithheld: "P1" });
  doc.current = { ...doc.current, ...current, stepText: `STEP ${current.step} OF ${doc.steps}`, trackedBankrollCents: null, trackedBankrollWithheld: "P1" };
  return reseal({ ...doc, synthetic: true, fixtureNote: note });
}

/** Step 1 (the lane's own Nov 2 card) won; step 2 (the other lane's Nov 2 card, re-dated Nov 3) staked and in play. */
export function syntheticActiveStep2(fixture, otherFixture) {
  const d1 = { ...cardOf(fixture), status: "READY", reason: null, staked: true, modelCardResult: "WIN", stepOutcome: "WIN" };
  d1.legResults = results(d1, "WIN");
  const d2 = { ...cardOf(otherFixture), date: "2026-11-03", step: 2, status: "IN_PLAY", reason: null, staked: true, modelCardResult: "PENDING", stepOutcome: null, receipts: [] };
  d2.legResults = results(d2, "PENDING");
  return lane(fixture, [d1, d2], { status: "IN_PLAY", statusReason: null, step: 2, inPlay: true }, [
    ev(1, "CARD_FROZEN", d1.date, 1), ev(2, "PAYOUT_COMPUTED", d1.date, 1, { withheld: "P1", result: "VERIFIED", refusals: null }),
    ev(3, "STEP_SETTLED", d1.date, 1, { outcome: "WIN", bankrollAfterCents: null, sha256: null }),
    ev(4, "CARD_FROZEN", d2.date, 2), ev(5, "STAKE_SET", d2.date, 2, { withheld: "P1", stakeCents: null, placedWager: false }),
  ]);
}

/** Step 1 won, step 2 lost on one leg: the lane is LOST, and a new run waits for a founder-approved restart. */
export function syntheticLostAwaitingRestart(fixture, otherFixture) {
  const d1 = { ...cardOf(fixture), status: "READY", reason: null, staked: true, modelCardResult: "WIN", stepOutcome: "WIN" };
  d1.legResults = results(d1, "WIN");
  const d2 = { ...cardOf(otherFixture), date: "2026-11-03", step: 2, status: "AWAITING_RESTART_APPROVAL", reason: null, staked: true, modelCardResult: "LOSS", stepOutcome: "LOSS", receipts: [] };
  d2.legResults = results(d2, (i) => (i === 1 ? "LOSS" : "WIN"));
  return lane(fixture, [d1, d2], { status: "AWAITING_RESTART_APPROVAL", statusReason: "BUSTED_AT_STEP_2: the step 2 card lost.", step: 2, inPlay: false }, [
    ev(1, "CARD_FROZEN", d1.date, 1), ev(2, "STEP_SETTLED", d1.date, 1, { outcome: "WIN", bankrollAfterCents: null, sha256: null }),
    ev(3, "CARD_FROZEN", d2.date, 2), ev(4, "STEP_SETTLED", d2.date, 2, { outcome: "LOSS", bankrollAfterCents: null, sha256: null }),
    ev(5, "STATUS", d2.date, 2, { status: "AWAITING_RESTART_APPROVAL", reason: "BUSTED_AT_STEP_2: the step 2 card lost." }),
  ]);
}
