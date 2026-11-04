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

import { BBM_LANES, RUNG, VIEW, appendEvent, laneLogViolations, laneView, newLaneLog, parseLaneLog } from "./bbm-lane.mjs";
import { eloWinProbabilityOf } from "../sports/nba/elo-win-probability.mjs";
import { AWAITING, FACT_LINE, REMOVED_TEXT, SAMPLE_PRICE_RIBBON, TEST_RIBBON, bbmCard, verifyBbmCard } from "../../../scripts/social/bbm-cards.mjs";
import { LIVE_PACKAGES, frozenCardOf, packageCaption, planPackages, prepareLane, stagingViolations, writeStaging } from "../../../scripts/social/render-bbm.mjs";
import { visibleText } from "../../../scripts/social/nba-line-cards.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATE = "2026-11-01";
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
  bankBuilder: { nba: { policy: "nba-game-winner-tiers@1/bank-builder", state: "model-only", card: card("bb1", "low") } },
  moonshot: { nba: { policy: "nba-game-winner-tiers@1/moonshot", state: "model-only", card: card("ms1", "longshot") } },
});
const slate = (d) => { if (d !== DATE) throw new Error(`no slate ${d}`); return { file: FILE, lane: LANE, laneSha256: LANE_SHA }; };
const at = LANE.generatedAt;
const frozen = (c, step, file = FILE) => ({ type: "CARD_FROZEN", date: DATE, step, at, source: "test", engineCardId: c.id, suggestedCardsSha256: file.contentSha256, legs: c.legs.map((l) => ({ legId: l.legId, gameId: l.eventId, market: l.market, selection: l.selection.teamAbbr, projection: l.probability })) });
const head = (laneId, o = {}) => { const L = BBM_LANES[laneId]; return newLaneLog({ laneId, runId: "run-1", product: L.product, base: L.base, target: L.target, steps: L.steps, startedAt: at, approvedBy: null, ...o }); };
const cardLog = (laneId, o = {}) => { const L = BBM_LANES[laneId]; const c = L.product === "bank-builder" ? FILE.bankBuilder.nba.card : FILE.moonshot.nba.card; return appendEvent(appendEvent(head(laneId, o), frozen(c, 1)), { type: "STAKE_SET", date: DATE, step: 1, at, source: "test", stake: L.base, placedWager: false }); };
const statusLog = (laneId) => appendEvent(head(laneId), { type: "STATUS", date: DATE, step: 1, at, source: "test", status: "NO_ELIGIBLE_CARD", reason: "test" });
const price = (log, o = {}, legs = LEGS) => {
  appendEvent(log, { type: "PRICE_VERIFIED", date: DATE, step: 1, at, source: "FIXTURE", fixture: true, legs: legs.map((l) => ({ legId: l.legId })), priceSnapshotSha: "0".repeat(64) });
  return appendEvent(log, { type: "PAYOUT_COMPUTED", date: DATE, step: 1, at, source: "FIXTURE", fixture: true, stake: 100, decimalPrice: 3, grossPayout: 300, profit: 200, priceSnapshotSha: "0".repeat(64), ...o });
};
const prep = (log, o = {}) => prepareLane({ log, date: DATE, slate, roster: ROSTER, asOf: AS_OF, ...o });
const textOf = (c) => visibleText(c.html.replace(/<script>[\s\S]*?<\/script>/g, " "));

test("lane log: the hash chain, header and steps are checked; a JSONL round trip replays the same view", () => {
  const log = cardLog("bb-a");
  assert.deepEqual(laneLogViolations(log), []);
  const text = `${[log.header, ...log.events].map((e) => JSON.stringify(e)).join("\n")}\n`;
  assert.deepEqual(laneView(parseLaneLog(text), DATE), laneView(log, DATE));
  const edited = structuredClone(log); edited.events[0].legs[0].projection = 0.99;
  assert.match(laneLogViolations(edited).join(";"), /sha256 does not match/);
  const cut = structuredClone(log); cut.events.splice(0, 1);
  assert.match(laneLogViolations(cut).join(";"), /hash chain broken/);
  assert.match(laneLogViolations(head("bb-a", { target: 5000 })).join(";"), /target 5000/);
});

