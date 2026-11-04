/**
 * Bank Builder & Moonshot V2: the lane reader (bbm-lane.mjs), the cards (scripts/social/bbm-cards.mjs) and the package
 * path (scripts/social/render-bbm.mjs). Legs come from the committed 2026-11-01 lane through a suggested-cards file sealed
 * the way the engine seals it, so every team, game and probability is real. Every lane is an engine event log (append),
 * projected by the engine's laneProjection and folded by its laneDisplay: the graphics compute no lane state of their own.
 * Run: npx tsx --test src/lib/social/bbm-lane.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BADGE, BBM_LANES, RUNG, VIEW, laneView, pricedDay, projectionViolations, sealProjection } from "./bbm-lane.mjs";
import { append, laneState, runStarted } from "../challenge-lanes/lanes.mjs";
import { priceLane } from "../challenge-lanes/ops.mjs";
import { DISPLAY_AUTHORIZATION } from "../odds/display-authorization.mjs";
/** The committed record (founder 2026-11-04: NBA challengeGraphicsPrices on), and the same record with that switch off. */
const SOCIAL_ON = DISPLAY_AUTHORIZATION;
const PRICES_OFF = { ...DISPLAY_AUTHORIZATION, nba: { ...DISPLAY_AUTHORIZATION.nba, challengeGraphicsPrices: false } };
import { laneProjection } from "../challenge-lanes/projection.mjs";
import { laneDisplay } from "../challenge-lanes/display.mjs";
import { eloWinProbabilityOf } from "../sports/nba/elo-win-probability.mjs";
import { AWAITING, FACT_LINE, REMOVED_TEXT, SAMPLE_PRICE_RIBBON, TEST_RIBBON, bbmCard as bbmCardFor, verifyBbmCard } from "../../../scripts/social/bbm-cards.mjs";
import { CAPTION_PRICE_TEXT, LIVE_PACKAGES, engineCardFor, parityRow, xWeighted, packageCaption, planPackages, prepareLane, stagingViolations, writeStaging } from "../../../scripts/social/render-bbm.mjs";
import { visibleText } from "../../../scripts/social/nba-line-cards.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATE = "2026-11-01";
const NEXT = "2026-11-02";
const LANE_BYTES = fs.readFileSync(path.join(APP, "public/data/nba/experimental-public", `${DATE}.json`));
const LANE = JSON.parse(LANE_BYTES.toString("utf8"));
const LANE_SHA = crypto.createHash("sha256").update(LANE_BYTES).digest("hex");
const ms = (iso) => Date.parse(String(iso).replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
const FIRST = Math.min(...LANE.games.map((g) => ms(g.tipUtc)));
const AS_OF = new Date(FIRST - 4 * 3.6e6).toISOString().replace(".000Z", "Z");
const ROSTER = { __guard: {}, __cells: {} };

/** Favoured sides whose top-five rotation is clear at freeze, one per game. */
const clear = LANE.games.map((g) => ({ g, wp: eloWinProbabilityOf(g) })).filter(({ g, wp }) => wp && g.elo.state === "FAVOURED")
  .filter(({ g }) => { const side = g.elo.favoured === g.home.abbr ? "home" : "away"; return [...g.players[side]].sort((a, b) => b.expectedMinutes - a.expectedMinutes).slice(0, 5).every((p) => !p.injuryStatus); });
const engineLeg = ({ g, wp }) => {
  const side = g.elo.favoured === g.home.abbr ? "home" : "away";
  return { legId: `nba:${g.providerEventId}:winner`, sport: "nba", eventId: String(g.providerEventId), eventLabel: `${g.away.abbr} @ ${g.home.abbr}`, startUtc: g.tipUtc, market: "winner", selection: { code: side, label: `${g[side].abbr} (official side)`, teamAbbr: g[side].abbr }, status: "MODEL_ONLY", probability: side === "home" ? wp.home : 1 - wp.home, probabilityShown: `${side === "home" ? wp.homePct : wp.awayPct}%`, guard: { state: "pass", flags: [], flagText: [], rotationFlagged: [], outAtFreeze: [] } };
};
const seal = (f) => { const { contentSha256: _c, ...rest } = f; return { ...rest, contentSha256: crypto.createHash("sha256").update(JSON.stringify(rest)).digest("hex") }; };
const LEGS = clear.slice(0, 2).map(engineLeg);
const card = (id, tier) => ({ id, tier, legs: LEGS, jointProbability: 0.6, jointShown: "60.0%", status: "MODEL_ONLY", priced: false, price: null, payout: null });
const FILE = seal({
  schema: "gtp.suggested-cards@1", productDay: DATE, evaluatedAt: LANE.generatedAt, pricing: { state: "MODEL_ONLY" },
  inputs: [{ sport: "nba", file: `app/public/data/nba/experimental-public/${DATE}.json`, sha256: LANE_SHA, generatedAt: LANE.generatedAt }],
  legs: LEGS,
  bankBuilder: { nba: { policy: "nba-game-winner-tiers@1/bank-builder", state: "model-only", card: card("bb1", "low") } },
  moonshot: { nba: { policy: "nba-game-winner-tiers@1/moonshot", state: "model-only", card: card("ms1", "longshot") } },
});
const slate = (d) => { if (d !== DATE) throw new Error(`no slate ${d}`); return { file: FILE, lane: LANE, laneSha256: LANE_SHA }; };

/** The lane card as the engine freezes it (CARD_FROZEN.card): legs with the public guard only. */
const laneCard = (product, legs = LEGS, file = FILE) => ({ cardId: `${product}-1`, product, productDay: DATE, scope: "nba", tier: product === "moonshot" ? "longshot" : "low", evaluatedAt: LANE.generatedAt, suggestedCardsSchema: "gtp.suggested-cards@1", suggestedCardsSha256: file.contentSha256, jointProbability: 0.6, jointShown: "60.0%", legs: legs.map(({ sport: _s, eventId, status: _st, ...l }) => ({ ...l, gameId: eventId, guard: { state: l.guard.state, flags: l.guard.flags, flagText: l.guard.flagText } })) });
const at = (date, hh = "12") => `${date}T${hh}:00:00Z`;
const frozen = (laneId, o = {}) => ({ type: "CARD_FROZEN", date: DATE, step: 1, at: LANE.generatedAt, source: "test", product: BBM_LANES[laneId].product, packageId: BBM_LANES[laneId].packageId(o.date ?? DATE), mediaIndex: BBM_LANES[laneId].slot === "A" ? 0 : 1, suggestedCards: { sha256: FILE.contentSha256 }, card: laneCard(BBM_LANES[laneId].product), ...o });
const status = (date, step, st, reason = "test") => ({ type: "STATUS", date, step, at: at(date, "13"), source: "test", status: st, reason });
const unpriced = (date = DATE, step = 1) => status(date, step, "UNPRICED", "P1_PRICE_SOURCE_UNDECIDED");
const staked = (date = DATE, step = 1, stake = 10000) => ({ type: "PAYOUT_COMPUTED", date, step, at: at(date, "14"), source: "test", result: "VERIFIED", stakeCents: stake, grossPayoutCents: stake * 3, profitCents: stake * 2 });
const legSettled = (legId, outcome, date = DATE, step = 1) => ({ type: "LEG_SETTLED", date, step, at: at(date, "23"), source: "test", legId, gameId: legId.split(":")[1], outcome, final: null });
const stepSettled = (outcome, before, after, date = DATE, step = 1) => ({ type: "STEP_SETTLED", date, step, at: at(date, "23"), source: "test", outcome, bankrollBeforeCents: before, bankrollAfterCents: after });
/** The engine's projection of one lane whose run is `events` (default: today's card, unpriced). */
const projection = (laneId, events = null) => laneProjection(laneId, [(events ?? [frozen(laneId), unpriced()]).reduce((acc, e) => append(acc, e), [runStarted({ laneId, runId: "run-1", startedAt: LANE.generatedAt, approvedBy: "test" })])]);
const statusDoc = (laneId) => projection(laneId, [status(DATE, 1, "NO_ELIGIBLE_CARD", "NO_FROZEN_CARD_FILE: test")]);
/** As the projection will read once prices are approved: bankroll and pace unwithheld (fixture only). */
const unwithheld = (doc, cents, pace) => { const d = structuredClone(doc); const r = d.runs.at(-1); Object.assign(r, { trackedBankrollCents: cents, trackedBankrollWithheld: null, pace }); return sealProjection(d); };
const prep = (doc, o = {}) => prepareLane({ doc, date: DATE, slate, roster: ROSTER, asOf: AS_OF, ...o });
const textOf = (c) => visibleText(c.html.replace(/<script>[\s\S]*?<\/script>/g, " "));

test("projection: only a verified engine file with the lane's fixed terms is read", () => {
  const doc = projection("bb-a");
  assert.deepEqual(projectionViolations(doc), []);
  assert.match(projectionViolations({ ...doc, steps: 4 }).join(";"), /does not verify/);
  assert.match(projectionViolations(sealProjection({ ...doc, targetCents: 500000 })).join(";"), /targetCents 500000/);
  assert.match(projectionViolations(sealProjection({ ...doc, prices: { state: "SHOWN" } })).join(";"), /withholds prices/);
  assert.throws(() => laneView({ ...doc, laneId: "bb-c" }, DATE), /refused/);
});

test("lane view is laneDisplay: same step, rungs, status, bankroll and pace; latest day only; a won bankroll stays withheld", () => {
  for (const id of Object.keys(BBM_LANES)) {
    const doc = projection(id);
    const v = laneView(doc, DATE); const d = laneDisplay(doc, { date: DATE });
    assert.equal(v.view, VIEW.CARD); assert.equal(v.step, d.step); assert.deepEqual(v.rungs, d.rungs); assert.equal(v.badge, d.status); assert.equal(v.bankrollCents, d.trackedBankrollCents);
    assert.equal(v.badge, BADGE.HELD, "an unpriced card holds the lane");
    assert.equal(v.rungs.length, 5);
  }
  assert.equal(laneView(projection("ms-a", [frozen("ms-a")]), DATE).badge, BADGE.ACTIVE, "frozen and not yet priced reads ACTIVE");
  const two = projection("bb-b", [frozen("bb-b"), unpriced(), status(NEXT, 1, "NO_ELIGIBLE_CARD")]);
  assert.match(laneView(two, DATE).reason, /not the lane's latest day/);
  const n = laneView(two, NEXT);
  assert.equal(n.view, VIEW.NO_ELIGIBLE_CARD); assert.equal(n.badge, BADGE.HELD); assert.equal(n.step, 1);
  assert.equal(n.eventSha256, two.runs[0].events.at(-1).sha256, "drawn from the day's own STATUS event");
  const won = projection("bb-a", [frozen("bb-a"), staked(), ...LEGS.map((l) => legSettled(l.legId, "WIN")), stepSettled("WIN", 10000, 30000)]);
  const w = laneView(won, DATE);
  assert.equal(w.view, VIEW.WON); assert.equal(w.badge, BADGE.WON); assert.equal(w.bankrollCents, null); assert.equal(w.pace.state, "WITHHELD");
  const wc = prep(won);
  assert.equal(wc.refused, undefined, wc.refused);
  assert.equal(wc.card.cells["bank.tracked"], "WITHHELD"); assert.match(textOf(wc.card), /PACE WITHHELD UNTIL VERIFIED PRICES/);
  const lost = projection("bb-a", [frozen("bb-a"), staked(), legSettled(LEGS[0].legId, "WIN"), legSettled(LEGS[1].legId, "LOSS"), stepSettled("LOSS", 10000, 0), status(NEXT, 1, "BUSTED", "LANE A — BUSTED AT STEP 1 OF 5")]);
  const b = laneView(lost, NEXT);
  assert.equal(b.view, VIEW.BUSTED); assert.equal(b.badge, BADGE.LOST); assert.equal(b.step, 1); assert.equal(b.rungs[0].state, RUNG.FAILED);
});

test("lane card: it must name this sealed file and carry its legs at the same game, side, probability, flags and prop", () => {
  const c = laneCard("bank-builder");
  assert.ok(engineCardFor(c, FILE, "bank-builder").card);
  assert.match(engineCardFor({ ...c, suggestedCardsSha256: "f".repeat(64) }, FILE, "bank-builder").error, /names suggested-cards/);
  assert.match(engineCardFor({ ...c, legs: [{ ...c.legs[0], probability: 0.5 }, c.legs[1]] }, FILE, "bank-builder").error, /not the frozen file's/);
  assert.match(engineCardFor({ ...c, legs: [{ ...c.legs[0], guard: { flags: ["FAVOURED_ROTATION_R1"] } }, c.legs[1]] }, FILE, "bank-builder").error, /guard flags/);
  assert.match(engineCardFor({ ...c, legs: [{ ...c.legs[0], prop: { line: 9.5 } }, c.legs[1]] }, FILE, "bank-builder").error, /prop/);
  assert.match(engineCardFor({ ...c, legs: [{ ...c.legs[0], legId: "nba:0:winner" }] }, FILE, "bank-builder").error, /not in the frozen file/);
  assert.match(engineCardFor(c, { ...FILE, label: "edited" }, "bank-builder").error, /not sealed/);
  assert.match(engineCardFor(c, FILE, "moonshot").error, /not moonshot/);
});

test("cards: the removed banners and sentences are absent; badge, STEP, ladder, bankroll trio, pace, MODEL labels and the fact line print", () => {
  for (const laneId of Object.keys(BBM_LANES)) {
    const p = prep(projection(laneId));
    assert.equal(p.refused, undefined, p.refused);
    const t = textOf(p.card);
    for (const r of REMOVED_TEXT) assert.ok(!t.toLowerCase().includes(r.toLowerCase()), `${laneId}: ${r}`);
    for (const r of ["Model projections · Not betting advice", "MODEL-ONLY • NOT A SPORTSBOOK OFFER", "Both legs must land", "All 4 legs", "ESTIMATE", "est.", "projected median"]) assert.ok(!t.includes(r), `${laneId}: ${r}`);
    assert.match(t, /STEP 1 OF 5/); assert.match(t, /\bHELD\b/); assert.match(t, /STEP 1 · NEXT MILESTONE \$/); assert.doesNotMatch(t, /ON PACE/);
    for (const s of ["START", "TRACKED", "GOAL", "MODEL PROJECTION", "MODEL WIN PROBABILITY", "WAGER", "LADDER PROGRESS", FACT_LINE]) assert.ok(t.toUpperCase().includes(s.toUpperCase()), `${laneId}: ${s}`);
    for (const k of [1, 2, 3, 4, 5]) assert.ok(`ladder.m${k}` in p.card.cells);
    assert.ok(p.card.html.includes('class="logo"'), "the real logo");
    assert.deepEqual(verifyBbmCard(p.card), []);
  }
  const s = prep(statusDoc("bb-b"));
  assert.match(textOf(s.card), /NO QUALIFYING CARD TODAY.*STILL STEP 1 OF 5/); assert.match(textOf(s.card), /No frozen card for today/);
  assert.deepEqual(verifyBbmCard(s.card), []);
  const bad = prep(projection("bb-a")).card;
  assert.match(verifyBbmCard({ ...bad, html: bad.html.replace(FACT_LINE, `${FACT_LINE} · FOUNDER REVIEW ONLY`) }).join(";"), /removed text/);
  assert.match(verifyBbmCard({ ...bad, html: bad.html.replace(FACT_LINE, `${FACT_LINE} · Not betting advice`) }).join(";"), /removed text/);
  assert.match(verifyBbmCard({ ...bad, html: bad.html.replace(FACT_LINE, `${FACT_LINE} · odds +250`) }).join(";"), /price, line or odds/);
  assert.throws(() => bbmCardFor({ ...laneView(projection("bb-a"), DATE), badge: "PENDING" }, null), /public vocabulary/);
});

test("unpriced: every projected card prints AWAITING VERIFIED PRICES, is not staked, and flags its package", () => {
  const p = prep(projection("ms-a"));
  assert.equal(p.view.payout, null);
  assert.equal(p.card.cells["money.payout"], AWAITING);
  assert.equal(p.card.cells["money.wagerState"], "Not staked until priced");
  assert.ok(!("money.profit" in p.card.cells));
  const [plan] = planPackages([p, prep(projection("ms-b"))], DATE);
  assert.equal(plan.packageId, `ms-${DATE}`); assert.equal(plan.needsFounderReview, "unpriced");
  assert.match(verifyBbmCard({ ...p.card, priced: true }).join(";"), /verified payout is not shown/);
  const fake = { ...p.card, html: p.card.html.replace(AWAITING, "$300"), cells: { ...p.card.cells, "money.payout": "$300" } };
  assert.match(verifyBbmCard(fake).join(";"), /unpriced card must say/);
  assert.match(prep(projection("bb-a"), { samplePayout: { grossCents: 30000, profitCents: 20000 } }).refused, /labelled fixture/);
  assert.match(prep(projection("bb-a"), { samplePayout: { grossCents: 30000, profitCents: 25000, fixture: true } }).refused, /does not fit/);
});

test("fixture price: drawn only with the SAMPLE PRICE ribbon, and never written to a package", async () => {
  const p = prep(projection("bb-a"), { samplePayout: { grossCents: 30000, profitCents: 20000, fixture: true } });
  assert.equal(p.refused, undefined, p.refused);
  assert.equal(p.card.cells["money.payout"], "$300"); assert.equal(p.card.cells["money.profit"], "$200");
  assert.ok(textOf(p.card).includes(SAMPLE_PRICE_RIBBON));
  assert.match(verifyBbmCard({ ...p.card, html: p.card.html.replace(SAMPLE_PRICE_RIBBON, "") }).join(";"), /SAMPLE PRICE ribbon/);
  const plans = planPackages([p, prep(statusDoc("bb-b"))], DATE);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "bbm-"));
  assert.match(stagingViolations(plans, out).join(";"), /fixture price never reaches a package/);
  await assert.rejects(writeStaging(plans, { outRoot: out, browser: null }), /staging refused/);
  assert.deepEqual(fs.readdirSync(out), [], "nothing written");
  const t = prep(projection("ms-b"), { testData: true });
  assert.ok(textOf(t.card).includes(TEST_RIBBON));
  assert.match(stagingViolations(planPackages([t, prep(projection("ms-a"))], DATE), out).join(";"), /TEST lane history/);
  const clean = planPackages([prep(projection("bb-a")), prep(statusDoc("bb-b"))], DATE);
  assert.deepEqual(stagingViolations(clean, out), []);
  assert.match(stagingViolations(clean, LIVE_PACKAGES).join(";"), /live packages folder/);
  fs.rmSync(out, { recursive: true, force: true });
});

test("packages: exactly two posts with four ordered images (bb-a, bb-b; ms-a, ms-b); joint captions state each lane's step and status", () => {
  const all = [prep(projection("ms-b")), prep(projection("bb-b")), prep(statusDoc("ms-a")), prep(projection("bb-a"))];
  const plans = planPackages(all, DATE);
  assert.deepEqual(plans.map((p) => [p.packageId, p.lanes.map((l) => l.laneId)]), [[`ms-${DATE}`, ["ms-a", "ms-b"]], [`bb-${DATE}`, ["bb-a", "bb-b"]]]);
  assert.equal(plans.flatMap((p) => p.lanes).length, 4);
  assert.ok(!plans.some((p) => /^ms-[ab]-/.test(p.packageId)), "no retired ms-a-/ms-b- packages");
  assert.deepEqual(planPackages([prep(projection("bb-a")), prep(projection("ms-a"))], DATE), [], "no one-image post");
  const bb = plans.find((p) => p.packageId === `bb-${DATE}`).caption;
  assert.match(bb, /Lane A · (Held \(awaiting verification\)|Held) · Step 1 of 5/); assert.match(bb, /Lane B · /); assert.match(bb, /no real wager placed/);
  for (const p of plans) assert.ok(xWeighted(p.caption) <= 280, `${p.packageId} caption ${xWeighted(p.caption)}`);
  // An over-long caption is refused at staging.
  const outC = fs.mkdtempSync(path.join(os.tmpdir(), "bbm-"));
  assert.match(stagingViolations([{ ...plans[0], caption: "x".repeat(281) }], outC).join(";"), /X-weighted/);
  fs.rmSync(outC, { recursive: true, force: true });
  const msCap = plans.find((p) => p.packageId === `ms-${DATE}`).caption;
  assert.match(msCap, /Lane A · Held \(no qualifying card today\) · Still step 1 of 5/); assert.match(msCap, /Lane B · Held/);
  for (const p of plans) for (const w of [/odds/i, /parlay/i, /payout/i, /[+-]\d{3}\b/, /must land/i, /betting advice/i, /sportsbook/i]) assert.doesNotMatch(p.caption, w);
});

test("five-step ladder: engine milestones, pace and every status badge; A and B independent", () => {
  const v = laneView(projection("bb-a"), DATE);
  assert.deepEqual(v.rungs.map((r) => r.milestoneCents), [30000, 90000, 270000, 650000, 1000000]);
  assert.deepEqual(laneView(projection("ms-a"), DATE).rungs.map((r) => r.milestoneCents), [7500, 18000, 36000, 65000, 100000]);
  assert.equal(v.pace.state, "ON_PACE"); assert.equal(v.pace.nextMilestoneCents, 30000);
  assert.match(textOf(prep(projection("bb-a")).card), /STEP 1 · NEXT MILESTONE \$300/);
  // Step 1 won to $250 (below its $300 milestone), step 2 frozen and staked: behind pace, ACTIVE (fixture: post-P1 money).
  const ev2 = [frozen("bb-b"), staked(), ...LEGS.map((l) => legSettled(l.legId, "WIN")), stepSettled("WIN", 10000, 25000), frozen("bb-b", { date: NEXT, step: 2, packageId: `bb-${NEXT}` }), staked(NEXT, 2, 25000)];
  const behind = unwithheld(projection("bb-b", ev2), 25000, { withheld: null, milestoneCents: 30000, onPace: false, behindByCents: 5000, requiredMultiplier: null });
  const b = laneView(behind, NEXT);
  assert.equal(b.badge, BADGE.ACTIVE); assert.equal(b.step, 2); assert.deepEqual(b.rungs.map((r) => r.state), [RUNG.COMPLETED, RUNG.ACTIVE, RUNG.UPCOMING, RUNG.UPCOMING, RUNG.UPCOMING]);
  assert.deepEqual(b.pace, { state: "BEHIND", shortfallCents: 5000, milestoneCents: 30000, nextMilestoneCents: 90000 });
  const bc = prepareLane({ doc: behind, date: NEXT, slate, roster: ROSTER, asOf: AS_OF });
  assert.equal(bc.refused, undefined, bc.refused);
  assert.match(textOf(bc.card), /BEHIND PACE BY \$50 · MILESTONE \$300/);
  assert.equal(laneView(projection("bb-a"), DATE).step, 1, "the other lane is untouched");
  const five = (st) => projection("ms-b", [1, 2, 3, 4, 5].flatMap((k) => [stepSettled("WIN", 2500 * k, 2500 * (k + 1), `2026-10-2${k}`, k)]).concat([status("2026-10-26", 5, st)]));
  assert.equal(laneView(five("COMPLETE"), "2026-10-26").badge, BADGE.COMPLETED);
  const short = prepareLane({ doc: five("FINISHED_SHORT"), date: "2026-10-26", slate, roster: ROSTER, asOf: AS_OF });
  assert.equal(short.refused, undefined, short.refused);
  assert.equal(short.view.badge, BADGE.FINISHED_SHORT); assert.match(textOf(short.card), /FINISHED SHORT/);
  assert.equal(prep(statusDoc("bb-a")).card.badge, "HELD");
});

test("Bank Builder takes at most two legs (hard); prop legs print player, stat and MODEL PROJECTION, and a line only when priced", () => {
  const three = clear.slice(0, 3).map(engineLeg);
  if (three.length === 3) {
    const f3 = seal({ ...FILE, legs: three, contentSha256: undefined });
    const doc = projection("bb-a", [frozen("bb-a", { card: laneCard("bank-builder", three, f3) }), unpriced()]);
    assert.match(prepareLane({ doc, date: DATE, slate: () => ({ file: f3, lane: LANE, laneSha256: LANE_SHA }), roster: ROSTER, asOf: AS_OF }).refused, /3 legs/);
  }
  const seen = new Set(); const props = [];
  for (const g of LANE.games) for (const side of ["away", "home"]) {
    const p = [...(g.players?.[side] ?? [])].sort((x, y) => y.expectedMinutes - x.expectedMinutes)[0];
    if (props.length < 2 && p && !p.injuryStatus && typeof p.medians?.pts === "number" && !seen.has(g.providerEventId)) { seen.add(g.providerEventId); props.push({ legId: `nba:${g.providerEventId}:pts:${p.providerAthleteId}`, sport: "nba", eventId: String(g.providerEventId), eventLabel: `${g.away.abbr} @ ${g.home.abbr}`, startUtc: g.tipUtc, market: "player-prop", prop: { playerId: String(p.providerAthleteId), playerName: p.name, stat: "pts", side: "over", line: 19.5 }, selection: { code: side, teamAbbr: g[side].abbr }, probability: 0.55, probabilityShown: "55%", guard: { state: "pass", flags: [], flagText: [] } }); }
  }
  const fp = seal({ ...FILE, legs: props, contentSha256: undefined });
  const pc = laneCard("moonshot", props, fp);
  const pslate = () => ({ file: fp, lane: LANE, laneSha256: LANE_SHA });
  const doc = projection("ms-a", [frozen("ms-a", { card: pc })]);
  const p = prepareLane({ doc, date: DATE, slate: pslate, roster: ROSTER, asOf: AS_OF });
  assert.equal(p.refused, undefined, p.refused);
  const t = textOf(p.card);
  assert.ok(t.includes(props[0].prop.playerName)); assert.match(t, /Points chance/); assert.match(t, /55%/); assert.match(t, /MODEL PROJECTION/);
  assert.ok(!Object.keys(p.card.cells).some((k) => k.endsWith(".line")), "no line before a verified price");
  const priced = prepareLane({ doc, date: DATE, slate: pslate, roster: ROSTER, asOf: AS_OF, samplePayout: { grossCents: 30000, profitCents: 27500, fixture: true } });
  assert.equal(priced.refused, undefined, priced.refused);
  assert.ok(Object.entries(priced.card.cells).some(([k, v]) => k.endsWith(".line") && v === "OVER 19.5 PTS"));
  assert.match(verifyBbmCard({ ...priced.card, priced: false, samplePrice: false, html: priced.card.html.replace(SAMPLE_PRICE_RIBBON, "") }).join(";"), /line prints without a verified price/);
  const noProb = seal({ ...FILE, legs: props.map((l) => ({ ...l, probability: null })), contentSha256: undefined });
  const d2 = projection("ms-a", [frozen("ms-a", { card: laneCard("moonshot", props.map((l) => ({ ...l, probability: null })), noProb) })]);
  assert.match(prepareLane({ doc: d2, date: DATE, slate: () => ({ file: noProb, lane: LANE, laneSha256: LANE_SHA }), roster: ROSTER, asOf: AS_OF }).refused, /frozen file's probability/);
});

test("BUSTED: the losing card prints with its leg results and BUSTED AT STEP k OF N", () => {
  const doc = projection("bb-a", [frozen("bb-a"), staked(), legSettled(LEGS[0].legId, "WIN"), legSettled(LEGS[1].legId, "LOSS"), stepSettled("LOSS", 10000, 0), status(NEXT, 1, "BUSTED", "LANE A — BUSTED AT STEP 1 OF 5")]);
  const p = prepareLane({ doc, date: NEXT, slate, roster: ROSTER, asOf: AS_OF });
  assert.equal(p.refused, undefined, p.refused);
  const t = textOf(p.card);
  assert.match(t, /BUSTED AT STEP 1 OF 5/); assert.match(t, /LANDED/); assert.match(t, /MISSED/); assert.match(t, /\bLOST\b/);
  assert.deepEqual(verifyBbmCard(p.card), []);
});

/** The engine's own price step on a lane log (priceLane): it computes stake, combined price, payout and profit. */
const pricedEvents = (laneId, { provider = "FIXTURE-NOT-A-BOOK", book = "SAMPLE BOOK", odds = [-150, -200], events = null, preliminary = false } = {}) => {
  const ev = (events ?? [frozen(laneId)]).reduce((acc, e) => append(acc, e), [runStarted({ laneId, runId: "run-1", startedAt: LANE.generatedAt, approvedBy: "test" })]);
  const card = laneState(ev).open.cardEvent.card;
  const fetchedAt = new Date(FIRST - 2 * 3.6e6).toISOString().replace(".000Z", "Z");
  const price = { legs: card.legs.map((l, i) => ({ legId: l.legId, selectionCode: l.selection.code, provider, book, oddsFormat: "american", price: odds[i], fetchedAt })), parlay: { method: "LEG_PRODUCT", fetchedAt }, priceSnapshotSha256: "f".repeat(64) };
  const r = priceLane(ev, { date: DATE, at: fetchedAt, price, suggestedCards: FILE, permittedProviders: [provider], eligibleBooks: [book], preliminary });
  return { events: [...ev, ...r.events], action: r.action, payout: r.payout };
};

test("priced (founder 2026-11-04): odds, book, capture time, leg-product combined price, wager, payout and profit come only from the engine's events", async () => {
  const real = pricedEvents("bb-a", { provider: "the-odds-api", book: "DraftKings", odds: [-150, -200] });
  assert.equal(real.action, "PAYOUT_COMPUTED");
  const doc = laneProjection("bb-a", [real.events]);
  // With the challenge-graphics switch off, a real price prints as awaiting and cannot be packaged as priced.
  assert.equal(DISPLAY_AUTHORIZATION.nba.challengeGraphicsPrices, true, "founder 2026-11-04: on in the committed record");
  assert.notEqual(DISPLAY_AUTHORIZATION.nba.socialDisplay, true, "the social feed stays off");
  const gated = prep(doc, { privateEvents: real.events, displayRecord: PRICES_OFF });
  assert.equal(gated.card.cells["money.payout"], AWAITING); assert.ok(!Object.keys(gated.card.cells).some((k) => k.endsWith(".odds")));
  const p = prep(doc, { privateEvents: real.events, displayRecord: SOCIAL_ON });
  assert.equal(p.refused, undefined, p.refused);
  const pc = real.events.findLast((e) => e.type === "PAYOUT_COMPUTED");
  const t = textOf(p.card);
  assert.equal(p.card.cells["money.wager"], "$100"); assert.equal(p.card.cells["money.wagerState"], "Tracked stake");
  assert.equal(p.card.cells["money.payout"], `$${(pc.grossPayoutCents / 100).toFixed(2)}`.replace(/\.00$/, ""));
  assert.equal(p.card.cells["money.profit"], `$${(pc.profitCents / 100).toFixed(2)}`.replace(/\.00$/, ""));
  assert.match(p.card.cells["price.combined"], /^Combined \+\d+ · leg product$/);
  assert.match(p.card.cells["price.source"], /^Odds DraftKings · captured [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d\d [AP]M ET$/);
  assert.deepEqual(Object.entries(p.card.cells).filter(([k]) => k.endsWith(".odds")).map(([, v]) => v).sort(), ["-150", "-200"]);
  assert.equal(p.view.badge, BADGE.ACTIVE); assert.ok(!t.includes(SAMPLE_PRICE_RIBBON), "a real price carries no SAMPLE ribbon");
  assert.equal(p.view.payout.belowPace, pc.inputs.decimalPrice < pc.inputs.pace);
  if (p.view.payout.belowPace) assert.match(t, /THIS CARD PRICES BELOW PACE/);
  assert.deepEqual(verifyBbmCard(p.card), []);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "bbm-"));
  assert.deepEqual(stagingViolations(planPackages([p, prep(statusDoc("bb-b"))], DATE), out, { displayRecord: SOCIAL_ON }), [], "a verified real price may be packaged once social is authorized");
  assert.match(stagingViolations(planPackages([p, prep(statusDoc("bb-b"))], DATE), out, { displayRecord: PRICES_OFF }).join(";"), /authorizes/);
  assert.ok(textOf(p.card).includes("21+ · Gamble responsibly"));
  // The SAMPLE provider is a fixture: ribboned, and never packaged.
  const fx = pricedEvents("bb-a");
  const s = prep(laneProjection("bb-a", [fx.events]), { privateEvents: fx.events });
  assert.ok(textOf(s.card).includes(SAMPLE_PRICE_RIBBON));
  assert.match(stagingViolations(planPackages([s, prep(statusDoc("bb-b"))], DATE), out).join(";"), /fixture price never reaches a package/);
  fs.rmSync(out, { recursive: true, force: true });
});

test("priced refusals: another run's log, a refused payout, a broken chain, price text without a price; a same-game estimate is labelled", () => {
  const real = pricedEvents("bb-a", { provider: "the-odds-api", book: "DraftKings" });
  const other = projection("bb-a", [frozen("bb-a"), unpriced()]);
  assert.match(prep(other, { privateEvents: real.events }).refused, /not the run the public file projects/);
  const tampered = structuredClone(real.events); tampered.at(-1).grossPayoutCents += 100;
  assert.match(pricedDay(tampered, { date: DATE }).refused, /does not verify/);
  const refusedLog = [frozen("bb-a")].reduce((acc, e) => append(acc, e), [runStarted({ laneId: "bb-a", runId: "run-1", startedAt: LANE.generatedAt, approvedBy: "test" })]);
  const card = laneState(refusedLog).open.cardEvent.card;
  const bad = priceLane(refusedLog, { date: DATE, at: AS_OF, price: { legs: card.legs.map((l) => ({ legId: l.legId, selectionCode: l.selection.code, provider: "unknown-book", book: "X", oddsFormat: "american", price: -110, fetchedAt: AS_OF })), parlay: { method: "LEG_PRODUCT", fetchedAt: AS_OF }, priceSnapshotSha256: "f".repeat(64) }, suggestedCards: FILE, permittedProviders: ["the-odds-api"] });
  assert.equal(bad.action, "REFUSED");
  const rl = [...refusedLog, ...bad.events];
  assert.ok(pricedDay(rl, { date: DATE }).unpricedReason.startsWith("PAYOUT_COMPUTED REFUSED"));
  const p = prep(laneProjection("bb-a", [real.events]), { privateEvents: real.events, displayRecord: SOCIAL_ON });
  assert.match(verifyBbmCard({ ...p.card, priced: false }).join(";"), /price text prints without a verified price/);
  const v = { ...p.view, payout: { ...p.view.payout, estimate: true, method: "SAME_GAME_ESTIMATE" } };
  const est = bbmCardFor(v, p.combo);
  assert.match(est.cells["price.combined"], /^Estimate \+\d+$/); assert.ok(!est.cells["price.combined"].includes("leg product"));
});

test("preliminary prices (founder P0 2026-11-04): tagged on the image, flagged on the package, never shown as final", () => {
  const pre = pricedEvents("bb-a", { provider: "the-odds-api", book: "DraftKings", preliminary: true });
  assert.equal(pre.action, "PRELIMINARY");
  const p = prep(laneProjection("bb-a", [pre.events]), { privateEvents: pre.events, displayRecord: SOCIAL_ON });
  assert.equal(p.refused, undefined, p.refused);
  assert.equal(p.view.payout.preliminary, true);
  assert.equal(p.card.cells["money.wagerState"], "Stake once verified");
  // The near-window refresh (a VERIFIED price on the same day) supersedes it: the tag goes, the stake is real.
  const card = laneState(pre.events).open.cardEvent.card;
  const at2 = new Date(FIRST - 1 * 3.6e6).toISOString().replace(".000Z", "Z");
  const r2 = priceLane(pre.events, { date: DATE, at: at2, price: { legs: card.legs.map((l, i) => ({ legId: l.legId, selectionCode: l.selection.code, provider: "the-odds-api", book: "DraftKings", oddsFormat: "american", price: [-160, -200][i], fetchedAt: at2 })), parlay: { method: "LEG_PRODUCT", fetchedAt: at2 }, priceSnapshotSha256: "e".repeat(64) }, suggestedCards: FILE, permittedProviders: ["the-odds-api"], eligibleBooks: ["DraftKings"] });
  assert.equal(r2.action, "PAYOUT_COMPUTED");
  const ev2 = [...pre.events, ...r2.events];
  const v2 = prep(laneProjection("bb-a", [ev2]), { privateEvents: ev2, displayRecord: SOCIAL_ON });
  assert.equal(v2.refused, undefined, v2.refused);
  assert.equal(v2.view.payout.preliminary, false); assert.doesNotMatch(textOf(v2.card), /PRELIMINARY/);
  assert.notEqual(v2.card.html, p.card.html, "a changed price is a new image");
  assert.match(textOf(p.card), /PRELIMINARY PRICES · RE-VERIFIED BEFORE POSTING/);
  assert.deepEqual(verifyBbmCard(p.card), []);
  assert.match(verifyBbmCard({ ...p.card, preliminary: false }).join(";"), /preliminary tag on a verified price/);
  const [plan] = planPackages([p, prep(statusDoc("bb-b"))], DATE);
  assert.equal(plan.needsFounderReview, "preliminary-prices");
  // Captions carry the model's numbers, never a price, payout, line or book (PD 2026-11-04).
  assert.match(plan.caption, /Lane A · Active · Step 1 of 5\n\S+ \d+%, \S+ \d+%/); assert.ok(xWeighted(plan.caption) <= 280); assert.match(plan.caption, /Tracked challenge, no real wager placed/);
  assert.doesNotMatch(plan.caption, CAPTION_PRICE_TEXT);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "bbm-"));
  assert.deepEqual(stagingViolations([plan], out, { displayRecord: SOCIAL_ON }), []);
  assert.match(stagingViolations([{ ...plan, caption: `${plan.caption}\nDraftKings -128` }], out, { displayRecord: SOCIAL_ON }).join(";"), /caption carries price language/);
  fs.rmSync(out, { recursive: true, force: true });
  const fin = pricedEvents("bb-a", { provider: "the-odds-api", book: "DraftKings" });
  const f = prep(laneProjection("bb-a", [fin.events]), { privateEvents: fin.events, displayRecord: SOCIAL_ON });
  assert.equal(f.view.payout.preliminary, false); assert.doesNotMatch(textOf(f.card), /PRELIMINARY/);
  assert.equal(planPackages([f, prep(statusDoc("bb-b"))], DATE)[0].needsFounderReview, null);
});

