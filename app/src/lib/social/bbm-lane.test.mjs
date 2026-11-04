/**
 * Bank Builder & Moonshot V2: the lane reader (bbm-lane.mjs), the cards (scripts/social/bbm-cards.mjs) and the package
 * path (scripts/social/render-bbm.mjs). Legs come from the committed 2026-11-01 lane through a suggested-cards file sealed
 * the way the engine seals it, so every team, game and probability is real; lane histories are built here.
 * Run: npx tsx --test src/lib/social/bbm-lane.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BBM_LANES, RUNG, VIEW, laneView, projectionViolations, sealProjection } from "./bbm-lane.mjs";
import { eloWinProbabilityOf } from "../sports/nba/elo-win-probability.mjs";
import { AWAITING, FACT_LINE, REMOVED_TEXT, SAMPLE_PRICE_RIBBON, TEST_RIBBON, bbmCard as bbmCardFor, verifyBbmCard } from "../../../scripts/social/bbm-cards.mjs";
import { LIVE_PACKAGES, engineCardFor, packageCaption, planPackages, prepareLane, stagingViolations, writeStaging } from "../../../scripts/social/render-bbm.mjs";
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

/** The lane card as the engine projects it (days[].card): legs with the public guard only. */
const laneCard = (product, legs = LEGS) => ({ cardId: `${product}-1`, product, productDay: DATE, scope: "nba", tier: product === "moonshot" ? "longshot" : "low", evaluatedAt: LANE.generatedAt, suggestedCardsSchema: "gtp.suggested-cards@1", suggestedCardsSha256: FILE.contentSha256, jointProbability: 0.6, jointShown: "60.0%", legs: legs.map((l) => ({ legId: l.legId, gameId: l.eventId, eventLabel: l.eventLabel, startUtc: l.startUtc, market: "winner", selection: l.selection, probability: l.probability, probabilityShown: l.probabilityShown, guard: { state: l.guard.state, flags: l.guard.flags, flagText: l.guard.flagText } })) });
const day = (o) => ({ date: DATE, step: 1, status: "UNPRICED", reason: "P1_PRICE_SOURCE_UNDECIDED", staked: false, card: null, cardEventSha256: "c".repeat(64), legResults: [], modelCardResult: null, stepOutcome: null, receipts: [], ...o });
/** A sealed public projection for one lane: by default the run's one day is today's unpriced card. */
function projection(laneId, days = null, run = {}) {
  const L = BBM_LANES[laneId];
  const ds = days ?? [day({ card: laneCard(L.product) })];
  return sealProjection({
    schema: "gtp.challenge-lane.public@1", laneId, product: L.product, slot: L.letter, baseCents: L.baseCents, targetCents: L.targetCents, steps: L.steps, label: "Tracked challenge · no real wager placed", projectionLabel: "MODEL PROJECTION",
    prices: { state: "WITHHELD_P1", note: "withheld" },
    current: { runId: "run-1", status: "UNPRICED", step: 1, stepText: `STEP 1 OF ${L.steps}`, inPlay: false, trackedBankrollCents: L.baseCents, trackedBankrollWithheld: null },
    runs: [{ runId: "run-1", startedAt: LANE.generatedAt, approvedBy: "test", steps: L.steps, trackedBankrollCents: L.baseCents, trackedBankrollWithheld: null, days: ds, events: [{ seq: 1, type: "STATUS", date: NEXT, status: "NO_ELIGIBLE_CARD", sha256: "e".repeat(64) }], ...run }],
  });
}
const statusDoc = (laneId) => projection(laneId, [day({ date: DATE, status: "NO_ELIGIBLE_CARD", cardEventSha256: null })], { events: [{ seq: 1, type: "STATUS", date: DATE, status: "NO_ELIGIBLE_CARD", sha256: "e".repeat(64) }] });
const prep = (doc, o = {}) => prepareLane({ doc, date: DATE, slate, roster: ROSTER, asOf: AS_OF, ...o });
const textOf = (c) => visibleText(c.html.replace(/<script>[\s\S]*?<\/script>/g, " "));

