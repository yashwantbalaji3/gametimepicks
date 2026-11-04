/**
 * Challenge lanes V2 on COMMITTED data: the 2026-11-02 NBA lane (the frozen Rule B card file is rebuilt from it) and the
 * committed finals record. Prices here are FIXTURES (provider "FIXTURE-NOT-A-BOOK"), never a bookmaker's.
 *   npx tsx --test src/lib/challenge-lanes/challenge-lanes.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildLegPool } from "../products/leg-pool/leg-pool.mjs";
import { dailySuggestedCards, sealSuggestedCards } from "../products/leg-pool/daily-cards.mjs";
import { canonical, chainEvent, verifyChain, eventSha, GENESIS, parseEvents, serializeEvents, sha256 } from "./chain.mjs";
import { LANES, STATUS, PUBLIC_STATUS, MILESTONES, selectLaneCards, laneState, runStarted, append, inPlay, publicStatusOf } from "./lanes.mjs";
import { americanToDecimal, decimalToAmerican, priceRatio, payoutCents, computePayout, paceFor, PERMITTED_PRICE_PROVIDERS } from "./payout.mjs";
import { prepareLane, unpricedLane, priceLane, reconcileLane, ingestReceipts, restartRun, P1_UNPRICED } from "./ops.mjs";
import { laneProjection, verifyLaneProjection, serializeProjection } from "./projection.mjs";
import { readLaneProjection, readAllLaneProjections } from "./public-reader.mjs";
import { laneDisplay } from "./display.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const REPO = path.resolve(APP, "..");
const DATE = "2026-11-02";
const LANE = JSON.parse(fs.readFileSync(path.join(REPO, `app/public/data/nba/experimental-public/${DATE}.json`), "utf8"));
const DOC = sealSuggestedCards(dailySuggestedCards(buildLegPool({ repoRoot: REPO, date: DATE, evaluatedAt: LANE.generatedAt })));
const FINALS = JSON.parse(fs.readFileSync(path.join(REPO, "app/public/data/nba/results/finals-2026-27.json"), "utf8"));
const SEL = { bb: selectLaneCards(DOC, "bank-builder"), ms: selectLaneCards(DOC, "moonshot") };
const FIX = "FIXTURE-NOT-A-BOOK";
const AT = LANE.generatedAt;
const abbrs = (card) => card.legs.map((l) => l.selection.teamAbbr);

const startRun = (laneId) => [runStarted({ laneId, runId: "run-1", startedAt: AT, approvedBy: "TEST (not an approval)" })];
const prepared = (laneId, date = DATE, selection = laneId.startsWith("bb") ? SEL.bb : SEL.ms) => {
  const ev = startRun(laneId);
  return [...ev, ...prepareLane(ev, { date, at: AT, selection, file: "test", docSha256: DOC.contentSha256 }).events];
};
/** A fixture price for every leg of a card, fetched 2 h before the first start. */
function fixturePrice(card, { american = -110, parlay = { method: "LEG_PRODUCT" }, fetchedAt } = {}) {
  const first = Math.min(...card.legs.map((l) => Date.parse(l.startUtc)));
  const t = fetchedAt ?? new Date(first - 2 * 3600e3).toISOString();
  return { legs: card.legs.map((l) => ({ legId: l.legId, selectionCode: l.selection.code, provider: FIX, book: FIX, oddsFormat: "american", price: typeof american === "function" ? american(l) : american, fetchedAt: t })), parlay: { ...parlay, fetchedAt: t }, priceSnapshotSha256: "f".repeat(64) };
}
const priced = (laneId, opts = {}, pOpts = {}) => {
  const ev = prepared(laneId);
  const card = laneState(ev).open.cardEvent.card;
  const r = priceLane(ev, { date: DATE, at: fixturePrice(card, pOpts).legs[0].fetchedAt, price: fixturePrice(card, pOpts), suggestedCards: DOC, permittedProviders: [FIX], ...opts });
  return { events: [...ev, ...r.events], r, card };
};
/** A finals record in which the lane's own legs won or lost as chosen (the committed record's rows, sides flipped). */
const finalsWith = (card, outcomes) => {
  const rows = FINALS.finals.map((r) => {
    const i = card.legs.findIndex((l) => l.gameId === r.providerEventId);
    if (i < 0) return r;
    const side = card.legs[i].selection.code;
    return { ...r, winnerSide: outcomes[i] === "WIN" ? side : side === "home" ? "away" : "home" };
  });
  return { ...FINALS, finals: rows, conflicts: [] };
};

/* ─────────── chain ─────────── */