test("lane view: step, rungs and tracked bankroll follow settlements only; a loss busts; a new day never advances", () => {
  const v = laneView(cardLog("ms-a"), DATE);
  assert.equal(v.view, VIEW.CARD); assert.equal(v.step, 1); assert.equal(v.bankroll, 25); assert.equal(v.stake, 25);
  assert.deepEqual(v.rungs.map((r) => r.state), [RUNG.ACTIVE, RUNG.UPCOMING, RUNG.UPCOMING, RUNG.UPCOMING, RUNG.UPCOMING]);
  assert.equal(laneView(cardLog("ms-a"), "2026-11-02").view, VIEW.IN_PLAY, "an unsettled step stays in play the next day");
  const won = appendEvent(head("bb-b"), { type: "STEP_SETTLED", date: "2026-10-31", step: 1, at, source: "test", outcome: "WIN", bankrollAfter: 464.13 });
  appendEvent(won, { type: "STATUS", date: DATE, step: 2, at, source: "test", status: "NO_ELIGIBLE_CARD" });
  const w = laneView(won, DATE);
  assert.equal(w.view, VIEW.NO_ELIGIBLE_CARD); assert.equal(w.step, 2); assert.equal(w.bankroll, 464.13);
  assert.deepEqual(w.rungs.map((r) => r.state), [RUNG.COMPLETED, RUNG.ACTIVE, RUNG.UPCOMING]);
  const lost = appendEvent(cardLog("bb-a"), { type: "STEP_SETTLED", date: "2026-11-02", step: 1, at, source: "test", outcome: "LOSS" });
  const b = laneView(lost, "2026-11-02");
  assert.equal(b.view, VIEW.BUSTED); assert.equal(b.step, 1); assert.equal(b.rungs[0].state, RUNG.FAILED);
  const wrongStake = appendEvent(appendEvent(head("bb-a"), frozen(FILE.bankBuilder.nba.card, 1)), { type: "STAKE_SET", date: DATE, step: 1, at, source: "test", stake: 50, placedWager: false });
  assert.throws(() => laneView(wrongStake, DATE), /all-in ladder/);
  const placed = appendEvent(appendEvent(head("bb-a"), frozen(FILE.bankBuilder.nba.card, 1)), { type: "STAKE_SET", date: DATE, step: 1, at, source: "test", stake: 100, placedWager: true });
  assert.throws(() => laneView(placed, DATE), /WAGER_DOCUMENTED/);
});

test("frozen card: the CARD_FROZEN must name this sealed file and carry exactly its legs at its probabilities", () => {
  const ev = frozen(FILE.bankBuilder.nba.card, 1);
  assert.ok(frozenCardOf(ev, FILE, "bank-builder").card);
  assert.match(frozenCardOf({ ...ev, suggestedCardsSha256: "f".repeat(64) }, FILE, "bank-builder").error, /names suggested-cards/);
  assert.match(frozenCardOf({ ...ev, legs: ev.legs.slice(0, 1) }, FILE, "bank-builder").error, /exactly the frozen legs/);
  assert.match(frozenCardOf({ ...ev, legs: [{ ...ev.legs[0], projection: 0.5 }, ev.legs[1]] }, FILE, "bank-builder").error, /frozen projection/);
  assert.match(frozenCardOf(ev, { ...FILE, label: "edited" }, "bank-builder").error, /not sealed/);
});