test("projection: the engine's seal, the lane's fixed terms and withheld prices are checked", () => {
  const doc = projection("bb-a");
  assert.deepEqual(projectionViolations(doc), []);
  assert.match(projectionViolations({ ...doc, steps: 4 }).join(";"), /contentSha256/);
  assert.match(projectionViolations(sealProjection({ ...doc, targetCents: 500000 })).join(";"), /targetCents 500000/);
  assert.match(projectionViolations(sealProjection({ ...doc, prices: { state: "SHOWN" } })).join(";"), /withholds prices/);
  assert.throws(() => laneView({ ...doc, laneId: "bb-c" }, DATE), /refused/);
});

test("lane view: step and rungs from settled steps only; a loss busts; an unpriced day never advances; a won bankroll stays withheld", () => {
  const v = laneView(projection("ms-a"), DATE);
  assert.equal(v.view, VIEW.CARD); assert.equal(v.step, 1); assert.equal(v.bankrollCents, 2500); assert.equal(v.staked, false);
  assert.deepEqual(v.rungs.map((r) => r.state), [RUNG.ACTIVE, RUNG.UPCOMING, RUNG.UPCOMING, RUNG.UPCOMING, RUNG.UPCOMING]);
  const next = projection("bb-b", [day({ card: laneCard("bank-builder") }), day({ date: NEXT, status: "NO_ELIGIBLE_CARD", cardEventSha256: null })]);
  const n = laneView(next, NEXT);
  assert.equal(n.view, VIEW.NO_ELIGIBLE_CARD); assert.equal(n.step, 1); assert.equal(n.eventSha256, "e".repeat(64));
  const staked = projection("bb-b", [day({ card: laneCard("bank-builder"), staked: true, status: "IN_PLAY" }), day({ date: NEXT, status: "NO_ELIGIBLE_CARD", cardEventSha256: null })]);
  assert.equal(laneView(staked, NEXT).view, VIEW.IN_PLAY, "a staked step that has not settled holds the lane");
  const won = projection("bb-a", [day({ card: laneCard("bank-builder"), staked: true, stepOutcome: "WIN" }), day({ date: NEXT, step: 2, status: "NO_ELIGIBLE_CARD", cardEventSha256: null })], { trackedBankrollCents: null, trackedBankrollWithheld: "P1" });
  const w = laneView(won, NEXT);
  assert.equal(w.view, null); assert.match(w.reason, /withheld \(P1\)/);
  const lost = projection("bb-a", [day({ card: laneCard("bank-builder"), staked: true, stepOutcome: "LOSS", legResults: LEGS.map((l, i) => ({ legId: l.legId, outcome: i ? "LOSS" : "WIN" })) }), day({ date: NEXT, status: "BUSTED", reason: "LANE A — BUSTED AT STEP 1 OF 5", cardEventSha256: null })]);
  const b = laneView(lost, NEXT);
  assert.equal(b.view, VIEW.BUSTED); assert.equal(b.step, 1); assert.equal(b.bankrollCents, 0); assert.equal(b.rungs[0].state, RUNG.FAILED);
});