test("parity (founder 2026-11-04: website = X): each lane's printed legs, step, bankroll, target, odds snapshot, payout and status match the engine record, or staging refuses", () => {
  const real = pricedEvents("bb-a", { provider: "the-odds-api", book: "DraftKings" });
  const doc = laneProjection("bb-a", [real.events]);
  const p = prep(doc, { privateEvents: real.events, displayRecord: SOCIAL_ON });
  assert.equal(p.refused, undefined, p.refused);
  assert.equal(p.parity.ok, true, p.parity.mismatches.join("; "));
  assert.deepEqual(p.parity.rendered, p.parity.engine);
  assert.equal(p.parity.rendered.legs.length, 2); assert.ok(p.parity.rendered.price.oddsSnapshotSha256);
  // The engine record read against another lane state: the row breaks and staging refuses.
  const other = sealProjection({ ...structuredClone(doc), runs: doc.runs.map((r) => ({ ...r, trackedBankrollCents: 12345, step: 2 })) });
  const broken = parityRow(p, { doc: other, privateEvents: real.events });
  assert.equal(broken.ok, false); assert.match(broken.mismatches.join(";"), /step|bankroll/);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "bbm-"));
  const plan = planPackages([p, prep(statusDoc("bb-b"))], DATE);
  assert.deepEqual(stagingViolations(plan, out, { displayRecord: SOCIAL_ON }), []);
  const noParity = plan.map((x) => ({ ...x, lanes: x.lanes.map((l) => ({ ...l, parity: undefined })) }));
  assert.match(stagingViolations(noParity, out, { displayRecord: SOCIAL_ON }).join(";"), /parity with the engine record is missing/);
  // A printed money cell that differs from the engine fails closed.
  const tampered = { ...p, card: { ...p.card, cells: { ...p.card.cells, "money.payout": "$999" } } };
  assert.match(parityRow(tampered, { doc, privateEvents: real.events }).mismatches.join(";"), /printed money.payout/);
  fs.rmSync(out, { recursive: true, force: true });
});
