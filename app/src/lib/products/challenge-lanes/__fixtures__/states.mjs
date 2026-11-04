/**
 * TEST-ONLY synthetic lane states the Nov 2→3 replay cannot reach while P1 is open (no card can be staked): an IN PLAY
 * lane and a BUSTED lane, derived from the replay fixtures by editing their last day and re-sealing with the engine's
 * canonical digest. Tagged `fixture: true` and `synthetic: true`; the site loader refuses them. Used by the lane tests
 * and the gated /dev/challenge-lanes-fixture route only.
 */
import { canonical, sha256 } from "../../../challenge-lanes/chain.mjs";

const reseal = (doc) => { const { contentSha256: _c, ...rest } = doc; return { ...rest, contentSha256: sha256(canonical(rest)) }; };
const note = "TEST-ONLY SYNTHETIC STATE. Not a real lane record; no card has been staked while P1 is open.";

/** The replay's Nov 2 card, staked and in play: legs not yet settled. */
export function syntheticInPlay(fixture) {
  const doc = structuredClone(fixture);
  const run = doc.runs.at(-1);
  const day = { ...run.days[0], status: "IN_PLAY", reason: null, staked: true, modelCardResult: "PENDING", stepOutcome: null, legResults: run.days[0].legResults.map((r) => ({ ...r, outcome: "PENDING" })) };
  run.days = [day];
  run.events = [...run.events.slice(0, 2), { seq: 2, type: "PRICE_VERIFIED", date: day.date, step: 1, at: run.events[1].at, source: "SYNTHETIC", withheld: "P1" }, { seq: 3, type: "STAKE_SET", date: day.date, step: 1, at: run.events[1].at, source: "SYNTHETIC", withheld: null, stakeCents: doc.baseCents, placedWager: false }];
  Object.assign(run, { status: "IN_PLAY", statusReason: null, inPlay: true });
  doc.current = { ...doc.current, status: "IN_PLAY", statusReason: null, inPlay: true, trackedBankrollCents: doc.baseCents, trackedBankrollWithheld: null };
  return reseal({ ...doc, synthetic: true, fixtureNote: note });
}

/** The replay's Nov 2 card, staked and lost: step 1 busted, restart awaiting founder approval. */
export function syntheticBusted(fixture) {
  const doc = structuredClone(fixture);
  const run = doc.runs.at(-1);
  const day = { ...run.days[0], status: "AWAITING_RESTART_APPROVAL", reason: null, staked: true, stepOutcome: "LOSS" };
  run.days = [day];
  Object.assign(run, { status: "AWAITING_RESTART_APPROVAL", statusReason: "BUSTED_AT_STEP_1: the step 1 card lost.", inPlay: false });
  doc.current = { ...doc.current, status: "AWAITING_RESTART_APPROVAL", statusReason: run.statusReason, inPlay: false, trackedBankrollCents: 0, trackedBankrollWithheld: null };
  return reseal({ ...doc, synthetic: true, fixtureNote: note });
}