test("cards: the removed banners and sentences are absent; STEP, ladder, bankroll trio, MODEL labels and the fact line print", () => {
  for (const laneId of Object.keys(BBM_LANES)) {
    const p = prep(cardLog(laneId));
    assert.equal(p.refused, undefined, p.refused);
    const t = textOf(p.card);
    for (const r of REMOVED_TEXT) assert.ok(!t.toLowerCase().includes(r.toLowerCase()), `${laneId}: ${r}`);
    for (const r of ["Model projections · Not betting advice", "MODEL-ONLY • NOT A SPORTSBOOK OFFER", "Both legs must land", "All 4 legs", "ESTIMATE", "est.", "projected median"]) assert.ok(!t.includes(r), `${laneId}: ${r}`);
    assert.match(t, /STEP 1 OF [35]/);
    for (const s of ["START", "TRACKED", "GOAL", "MODEL PROJECTION", "MODEL WIN PROBABILITY", "WAGER", "LADDER PROGRESS", FACT_LINE]) assert.ok(t.toUpperCase().includes(s.toUpperCase()), `${laneId}: ${s}`);
    assert.ok(t.includes("GameTimePicks") || p.card.html.includes('class="logo"'), "the real logo");
    assert.deepEqual(verifyBbmCard(p.card), []);
  }
  const s = prep(statusLog("bb-b"));
  assert.match(textOf(s.card), /NO QUALIFYING CARD TODAY.*STILL STEP 1 OF 3/);
  assert.deepEqual(verifyBbmCard(s.card), []);
  const bad = prep(cardLog("bb-a")).card;
  assert.match(verifyBbmCard({ ...bad, html: bad.html.replace(FACT_LINE, `${FACT_LINE} · FOUNDER REVIEW ONLY`) }).join(";"), /removed text/);
  assert.match(verifyBbmCard({ ...bad, html: bad.html.replace(FACT_LINE, `${FACT_LINE} · Not betting advice`) }).join(";"), /removed text/);
  assert.match(verifyBbmCard({ ...bad, html: bad.html.replace(FACT_LINE, `${FACT_LINE} · odds +250`) }).join(";"), /price, line or odds/);
});

test("unpriced: no PAYOUT_COMPUTED, or one without a matching PRICE_VERIFIED, prints AWAITING VERIFIED PRICES and flags the package", () => {
  const p = prep(cardLog("ms-a"));
  assert.equal(p.view.payout, null);
  assert.equal(p.card.cells["money.payout"], AWAITING);
  assert.ok(!("money.profit" in p.card.cells));
  const [plan] = planPackages([p], DATE);
  assert.equal(plan.packageId, `ms-a-${DATE}`); assert.equal(plan.needsFounderReview, "unpriced");
  // A payout with no price event, a price for other legs, or broken arithmetic is never shown.
  const noPrice = appendEvent(cardLog("bb-a"), { type: "PAYOUT_COMPUTED", date: DATE, step: 1, at, source: "x", stake: 100, grossPayout: 300, profit: 200 });
  assert.match(laneView(noPrice, DATE).unpricedReason, /without a PRICE_VERIFIED/);
  assert.match(laneView(price(cardLog("bb-a"), {}, LEGS.slice(0, 1)), DATE).unpricedReason, /exactly these legs/);
  assert.match(laneView(price(cardLog("bb-a"), { profit: 250 }), DATE).unpricedReason, /arithmetic/);
  assert.match(laneView(price(cardLog("bb-a"), { stake: 50, grossPayout: 150, profit: 100 }), DATE).unpricedReason, /tracked stake/);
  // A card claiming a payout it does not hold is refused by the verifier.
  const c = p.card;
  assert.match(verifyBbmCard({ ...c, priced: true }).join(";"), /verified payout is not shown/);
  // A real (non-fixture) payout is refused until founder decision P1.
  const real = structuredClone(price(cardLog("bb-a")));
  const strip = (e) => { const { sha256: _s, prevSha256: _p, fixture: _f, ...rest } = e; return rest; };
  const relog = head("bb-a"); for (const e of real.events) appendEvent(relog, strip(e));
  assert.match(prep(relog).refused, /founder decision P1/);
});