test("chain: canonical bytes, genesis, verify, and every kind of tamper is caught", () => {
  assert.equal(canonical({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
  let ev = [chainEvent([], { type: "RUN_STARTED", x: 1 })];
  ev = append(ev, { type: "STATUS", status: "X" });
  ev = append(ev, { type: "STATUS", status: "Y" });
  assert.equal(ev[0].prevSha256, GENESIS);
  assert.equal(ev[1].prevSha256, ev[0].sha256);
  assert.equal(ev[2].sha256, eventSha(ev[2]));
  assert.deepEqual(verifyChain(ev), { ok: true });
  assert.deepEqual(parseEvents(serializeEvents(ev)), ev);
  assert.equal(verifyChain([ev[0], { ...ev[1], status: "Z" }, ev[2]]).reason, "SHA_MISMATCH");
  assert.equal(verifyChain([ev[0], ev[2]]).ok, false); // dropped line
  assert.equal(verifyChain([ev[0], ev[2], ev[1]]).ok, false); // reordered
});

/* ─────────── selection (D3) on the real 11-02 file ─────────── */

test("11-02: lane A is the frozen file's own card; lane B is game-disjoint, from the same engine and rule A", () => {
  assert.ok(SEL.bb.ok && SEL.ms.ok);
  assert.equal(SEL.bb.A.card.sourceCardId, DOC.bankBuilder.nba.card.id);
  assert.deepEqual(abbrs(SEL.bb.A.card), ["NY", "DEN"]);
  assert.deepEqual(abbrs(SEL.bb.B.card).sort(), ["DAL", "SA"]);
  assert.equal(SEL.bb.B.card.jointShown, "55.0%");
  assert.equal(SEL.ms.A.card.sourceCardId, DOC.moonshot.nba.card.id);
  assert.equal(SEL.ms.A.card.jointShown, "14.26%");
  for (const s of [SEL.bb, SEL.ms]) {
    const a = new Set(s.A.card.legs.map((l) => l.gameId));
    assert.ok(s.B.card.legs.every((l) => !a.has(l.gameId)), "A and B share no game");
    for (const c of [s.A.card, s.B.card]) assert.equal(c.suggestedCardsSha256, DOC.contentSha256);
  }
  for (const c of [SEL.bb.A.card, SEL.bb.B.card]) assert.ok(c.legs.every((l) => l.guard.flags.length === 0), "Bank Builder: no OUT, no R1");
  for (const c of [SEL.ms.A.card, SEL.ms.B.card]) assert.ok(c.legs.every((l) => !l.guard.flags.includes("FAVOURED_ROTATION_OUT")), "Moonshot: no OUT");
  assert.ok(SEL.ms.B.card.legs.some((l) => l.guard.flags.includes("FAVOURED_ROTATION_R1")), "R1 shown with its flag in Moonshot");
  for (const l of SEL.bb.A.card.legs) assert.ok(l.projection.snapshotId.startsWith(`app/public/data/nba/experimental-public/${DATE}.json#`) && /^[0-9a-f]{64}$/.test(l.projection.contentSha256));
  assert.deepEqual(selectLaneCards(DOC, "bank-builder"), SEL.bb, "deterministic");
});

test("selection refuses an altered or rule-A-off file, and never forces a lane B card", () => {
  assert.deepEqual(selectLaneCards({ ...DOC, productDay: "2026-11-03" }, "bank-builder"), { ok: false, refusal: "CARD_SHA_UNVERIFIED" });
  assert.deepEqual(selectLaneCards(sealSuggestedCards({ ...DOC, options: { ruleA: false } }), "bank-builder"), { ok: false, refusal: "RULE_A_OFF_IN_FILE" });
  const keep = new Set(DOC.bankBuilder.nba.card.legs.map((l) => l.eventId).concat(["401909907"]));
  const thin = sealSuggestedCards({ ...DOC, legs: DOC.legs.filter((l) => keep.has(l.eventId)) });
  const r = selectLaneCards(thin, "bank-builder");
  assert.ok(r.ok && r.A.card && r.B.card === null);
  assert.match(r.B.reason, /^Insufficient eligible legs/);
  const swapped = sealSuggestedCards({ ...DOC, legs: DOC.legs.map((l) => (l.eventId === DOC.bankBuilder.nba.card.legs[0].eventId ? { ...l, probability: 0.51 } : l)) });
  assert.deepEqual(selectLaneCards(swapped, "bank-builder"), { ok: false, refusal: "SELECTION_MISMATCH" });
});

/* ─────────── payout math ─────────── */

test("conversions and verified-calculation vectors (integer cents, floored, exact ratios)", () => {
  assert.equal(americanToDecimal(364), 4.64);
  assert.equal(americanToDecimal(109), 2.09);
  assert.equal(americanToDecimal(-200), 1.5);
  assert.equal(americanToDecimal(-110).toFixed(6), "1.909091");
  assert.equal(americanToDecimal(99), null);
  assert.equal(decimalToAmerican(4.64), 364);
  assert.equal(decimalToAmerican(1.5), -200);
  assert.equal(decimalToAmerican(2), 100);
  assert.deepEqual(payoutCents(10000, priceRatio("american", 364)), { grossPayoutCents: 46400, profitCents: 36400 });
  assert.deepEqual(payoutCents(10000, priceRatio("decimal", 4.64)), { grossPayoutCents: 46400, profitCents: 36400 });
  assert.deepEqual(payoutCents(10000, priceRatio("american", -150)), { grossPayoutCents: 16666, profitCents: 6666 });
  assert.deepEqual(payoutCents(2500, priceRatio("american", 109)), { grossPayoutCents: 5225, profitCents: 2725 });
  assert.equal(priceRatio("decimal", 0.55), null);
  assert.equal(priceRatio("decimal", 1.23456), null);
  assert.equal(paceFor({ targetCents: 1000000, bankrollCents: 10000, stepsRemaining: 5 }).toFixed(3), "2.512");
  assert.equal(paceFor({ targetCents: 1000000, bankrollCents: 10000, stepsRemaining: 3 }).toFixed(3), "4.642");
  assert.equal(paceFor({ targetCents: 100000, bankrollCents: 2500, stepsRemaining: 5 }).toFixed(3), "2.091");
});

test("a verified payout: two fixture legs at -110, leg product, $100 all-in → $364.46", () => {
  const { r, events } = priced("bb-a");
  assert.equal(r.action, "PAYOUT_COMPUTED");
  assert.equal(r.payout.grossPayoutCents, 36446); // 10000 × (210/110)² = 36446.28…
  assert.equal(r.payout.profitCents, 26446);
  assert.equal(r.payout.inputs.method, "LEG_PRODUCT");
  const s = laneState(events);
  assert.equal(s.status, STATUS.IN_PLAY);
  assert.ok(inPlay(s));
  assert.equal(events.find((e) => e.type === "STAKE_SET").placedWager, false);
  assert.ok(verifyChain(events).ok);
  const q = priced("ms-a", {}, { american: () => 150, parlay: { method: "BOOK_QUOTED_PARLAY", oddsFormat: "american", price: 2500, provider: FIX } });
  assert.equal(q.r.payout.grossPayoutCents, 65000); // $25 × 26.0
});

test("payout refusals: each named, none estimated", () => {
  const ev = prepared("bb-a");
  const cardEvent = laneState(ev).open.cardEvent;
  const card = cardEvent.card;
  const priceEv = (price) => chainEvent(ev, { type: "PRICE_VERIFIED", date: DATE, step: 1, at: AT, cardEventSha256: cardEvent.sha256, price });
  const run = (o) => computePayout({ events: ev, cardEvent, suggestedCards: DOC, priceEvent: priceEv(fixturePrice(card)), stakeCents: 10000, bankrollCents: 10000, ladder: { targetCents: 1000000, stepsRemaining: 5 }, permittedProviders: [FIX], ...o });
  const codes = (r) => (r.refusals ?? []).map((x) => x.code);
  assert.equal(run({}).ok, true);
  assert.deepEqual(codes(run({ priceEvent: null })), ["NO_PRICE_VERIFIED"]);
  assert.deepEqual(codes(run({ permittedProviders: PERMITTED_PRICE_PROVIDERS })), ["PROVIDER_NOT_PERMITTED"], "P1: nothing is permitted by default");
  const other = fixturePrice(card); other.legs[1] = { ...other.legs[1], legId: "nba:401909907:winner" };
  assert.ok(codes(run({ priceEvent: priceEv(other) })).includes("PRICE_LEGS_MISMATCH"));
  const flipped = fixturePrice(card); flipped.legs[0] = { ...flipped.legs[0], selectionCode: flipped.legs[0].selectionCode === "home" ? "away" : "home" };
  assert.ok(codes(run({ priceEvent: priceEv(flipped) })).includes("PRICE_LEGS_MISMATCH"));
  assert.deepEqual(codes(run({ priceEvent: priceEv(fixturePrice(card, { fetchedAt: card.legs[0].startUtc.replace("Z", ":00Z") })) })), ["PRICE_AFTER_FIRST_START"]);
  const first = Date.parse(card.legs[0].startUtc); // fixture prices are fetched 2 h before it
  assert.deepEqual(codes(run({ postScheduledAt: new Date(first - 3600e3).toISOString() })), [], "fetched 60 min before the post");
  assert.deepEqual(codes(run({ postScheduledAt: card.legs[0].startUtc })), ["PRICE_TOO_EARLY"], "fetched 120 min before the post");
  const out = { ...cardEvent, card: { ...card, legs: card.legs.map((l, i) => (i ? l : { ...l, guard: { ...l.guard, flags: ["FAVOURED_ROTATION_R1"] } })) } };
  assert.deepEqual(codes(run({ cardEvent: out })), ["LEG_INELIGIBLE_RULE_A"], "R1 in Bank Builder");
  assert.deepEqual(codes(run({ suggestedCards: { ...DOC, productDay: "x" } })), ["CARD_SHA_UNVERIFIED"]);
  assert.deepEqual(codes(run({ events: [ev[0], { ...ev[1], step: 2 }] })), ["CHAIN_BROKEN"]);
  const asProb = fixturePrice(card); asProb.legs = asProb.legs.map((l) => ({ ...l, oddsFormat: "decimal", price: card.legs.find((c) => c.legId === l.legId).probability }));
  assert.ok(codes(run({ priceEvent: priceEv(asProb) })).includes("MODEL_PROBABILITY_AS_PRICE"));
  const fair = fixturePrice(card); fair.legs = fair.legs.map((l) => ({ ...l, oddsFormat: "decimal", price: Math.round((1 / card.legs.find((c) => c.legId === l.legId).probability) * 1e4) / 1e4 }));
  assert.ok(codes(run({ priceEvent: priceEv(fair) })).includes("MODEL_PROBABILITY_AS_PRICE"), "1 / model chance on every leg is not a price");
  const oneFair = fixturePrice(card); oneFair.legs[0] = fair.legs[0];
  assert.ok(!codes(run({ priceEvent: priceEv(oneFair) })).includes("MODEL_PROBABILITY_AS_PRICE"), "one leg matching 1/p by chance is not refused");
  const model = fixturePrice(card); model.legs = model.legs.map((l) => ({ ...l, provider: "gtp-elo" }));
  assert.ok(codes(run({ priceEvent: priceEv(model) })).includes("MODEL_PROBABILITY_AS_PRICE"));
  assert.deepEqual(codes(run({ stakeCents: 5000 })), ["STAKE_NOT_BANKROLL"]);
  const short = (american) => priceEv(fixturePrice(card, { american }));
  assert.deepEqual(codes(run({ priceEvent: short(-300), strictPace: true })), ["BELOW_PACE"], "1.333² = 1.78 < 2.51 (rev 1 strict pace)");
  const allowed = run({ priceEvent: short(-300) });
  assert.ok(allowed.ok && allowed.inputs.belowPace === true, "rev 2: a below-pace card is allowed and the shortfall disclosed");
  assert.equal(run({}).inputs.belowPace, false, "1.909² = 3.64 ≥ 2.51");
  const bad = fixturePrice(card, { parlay: { method: "LEG_PRODUCT", oddsFormat: "american", price: 500 } });
  assert.ok(codes(run({ priceEvent: priceEv(bad) })).includes("BAD_PRICE"));
});

test("a refused price leaves the card unstaked: STATUS UNPRICED, same step, free tomorrow", () => {
  const { events, r } = priced("bb-a", { permittedProviders: [] });
  assert.equal(r.action, "REFUSED");
  const s = laneState(events);
  assert.equal(s.status, STATUS.UNPRICED);
  assert.equal(s.step, 1);
  assert.equal(inPlay(s), false);
});

/* ─────────── progression (§3) ─────────── */

test("only STEP_SETTLED(WIN) advances; IN PLAY blocks a new card; a new day never advances", () => {
  const { events, card } = priced("bb-a");
  const blocked = prepareLane(events, { date: "2026-11-04", at: AT, selection: SEL.bb });
  assert.equal(blocked.action, "SKIP");
  assert.match(blocked.reason, /^IN_PLAY: STEP 1 OF 5/);
  const half = { ...finalsWith(card, ["WIN", "WIN"]), finals: finalsWith(card, ["WIN", "WIN"]).finals.filter((f) => f.providerEventId !== card.legs[1].gameId) };
  const r1 = reconcileLane(events, { finalsRecord: half });
  assert.deepEqual(r1.held, [{ date: DATE, legId: card.legs[1].legId, state: "PENDING" }]);
  assert.equal(laneState([...events, ...r1.events]).step, 1, "one final is not a settled step");
  const all = [...events, ...r1.events, ...reconcileLane([...events, ...r1.events], { finalsRecord: finalsWith(card, ["WIN", "WIN"]) }).events];
  const s = laneState(all);
  assert.equal(s.step, 2);
  assert.equal(s.bankrollCents, 36446);
  assert.equal(s.status, STATUS.READY);
  assert.equal(reconcileLane(all, { finalsRecord: finalsWith(card, ["WIN", "WIN"]) }).events.length, 0, "idempotent");
});

test("LOSS → BUSTED, then AWAITING_RESTART_APPROVAL; never quietly reset", () => {
  const { events, card } = priced("bb-a");
  const r = reconcileLane(events, { finalsRecord: finalsWith(card, ["WIN", "LOSS"]) });
  assert.deepEqual(r.events.map((e) => e.type), ["LEG_SETTLED", "LEG_SETTLED", "STEP_SETTLED", "STATUS"]);
  assert.equal(r.events.at(-1).reason, "LANE A — BUSTED AT STEP 1 OF 5");
  const ev = [...events, ...r.events];
  const next = prepareLane(ev, { date: "2026-11-04", at: AT, selection: SEL.bb });
  assert.equal(next.action, STATUS.AWAITING_RESTART_APPROVAL);
  assert.match(next.reason, /^BUSTED AT STEP 1 OF 5 on 2026-11-02; a new run starts at \$100 only after a founder-approved restart/);
  assert.equal(prepareLane([...ev, ...next.events], { date: "2026-11-05", at: AT, selection: SEL.bb }).action, "SKIP");
  assert.throws(() => runStarted({ laneId: "bb-a", runId: "run-2", startedAt: AT, approvedBy: null }), /founder approval/);
});

test("VOID → PENDING_VOID_REVIEW (no auto-advance); reaching the target → COMPLETE", () => {
  const { events, card } = priced("bb-a");
  const fin = finalsWith(card, ["WIN", "WIN"]);
  const r = reconcileLane(events, { finalsRecord: fin });
  const voided = [...events, ...r.events.slice(0, 1), chainEvent([...events, ...r.events.slice(0, 1)], { ...r.events[1], seq: undefined, prevSha256: undefined, sha256: undefined, outcome: "VOID" })];
  const v = reconcileLane(voided, { finalsRecord: fin });
  assert.equal(v.events.at(-1).status, STATUS.PENDING_VOID_REVIEW);
  const s = laneState([...voided, ...v.events]);
  assert.equal(s.step, 1);
  assert.ok(inPlay(s));
  const big = priced("ms-a", {}, { american: () => 1000 }); // fixture: 11.0⁴ = 14641× → $25 → $366,025
  const done = reconcileLane(big.events, { finalsRecord: finalsWith(big.card, big.card.legs.map(() => "WIN")) });
  assert.equal(done.events.at(-1).status, STATUS.COMPLETE);
  assert.equal(laneState([...big.events, ...done.events]).status, STATUS.COMPLETE);
});

test("NO_ELIGIBLE_CARD and UNPRICED never consume a step", () => {
  let ev = startRun("bb-b");
  ev = [...ev, ...prepareLane(ev, { date: "2026-11-03", at: "2026-11-03T11:00:00Z", selection: null }).events];
  assert.equal(laneState(ev).status, STATUS.NO_ELIGIBLE_CARD);
  assert.match(ev.at(-1).reason, /^NO_FROZEN_CARD_FILE: .*STEP 1 OF 5 is unchanged\.$/);
  ev = [...ev, ...prepareLane(ev, { date: DATE, at: AT, selection: SEL.bb }).events];
  ev = [...ev, ...unpricedLane(ev, { date: DATE, at: AT }).events];
  assert.equal(ev.at(-1).reason, P1_UNPRICED);
  const s = laneState(ev);
  assert.deepEqual([s.step, s.status, inPlay(s)], [1, STATUS.UNPRICED, false]);
  const settled = reconcileLane(ev, { finalsRecord: FINALS });
  assert.ok(settled.events.every((e) => e.type === "LEG_SETTLED"), "an unstaked card's legs are settled for the record, no step");
  assert.equal(laneState([...ev, ...settled.events]).step, 1);
});

/* ─────────── receipts ─────────── */

test("POSTED receipts from the console's chained inbox are ingested once; bad ones are refused", () => {
  const ev = prepared("ms-b");
  const cardSha = laneState(ev).open.cardEvent.sha256;
  let inbox = [chainEvent([], { type: "POSTED", laneId: "ms-b", runId: "run-1", date: DATE, step: 1, at: "2026-11-02T20:00:00Z", source: "cc-console", refEventSha256: cardSha, packageId: "ms-2026-11-02", approvedVersionSha256: "a".repeat(64), xPostId: "123", url: "https://x.com/i/status/123", scheduledFor: "2026-11-02T20:00:00Z", postedAt: "2026-11-02T20:00:03Z" })];
  inbox = append(inbox, { type: "POSTED", laneId: "ms-a", runId: "run-1", date: DATE, step: 1, at: "x", source: "cc-console", refEventSha256: cardSha });
  inbox = append(inbox, { type: "STEP_SETTLED", laneId: "ms-b", runId: "run-1", date: DATE, step: 1, at: "x", source: "cc-console", refEventSha256: cardSha });
  const r = ingestReceipts(ev, inbox);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].receiptSha256, inbox[0].sha256);
  assert.deepEqual(r.refused.map((x) => x.reason), ["OTHER_LANE_OR_RUN", "TYPE_NOT_ALLOWED"]);
  assert.equal(ingestReceipts([...ev, ...r.events], inbox).events.length, 0, "idempotent");
  const gfx = (imagePath) => { const g = append([], { type: "GRAPHIC_RENDERED", laneId: "ms-b", runId: "run-1", date: DATE, step: 1, at: "x", source: "bb-social", refEventSha256: cardSha, packageId: "ms-2026-11-02", imageSha256: "b".repeat(64), imagePath }); return laneProjection("ms-b", [[...ev, ...ingestReceipts(ev, g).events]]).runs[0].days[0].receipts[0].imagePath; };
  assert.equal(gfx("/data/challenge-lanes/graphics/ms-b-2026-11-02-ms-b.png"), "/data/challenge-lanes/graphics/ms-b-2026-11-02-ms-b.png");
  for (const bad of ["https://evil.example/x.png", "/data/challenge-lanes/graphics/../../x.png", "/data/other/x.png", "/data/challenge-lanes/graphics/x.svg", undefined]) assert.equal(gfx(bad), null, String(bad));
  const pub = laneProjection("ms-b", [[...ev, ...r.events]]).runs[0].days[0].receipts[0];
  assert.deepEqual([pub.type, pub.xPostId, pub.packageId, pub.scheduledFor, pub.refEventSha256], ["POSTED", "123", "ms-2026-11-02", "2026-11-02T20:00:00Z", cardSha]);
  assert.match(ingestReceipts(ev, [inbox[0], { ...inbox[1], at: "y" }]).refused[0].reason, /^INBOX_CHAIN_BROKEN/);
});

/* ─────────── public projection ─────────── */

test("projection: deterministic, verifies, and carries no price or price-derived amount", () => {
  const { events } = priced("bb-a", {}, { american: () => -137 });
  const won = [...events, ...reconcileLane(events, { finalsRecord: finalsWith(laneState(events).open.cardEvent.card, ["WIN", "WIN"]) }).events];
  const p = laneProjection("bb-a", [won]);
  assert.ok(verifyLaneProjection(p));
  assert.equal(serializeProjection(p), serializeProjection(laneProjection("bb-a", [parseEvents(serializeEvents(won))])));
  const text = serializeProjection(p);
  for (const banned of [FIX, "-137", "oddsFormat", "fetchedAt", "grossPayout", "profitCents", "priceSnapshot", "decimalPrice", '"book"', String(laneState(won).bankrollCents)]) assert.ok(!text.includes(banned), `projection leaks ${banned}`);
  assert.equal(p.current.trackedBankrollCents, null);
  assert.equal(p.current.trackedBankrollWithheld, "P1");
  assert.equal(p.current.stepText, "STEP 2 OF 5");
  assert.ok(p.runs[0].events.filter((e) => ["PRICE_VERIFIED", "PAYOUT_COMPUTED"].includes(e.type)).every((e) => e.withheld === "P1" && !("sha256" in e)));
  assert.throws(() => laneProjection("bb-a", [[won[0], { ...won[1], step: 9 }]]), /chain broken/);
});

/* ─────────── SPEC revision 2 (§1–2, §10) ─────────── */

test("rev 2: four lanes, five steps each; Bank Builder max 2 legs; packages bb-<date> / ms-<date> with A first", () => {
  assert.deepEqual(Object.values(LANES).map((l) => [l.laneId, l.steps, l.baseCents, l.targetCents, l.maxLegs, l.packageId(DATE), l.mediaIndex]), [
    ["bb-a", 5, 10000, 1000000, 2, "bb-2026-11-02", 0], ["bb-b", 5, 10000, 1000000, 2, "bb-2026-11-02", 1],
    ["ms-a", 5, 2500, 100000, null, "ms-2026-11-02", 0], ["ms-b", 5, 2500, 100000, null, "ms-2026-11-02", 1]]);
  assert.deepEqual([...MILESTONES["bank-builder"]], [30000, 90000, 270000, 650000, 1000000]);
  assert.deepEqual([...MILESTONES.moonshot], [7500, 18000, 36000, 65000, 100000]);
  const f = prepared("bb-b").at(-1);
  assert.deepEqual([f.packageId, f.mediaIndex, f.card.legs.length], ["bb-2026-11-02", 1, 2]);
});

test("Bank Builder 2-leg max is a hard refusal (selection and payout)", () => {
  const three = sealSuggestedCards({ ...DOC, bankBuilder: { ...DOC.bankBuilder, nba: { ...DOC.bankBuilder.nba, card: { ...DOC.bankBuilder.nba.card, legs: [...DOC.bankBuilder.nba.card.legs, DOC.legs.find((l) => l.eventId === "401909911")] } } } });
  assert.equal(selectLaneCards(three, "bank-builder").ok, false);
  const ev = prepared("bb-a");
  const cardEvent = laneState(ev).open.cardEvent;
  const extra = { ...cardEvent.card.legs[0], legId: "nba:401909911:winner", gameId: "401909911" };
  const big = { ...cardEvent, card: { ...cardEvent.card, legs: [...cardEvent.card.legs, extra] } };
  const price = fixturePrice(big.card);
  const r = computePayout({ events: ev, cardEvent: big, suggestedCards: DOC, priceEvent: chainEvent(ev, { type: "PRICE_VERIFIED", cardEventSha256: big.sha256, price }), stakeCents: 10000, bankrollCents: 10000, ladder: { targetCents: 1000000, stepsRemaining: 5 }, permittedProviders: [FIX] });
  assert.deepEqual(r.refusals.map((x) => x.code), ["LEG_COUNT_EXCEEDED"]);
});

test("prop legs are line-bound; same-game legs need the book's whole-parlay price", () => {
  const ev = prepared("ms-a");
  const cardEvent = laneState(ev).open.cardEvent;
  const prop = (line) => ({ ...cardEvent.card.legs[0], legId: "nba:401909908:prop:4432166:pts", market: "player-prop", prop: { playerId: "4432166", playerName: "FIXTURE PLAYER", stat: "pts", side: "over", line } });
  const card = (legs) => ({ ...cardEvent, card: { ...cardEvent.card, legs } });
  const pay = (ce, price) => computePayout({ events: ev, cardEvent: ce, suggestedCards: DOC, priceEvent: chainEvent(ev, { type: "PRICE_VERIFIED", cardEventSha256: ce.sha256, price }), stakeCents: 2500, bankrollCents: 2500, ladder: { targetCents: 100000, stepsRemaining: 5 }, permittedProviders: [FIX] });
  const codes = (r) => (r.refusals ?? []).map((x) => x.code);
  const noLine = card([prop(null), ...cardEvent.card.legs.slice(1)]);
  assert.ok(codes(pay(noLine, fixturePrice(noLine.card))).includes("PROP_LINE_UNVERIFIED"), "no line → never priced (lane holds UNPRICED)");
  const withLine = card([prop(24.5), ...cardEvent.card.legs]); // the prop shares legs[0]'s game
  const atOther = fixturePrice(withLine.card); atOther.legs[0] = { ...atOther.legs[0], line: 22.5 };
  assert.ok(codes(pay(withLine, atOther)).includes("PROP_LINE_UNVERIFIED"), "priced at another line");
  const atLine = fixturePrice(withLine.card); atLine.legs[0] = { ...atLine.legs[0], line: 24.5 };
  assert.ok(codes(pay(withLine, atLine)).includes("SAME_GAME_NEEDS_PARLAY_PRICE"), "the prop shares a game with the moneyline leg");
  const quoted = { ...atLine, parlay: { method: "BOOK_QUOTED_PARLAY", oddsFormat: "american", price: 1200, provider: FIX, fetchedAt: atLine.legs[0].fetchedAt } };
  assert.deepEqual(codes(pay(withLine, quoted)), [], "the book's whole-parlay price settles the correlation");
  assert.equal(SEL.ms.A.card.legs.every((l) => l.market === "winner"), true, "the 11-02 file has no prop leg: no probability is derived from a median");
});

test("FINISHED SHORT after step 5 wins below target; A and B never move each other", () => {
  let ev = startRun("bb-a");
  for (let k = 1; k <= 5; k += 1) {
    const day = `2026-11-${String(k + 1).padStart(2, "0")}`;
    const sel = { ...SEL.bb, A: { card: { ...SEL.bb.A.card, legs: SEL.bb.A.card.legs.map((l) => ({ ...l, legId: `${l.legId}#${k}` })) }, reason: null } };
    ev = [...ev, ...prepareLane(ev, { date: day, at: AT, selection: sel }).events];
    const card = laneState(ev).open.cardEvent.card;
    ev = [...ev, ...priceLane(ev, { date: day, at: fixturePrice(card).legs[0].fetchedAt, price: fixturePrice(card, { american: -200 }), suggestedCards: DOC, permittedProviders: [FIX] }).events];
    ev = [...ev, ...reconcileLane(ev, { finalsRecord: finalsWith(SEL.bb.A.card, ["WIN", "WIN"]) }).events];
  }
  const s = laneState(ev);
  assert.equal(s.status, STATUS.FINISHED_SHORT, `status ${s.status} step ${s.step}`);
  assert.equal(publicStatusOf(s), PUBLIC_STATUS.FINISHED_SHORT);
  assert.equal(s.bankrollCents, 576648); // 2.25× per step, floored to the cent each step: $5,766.48, short of $10,000
  assert.equal(prepareLane(ev, { date: "2026-11-30", at: AT, selection: SEL.bb }).action, "SKIP");
  const b = prepared("bb-b");
  assert.deepEqual([laneState(b).step, laneState(b).bankrollCents], [1, 10000], "bb-b is untouched by bb-a's run");
});

test("public status vocabulary maps every internal code, with the reason kept", () => {
  const { events, card } = priced("bb-a");
  assert.equal(publicStatusOf(laneState(prepared("bb-a"))), PUBLIC_STATUS.ACTIVE);
  assert.equal(publicStatusOf(laneState(events)), PUBLIC_STATUS.ACTIVE);
  const won = [...events, ...reconcileLane(events, { finalsRecord: finalsWith(card, ["WIN", "WIN"]) }).events];
  assert.equal(publicStatusOf(laneState(won)), PUBLIC_STATUS.WON);
  const lost = [...events, ...reconcileLane(events, { finalsRecord: finalsWith(card, ["LOSS", "WIN"]) }).events];
  assert.equal(publicStatusOf(laneState(lost)), PUBLIC_STATUS.LOST);
  const unpriced = prepared("bb-a"); const u = [...unpriced, ...unpricedLane(unpriced, { date: DATE, at: AT }).events];
  assert.equal(publicStatusOf(laneState(u)), PUBLIC_STATUS.HELD);
  const p = laneProjection("bb-a", [u]);
  assert.deepEqual([p.current.publicStatus, p.current.status, p.current.statusReason], ["HELD", "UNPRICED", P1_UNPRICED]);
  assert.deepEqual(p.current.pace, { withheld: null, milestoneCents: 10000, requiredMultiplier: 2.5119, behindByCents: 0, onPace: true });
  assert.equal(laneProjection("bb-a", [won]).current.pace.withheld, "P1", "pace numbers reveal the bankroll, so they are withheld with it");
});

test("restart after BUSTED: a new run at base, the old run kept in the history", () => {
  const { events, card, r: pr } = priced("ms-a");
  assert.equal(pr.action, "PAYOUT_COMPUTED", JSON.stringify(pr.payout?.refusals));
  const lost = [...events, ...reconcileLane(events, { finalsRecord: finalsWith(card, card.legs.map((_, i) => (i ? "WIN" : "LOSS"))) }).events];
  const busted = [...lost, ...prepareLane(lost, { date: "2026-11-04", at: AT, selection: SEL.ms }).events];
  assert.equal(laneState(busted).status, STATUS.AWAITING_RESTART_APPROVAL);
  const ref = busted.at(-1).sha256; // the AWAITING_RESTART_APPROVAL status
  const rcpt = (o = {}) => append([], { type: "RESTART_APPROVED", laneId: "ms-a", runId: "run-1", date: "2026-11-05", step: 1, at: "2026-11-05T11:00:00Z", source: "cc-console", refEventSha256: ref, nextRunId: "run-2", approvedBy: "founder", ...o });
  assert.equal(restartRun(busted), null, "no restart without the receipt");
  assert.deepEqual(ingestReceipts(busted, rcpt({ nextRunId: "run-3" })).refused.map((x) => x.reason), ["RESTART_BAD_NEXT_RUN"]);
  assert.deepEqual(ingestReceipts(busted, rcpt({ refEventSha256: busted[1].sha256 })).refused.map((x) => x.reason), ["RESTART_BAD_REF"]);
  assert.deepEqual(ingestReceipts(events, append([], { type: "RESTART_APPROVED", laneId: "ms-a", runId: "run-1", date: DATE, step: 1, at: "x", source: "cc-console", refEventSha256: events[1].sha256, nextRunId: "run-2", approvedBy: "founder" })).refused.map((x) => x.reason), ["RESTART_NOT_AWAITED"], "only after LOST");
  const withRestart = [...busted, ...ingestReceipts(busted, rcpt()).events];
  const twice = append(rcpt(), { type: "RESTART_APPROVED", laneId: "ms-a", runId: "run-1", date: "2026-11-05", step: 1, at: "y", source: "cc-console", refEventSha256: ref, nextRunId: "run-2", approvedBy: "founder" });
  assert.deepEqual(ingestReceipts(withRestart, twice).refused.map((x) => x.reason), ["RESTART_ALREADY_APPROVED"], "once per run");
  const run2 = [restartRun(withRestart)];
  assert.deepEqual([run2[0].runId, run2[0].baseCents, run2[0].startedAt], ["run-2", 2500, "2026-11-05T11:00:00Z"]);
  assert.match(run2[0].approvedBy, /^founder via cc-console RESTART_APPROVED [0-9a-f]{64}$/);
  const p = laneProjection("ms-a", [withRestart, run2]);
  assert.deepEqual(p.runs.map((r) => [r.runId, r.publicStatus]), [["run-1", "LOST"], ["run-2", "HELD"]]);
  assert.deepEqual([p.current.runId, p.current.step, p.current.trackedBankrollCents], ["run-2", 1, 2500]);
  assert.equal(p.runs[0].days[0].stepOutcome, "LOSS");
});

test("one public reader for site and renderer: verified bytes or a named refusal", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lanes-pub-"));
  const doc = laneProjection("bb-a", [prepared("bb-a")]);
  fs.writeFileSync(path.join(dir, "bb-a.json"), serializeProjection(doc));
  fs.writeFileSync(path.join(dir, "bb-b.json"), serializeProjection({ ...doc, steps: 3 }));
  fs.writeFileSync(path.join(dir, "ms-a.json"), serializeProjection(doc));
  const all = readAllLaneProjections({ dir });
  assert.deepEqual(Object.keys(all), ["bb-a", "bb-b", "ms-a", "ms-b"]);
  assert.deepEqual(all["bb-a"], { ok: true, doc });
  assert.deepEqual([all["bb-b"].refusal, all["ms-a"].refusal, all["ms-b"].refusal], ["UNVERIFIED", "WRONG_LANE", "MISSING"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("laneDisplay: the one fold site and graphics share (rungs, status, pace, package)", () => {
  const rungs = (v) => v.rungs.map((r) => r.state).join(",");
  const a = laneDisplay(laneProjection("bb-b", [prepared("bb-b")]));
  assert.deepEqual([a.status, a.stepText, rungs(a), a.trackedBankrollCents, a.distanceToTargetCents, a.pace.state, a.day.packageId, a.day.mediaIndex], ["ACTIVE", "STEP 1 OF 5", "active,upcoming,upcoming,upcoming,upcoming", 10000, 990000, "on", "bb-2026-11-02", 1]);
  assert.deepEqual(a.rungs.map((r) => r.milestoneCents), [30000, 90000, 270000, 650000, 1000000]);
  assert.deepEqual([a.cleared, a.pace.nextMilestoneCents, a.day.sourceEventType], [0, 30000, "CARD_FROZEN"]);
  assert.equal(a.day.sourceEventSha256, prepared("bb-b").at(-1).sha256);
  const { events, card } = priced("bb-a");
  const won = laneDisplay(laneProjection("bb-a", [[...events, ...reconcileLane(events, { finalsRecord: finalsWith(card, ["WIN", "WIN"]) }).events]]));
  assert.deepEqual([won.status, won.step, rungs(won), won.trackedBankrollCents, won.distanceToTargetCents, won.pace.state], ["WON", 2, "completed,active,upcoming,upcoming,upcoming", null, null, "withheld"]);
  const lost = laneDisplay(laneProjection("bb-a", [[...events, ...reconcileLane(events, { finalsRecord: finalsWith(card, ["LOSS", "WIN"]) }).events]]));
  assert.deepEqual([lost.status, rungs(lost), lost.runs[0].endStatus], ["LOST", "failed,upcoming,upcoming,upcoming,upcoming", "LOST"]);
  assert.deepEqual([lost.step, lost.cleared, won.cleared, won.pace.nextMilestoneCents], [1, 0, 1, 90000], "LOST shows the busting step");
  const held = laneDisplay(laneProjection("bb-a", [[...startRun("bb-a"), ...prepareLane(startRun("bb-a"), { date: "2026-11-03", at: AT, selection: null }).events]]));
  assert.equal(held.day.sourceEventType, "STATUS");
  const forged = laneProjection("bb-a", [prepared("bb-a")]); const { contentSha256: _c, ...rest } = forged;
  const reseal = (d) => { const { contentSha256: _x, ...r } = d; return { ...r, contentSha256: sha256(canonical(r)) }; };
  assert.throws(() => laneDisplay(reseal({ ...rest, targetCents: 50000 })), /fixed terms/, "a resealed file with other terms is refused");
  const doc = laneProjection("ms-a", [prepared("ms-a")]);
  assert.throws(() => laneDisplay({ ...doc, steps: 3 }), /does not verify/);
  assert.equal(laneDisplay(doc, { date: "2026-11-09" }).day, null);
});

/* ─────────── CLIs: replay 11-02 → 11-03 on real data in a temp root ─────────── */

const cli = (name, args) => spawnSync("npx", ["tsx", path.join(APP, "scripts/challenge-lanes", `lanes-${name}.mjs`), ...args], { cwd: APP, encoding: "utf8" });

test("CLI replay: 11-02 cards, P1 stub, 11-03 (no slate), reconcile on the committed finals; re-run is byte-identical", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lanes-"));
  const cards = path.join(root, `cards-${DATE}.json`);
  fs.writeFileSync(cards, JSON.stringify(DOC));
  const pub = path.join(root, "public");
  const ok = (r) => { assert.equal(r.status, 0, r.stderr + r.stdout); return JSON.parse(r.stdout); };
  assert.equal(cli("prepare", ["--root", root, "--date", DATE, "--cards", cards]).status, 1, "no run without an approval reference");
  const a = ok(cli("prepare", ["--root", root, "--date", DATE, "--cards", cards, "--approved-by", "TEST"]));
  assert.deepEqual(Object.values(a.lanes).map((l) => l.action), ["CARD_FROZEN", "CARD_FROZEN", "CARD_FROZEN", "CARD_FROZEN"]);
  const b = ok(cli("price", ["--root", root, "--date", DATE, "--now", "2026-11-02T22:00:00Z"]));
  assert.deepEqual(Object.values(b.lanes).map((l) => l.action), ["UNPRICED", "UNPRICED", "UNPRICED", "UNPRICED"]);
  const c = ok(cli("prepare", ["--root", root, "--date", "2026-11-03", "--cards", path.join(root, "none.json"), "--now", "2026-11-03T11:00:00Z"]));
  assert.ok(Object.values(c.lanes).every((l) => l.action === "NO_ELIGIBLE_CARD"));
  const d = ok(cli("reconcile", ["--root", root, "--date", "2026-11-03", "--public-out", pub]));
  assert.deepEqual(d.lanes["bb-a"].settled, ["nba:401909910:winner WIN", "nba:401909918:winner LOSS"]);
  assert.ok(Object.values(d.lanes).every((l) => l.steps.length === 0 && l.step.startsWith("1/")), "nothing was staked, so nothing advanced or busted");
  const before = Object.fromEntries(fs.readdirSync(pub).map((f) => [f, fs.readFileSync(path.join(pub, f), "utf8")]));
  const again = ok(cli("reconcile", ["--root", root, "--date", "2026-11-03", "--public-out", pub]));
  assert.ok(Object.values(again.lanes).every((l) => l.settled.length === 0));
  for (const [f, t] of Object.entries(before)) assert.equal(fs.readFileSync(path.join(pub, f), "utf8"), t, `${f} byte-identical on re-run`);
  assert.equal(ok(cli("prepare", ["--root", root, "--date", DATE, "--cards", cards])).lanes["bb-a"].action, "SKIP");
  for (const laneId of Object.keys(LANES)) assert.ok(verifyChain(parseEvents(fs.readFileSync(path.join(root, laneId, "run-1.jsonl"), "utf8"))).ok);
  fs.rmSync(root, { recursive: true, force: true });
});

test("no provider is reachable: the lane code and CLIs contain no network call", () => {
  const files = [...fs.readdirSync(path.join(APP, "src/lib/challenge-lanes")).filter((f) => !f.endsWith(".test.mjs")).map((f) => path.join(APP, "src/lib/challenge-lanes", f)), ...fs.readdirSync(path.join(APP, "scripts/challenge-lanes")).map((f) => path.join(APP, "scripts/challenge-lanes", f))];
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /\bfetch\(|node:https?|from "https?"|odds-api|the-odds-api|ODDS_API/i, f);
});