test("lane card: it must name this sealed file and carry its legs at the same game, side, probability and flags", () => {
  const c = laneCard("bank-builder");
  assert.ok(engineCardFor(c, FILE, "bank-builder").card);
  assert.match(engineCardFor({ ...c, suggestedCardsSha256: "f".repeat(64) }, FILE, "bank-builder").error, /names suggested-cards/);
  assert.match(engineCardFor({ ...c, legs: [{ ...c.legs[0], probability: 0.5 }, c.legs[1]] }, FILE, "bank-builder").error, /not the frozen file's/);
  assert.match(engineCardFor({ ...c, legs: [{ ...c.legs[0], guard: { flags: ["FAVOURED_ROTATION_R1"] } }, c.legs[1]] }, FILE, "bank-builder").error, /guard flags/);
  assert.match(engineCardFor({ ...c, legs: [{ ...c.legs[0], legId: "nba:0:winner" }] }, FILE, "bank-builder").error, /not in the frozen file/);
  assert.match(engineCardFor(c, { ...FILE, label: "edited" }, "bank-builder").error, /not sealed/);
  assert.match(engineCardFor(c, FILE, "moonshot").error, /not moonshot/);
});

test("cards: the removed banners and sentences are absent; STEP, ladder, bankroll trio, MODEL labels and the fact line print", () => {
  for (const laneId of Object.keys(BBM_LANES)) {
    const p = prep(projection(laneId));
    assert.equal(p.refused, undefined, p.refused);
    const t = textOf(p.card);
    for (const r of REMOVED_TEXT) assert.ok(!t.toLowerCase().includes(r.toLowerCase()), `${laneId}: ${r}`);
    for (const r of ["Model projections · Not betting advice", "MODEL-ONLY • NOT A SPORTSBOOK OFFER", "Both legs must land", "All 4 legs", "ESTIMATE", "est.", "projected median"]) assert.ok(!t.includes(r), `${laneId}: ${r}`);
    assert.match(t, /STEP 1 OF 5/);
    for (const s of ["START", "TRACKED", "GOAL", "MODEL PROJECTION", "MODEL WIN PROBABILITY", "WAGER", "LADDER PROGRESS", FACT_LINE]) assert.ok(t.toUpperCase().includes(s.toUpperCase()), `${laneId}: ${s}`);
    assert.ok(p.card.html.includes('class="logo"'), "the real logo");
    assert.deepEqual(verifyBbmCard(p.card), []);
  }
  const s = prep(statusDoc("bb-b"));
  assert.match(textOf(s.card), /NO QUALIFYING CARD TODAY.*STILL STEP 1 OF 5/);
  assert.deepEqual(verifyBbmCard(s.card), []);
  const bad = prep(projection("bb-a")).card;
  assert.match(verifyBbmCard({ ...bad, html: bad.html.replace(FACT_LINE, `${FACT_LINE} · FOUNDER REVIEW ONLY`) }).join(";"), /removed text/);
  assert.match(verifyBbmCard({ ...bad, html: bad.html.replace(FACT_LINE, `${FACT_LINE} · Not betting advice`) }).join(";"), /removed text/);
  assert.match(verifyBbmCard({ ...bad, html: bad.html.replace(FACT_LINE, `${FACT_LINE} · odds +250`) }).join(";"), /price, line or odds/);
});

test("unpriced: every projected card prints AWAITING VERIFIED PRICES, is not staked, and flags its package", () => {
  const p = prep(projection("ms-a"));
  assert.equal(p.view.payout, null);
  assert.equal(p.card.cells["money.payout"], AWAITING);
  assert.equal(p.card.cells["money.wagerState"], "Not staked until priced");
  assert.ok(!("money.profit" in p.card.cells));
  const [plan] = planPackages([p, prep(projection("ms-b"))], DATE);
  assert.equal(plan.packageId, `ms-${DATE}`); assert.equal(plan.needsFounderReview, "unpriced");
  assert.equal(p.card.badge, "HELD", "an unpriced card holds the lane (SPEC rev. 2 §4.6)");
  assert.match(verifyBbmCard({ ...p.card, priced: true }).join(";"), /verified payout is not shown/);
  const fake = { ...p.card, html: p.card.html.replace(AWAITING, "$300"), cells: { ...p.card.cells, "money.payout": "$300" } };
  assert.match(verifyBbmCard(fake).join(";"), /unpriced card must say/);
  // A payout that is not a labelled fixture, or does not fit the stake, is refused.
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
  assert.equal(plans.find((p) => p.packageId === `ms-${DATE}`).needsFounderReview, "unpriced");
  assert.deepEqual(planPackages([prep(projection("bb-a")), prep(projection("ms-a"))], DATE), [], "no one-image post");
  const bb = plans.find((p) => p.packageId === `bb-${DATE}`).caption;
  assert.match(bb, /Lane A · Held \(awaiting verified prices\) · Step 1 of 5/); assert.match(bb, /Lane B · Held \(awaiting verified prices\) · Step 1 of 5/); assert.match(bb, /no real wager placed/);
  const msCap = plans.find((p) => p.packageId === `ms-${DATE}`).caption;
  assert.match(msCap, /Lane A · Held \(no qualifying card today\) · Still step 1 of 5/); assert.match(msCap, /Lane B · Held/);
  for (const p of plans) for (const w of [/odds/i, /parlay/i, /payout/i, /[+-]\d{3}\b/, /must land/i, /betting advice/i, /sportsbook/i]) assert.doesNotMatch(p.caption, w);
});

test("five-step ladder: milestones, pace and the status badge (ACTIVE, WON, LOST, HELD, COMPLETED, FINISHED SHORT); A and B independent", () => {
  for (const id of Object.keys(BBM_LANES)) assert.equal(laneView(projection(id), DATE).rungs.length, 5);
  const v = laneView(projection("bb-a"), DATE);
  assert.deepEqual(v.rungs.map((r) => r.milestoneCents), [30000, 90000, 270000, 650000, 1000000]);
  assert.deepEqual(laneView(projection("ms-a"), DATE).rungs.map((r) => r.milestoneCents), [7500, 18000, 36000, 65000, 100000]);
  assert.deepEqual(v.pace, { state: "ON_PACE", shortfallCents: 0, milestoneCents: 10000, nextMilestoneCents: 30000 });
  const card = prep(projection("bb-a")).card;
  assert.match(textOf(card), /ON PACE · NEXT MILESTONE \$300/);
  for (const k of [1, 2, 3, 4, 5]) assert.ok(`ladder.m${k}` in card.cells);
  // Step 1 won to $250 (below the $300 milestone), step 2 active and staked: behind pace, ACTIVE.
  const behind = projection("bb-b", [day({ date: "2026-10-31", stepOutcome: "WIN", staked: true, card: null }), day({ card: laneCard("bank-builder"), step: 2, status: "IN_PLAY", staked: true })], { trackedBankrollCents: 25000, trackedBankrollWithheld: null });
  const b = laneView(behind, DATE);
  assert.equal(b.badge, "ACTIVE"); assert.equal(b.step, 2); assert.deepEqual(b.rungs.map((r) => r.state), [RUNG.COMPLETED, RUNG.ACTIVE, RUNG.UPCOMING, RUNG.UPCOMING, RUNG.UPCOMING]);
  assert.deepEqual(b.pace, { state: "BEHIND", shortfallCents: 5000, milestoneCents: 30000, nextMilestoneCents: 90000 });
  assert.match(textOf(prep(behind).card), /BEHIND PACE BY \$50 · MILESTONE \$300/);
  // The other lane is untouched by this lane's history.
  assert.equal(laneView(projection("bb-a"), DATE).step, 1);
  const wonDay = projection("ms-a", [day({ card: laneCard("moonshot"), staked: true, status: "IN_PLAY", stepOutcome: "WIN", legResults: LEGS.map((l) => ({ legId: l.legId, outcome: "WIN" })) })], { trackedBankrollCents: 9000, trackedBankrollWithheld: null });
  const w = prep(wonDay);
  assert.equal(w.view.badge, "WON"); assert.match(textOf(w.card), /STEP 1 OF 5 WON/); assert.deepEqual(verifyBbmCard(w.card), []);
  const five = (cents, status) => projection("ms-b", [1, 2, 3, 4, 5].map((k) => day({ date: `2026-10-2${k}`, step: k, stepOutcome: "WIN", staked: true, card: null })).concat([day({ status, card: null, step: 5 })]), { trackedBankrollCents: cents, trackedBankrollWithheld: null });
  assert.equal(laneView(five(120000, "COMPLETE"), DATE).badge, "COMPLETED");
  const short = prep(five(80000, "FINISHED_SHORT"));
  assert.equal(short.view.badge, "FINISHED SHORT"); assert.match(textOf(short.card), /FINISHED SHORT.*\$800 of \$1,000/);
  assert.equal(prep(statusDoc("bb-a")).card.badge, "HELD");
  // The engine's own milestones (after each step) and pace win over the defaults.
  const eng = projection("bb-a", null, { pace: { onPace: false, behindByCents: 1234, milestoneCents: 10000, withheld: null } });
  const e2 = sealProjection({ ...eng, milestonesCents: [20000, 40000, 80000, 160000, 1000000] });
  const ev = laneView(e2, DATE);
  assert.deepEqual(ev.rungs.map((r) => r.milestoneCents), [20000, 40000, 80000, 160000, 1000000]);
  assert.deepEqual(ev.pace, { state: "BEHIND", shortfallCents: 1234, milestoneCents: 10000, nextMilestoneCents: 20000 });
  assert.throws(() => bbmCardFor({ ...v, view: "CARD", badge: "PENDING" }), /public vocabulary/);
});

test("Bank Builder takes at most two legs (hard); prop legs print player, market and MODEL PROJECTION, and a line only when priced", () => {
  const three = clear.slice(0, 3).map(engineLeg);
  if (three.length === 3) {
    const f3 = seal({ ...FILE, legs: three, contentSha256: undefined });
    const c3 = { ...laneCard("bank-builder", three), suggestedCardsSha256: f3.contentSha256 };
    const r = prepareLane({ doc: projection("bb-a", [day({ card: c3 })]), date: DATE, slate: () => ({ file: f3, lane: LANE, laneSha256: LANE_SHA }), roster: ROSTER, asOf: AS_OF });
    assert.match(r.refused, /3 legs/);
  }
  // Prop legs from the lane: two cleared players in two games.
  const seen = new Set(); const props = [];
  for (const g of LANE.games) for (const side of ["away", "home"]) {
    const p = [...(g.players?.[side] ?? [])].sort((x, y) => y.expectedMinutes - x.expectedMinutes)[0];
    if (props.length < 2 && p && !p.injuryStatus && typeof p.medians?.pts === "number" && !seen.has(g.providerEventId)) { seen.add(g.providerEventId); props.push({ legId: `nba:${g.providerEventId}:pts:${p.providerAthleteId}`, eventId: String(g.providerEventId), eventLabel: `${g.away.abbr} @ ${g.home.abbr}`, startUtc: g.tipUtc, market: "pts", player: { id: String(p.providerAthleteId), name: p.name }, selection: { code: side, teamAbbr: g[side].abbr }, projection: p.medians.pts, guard: { state: "pass", flags: [], flagText: [] } }); }
  }
  const fp = seal({ ...FILE, legs: props, contentSha256: undefined });
  const pc = { ...laneCard("moonshot", props), suggestedCardsSha256: fp.contentSha256, legs: props.map(({ eventId, ...l }) => ({ ...l, gameId: eventId })) };
  const pslate = () => ({ file: fp, lane: LANE, laneSha256: LANE_SHA });
  const p = prepareLane({ doc: projection("ms-a", [day({ card: pc })]), date: DATE, slate: pslate, roster: ROSTER, asOf: AS_OF });
  assert.equal(p.refused, undefined, p.refused);
  const t = textOf(p.card);
  assert.ok(t.includes(props[0].player.name.toUpperCase()) || t.includes(props[0].player.name)); assert.match(t, /Points/); assert.match(t, new RegExp(String(props[0].projection)));
  assert.ok(!Object.keys(p.card.cells).some((k) => k.endsWith(".line")), "no line before a verified price");
  const priced = prepareLane({ doc: projection("ms-a", [day({ card: pc })]), date: DATE, slate: pslate, roster: ROSTER, asOf: AS_OF, samplePayout: { grossCents: 30000, profitCents: 27500, fixture: true, lines: { [props[0].legId]: "19.5+ PTS" } } });
  assert.equal(priced.refused, undefined, priced.refused);
  assert.equal(priced.card.cells["leg1.line"] ?? priced.card.cells["leg2.line"], "LINE 19.5+ PTS");
  assert.match(verifyBbmCard({ ...priced.card, priced: false, samplePrice: false, html: priced.card.html.replace(SAMPLE_PRICE_RIBBON, "") }).join(";"), /line prints without a verified price/);
});

test("BUSTED: the losing card prints with its leg results and BUSTED AT STEP k OF N", () => {
  const doc = projection("bb-a", [day({ card: laneCard("bank-builder"), staked: true, stepOutcome: "LOSS", legResults: LEGS.map((l, i) => ({ legId: l.legId, outcome: i ? "LOSS" : "WIN" })) }), day({ date: NEXT, status: "BUSTED", reason: "LANE A — BUSTED AT STEP 1 OF 5", cardEventSha256: null })]);
  const p = prepareLane({ doc, date: NEXT, slate, roster: ROSTER, asOf: AS_OF });
  assert.equal(p.refused, undefined, p.refused);
  const t = textOf(p.card);
  assert.match(t, /BUSTED AT STEP 1 OF 5/); assert.match(t, /LANDED/); assert.match(t, /MISSED/);
  assert.deepEqual(verifyBbmCard(p.card), []);
});