test("fixture price: drawn only with the SAMPLE PRICE ribbon, and never written to a package", async () => {
  const p = prep(price(cardLog("bb-a")));
  assert.equal(p.refused, undefined, p.refused);
  assert.equal(p.card.cells["money.payout"], "$300"); assert.equal(p.card.cells["money.profit"], "$200");
  assert.ok(textOf(p.card).includes(SAMPLE_PRICE_RIBBON));
  assert.match(verifyBbmCard({ ...p.card, html: p.card.html.replace(SAMPLE_PRICE_RIBBON, "") }).join(";"), /SAMPLE PRICE ribbon/);
  const plans = planPackages([p, prep(statusLog("bb-b"))], DATE);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "bbm-"));
  assert.match(stagingViolations(plans, out).join(";"), /fixture price never reaches a package/);
  await assert.rejects(writeStaging(plans, { outRoot: out, browser: null }), /staging refused/);
  assert.deepEqual(fs.readdirSync(out), [], "nothing written");
  const t = prep(cardLog("ms-b"), { testData: true });
  assert.ok(textOf(t.card).includes(TEST_RIBBON));
  assert.match(stagingViolations(planPackages([t], DATE), out).join(";"), /TEST lane history/);
  const clean = planPackages([prep(cardLog("bb-a")), prep(statusLog("bb-b"))], DATE);
  assert.deepEqual(stagingViolations(clean, out), []);
  assert.match(stagingViolations(clean, LIVE_PACKAGES).join(";"), /live packages folder/);
  fs.rmSync(out, { recursive: true, force: true });
});

test("packages: bb-<date> is bb-a then bb-b or nothing; each Moonshot lane is its own post; captions state step and status", () => {
  const all = [prep(cardLog("bb-b")), prep(cardLog("ms-b")), prep(cardLog("bb-a")), prep(statusLog("ms-a"))];
  const plans = planPackages(all, DATE);
  assert.deepEqual(plans.map((p) => [p.packageId, p.lanes.map((l) => l.laneId)]), [[`bb-${DATE}`, ["bb-a", "bb-b"]], [`ms-b-${DATE}`, ["ms-b"]], [`ms-a-${DATE}`, ["ms-a"]]]);
  assert.equal(plans.find((p) => p.packageId === `ms-a-${DATE}`).needsFounderReview, "status-only");
  assert.deepEqual(planPackages([prep(cardLog("bb-a"))], DATE), [], "no one-image Bank Builder post");
  const cap = packageCaption("bank-builder", plans[0].lanes, DATE);
  assert.match(cap, /Lane A · Step 1 of 3/); assert.match(cap, /Lane B · Step 1 of 3/); assert.match(cap, /no real wager placed/);
  for (const p of plans) for (const w of [/odds/i, /parlay/i, /payout/i, /[+-]\d{3}\b/, /must land/i, /betting advice/i, /sportsbook/i]) assert.doesNotMatch(p.caption, w);
  // A lane in play gets no card; the other lanes still render.
  assert.match(prepareLane({ log: cardLog("ms-a"), date: "2026-11-02", slate, roster: ROSTER, asOf: AS_OF }).refused, /IN_PLAY/);
});

test("BUSTED: the losing card prints with leg outcomes and BUSTED AT STEP k OF N", () => {
  const log = appendEvent(cardLog("bb-a"), { type: "LEG_SETTLED", date: "2026-11-02", step: 1, at, source: "test", legId: LEGS[0].legId, outcome: "WIN" });
  appendEvent(log, { type: "LEG_SETTLED", date: "2026-11-02", step: 1, at, source: "test", legId: LEGS[1].legId, outcome: "LOSS" });
  appendEvent(log, { type: "STEP_SETTLED", date: "2026-11-02", step: 1, at, source: "test", outcome: "LOSS" });
  const p = prepareLane({ log, date: "2026-11-02", slate, roster: ROSTER, asOf: AS_OF });
  assert.equal(p.refused, undefined, p.refused);
  const t = textOf(p.card);
  assert.match(t, /BUSTED AT STEP 1 OF 3/); assert.match(t, /LANDED/); assert.match(t, /MISSED/);
  assert.equal(bbmCard(p.view, p.combo).cells.status, "BUSTED AT STEP 1 OF 3");
  assert.deepEqual(verifyBbmCard(p.card), []);
});
