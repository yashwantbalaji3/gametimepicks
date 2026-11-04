/**
 * Bank Builder / Moonshot social combos: the social-combo@1 checks (combo-social.mjs), the cards (scripts/social/
 * combo-cards.mjs) and the package path (render-combo-cards.mjs). Legs come from the committed 2026-11-01 lane, so every
 * player, game and projection is real; the roster is synthetic so each guard rule can be switched on alone.
 * Run: npx tsx --test src/lib/social/combo-social.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { comboFromDailyCandidate, comboFromSuggestedCards, comboSha, comboViolations, resolveCombo, sealCombo, laneValueOf, SOCIAL_COMBO_SCHEMA } from "./combo-social.mjs";
import { socialPackageViolations, CONTENT_TYPE, APPROVAL_STATUS } from "./social-package.mjs";
import { eloWinProbabilityOf } from "../sports/nba/elo-win-probability.mjs";
import { POLICY } from "../products/daily-candidates/policy.mjs";
import { comboCard, verifyComboCard, PRICING_TEXT, TEST_RIBBON, MODEL_LABEL } from "../../../scripts/social/combo-cards.mjs";
import { comboCaption, prepareCombo, sourceRef, COMBO_LEAD } from "../../../scripts/social/render-combo-cards.mjs";
import { cleanEligibilityProblems } from "./clean-export.mjs";
import { writePackages } from "../../../scripts/social/render-social-pack.mjs";
import { visibleText } from "../../../scripts/social/nba-line-cards.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATE = "2026-11-01";
const LANE_FILE = path.join(APP, "public/data/nba/experimental-public", `${DATE}.json`);
const LANE_BYTES = fs.readFileSync(LANE_FILE);
const LANE = JSON.parse(LANE_BYTES.toString("utf8"));
const LANE_SHA = crypto.createHash("sha256").update(LANE_BYTES).digest("hex");
const LANE_REF = { ref: `app/public/data/nba/experimental-public/${DATE}.json`, sha256: LANE_SHA };
const ms = (iso) => Date.parse(String(iso).replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
const FIRST = Math.min(...LANE.games.map((g) => ms(g.tipUtc)));
const AS_OF = new Date(FIRST - 4 * 3.6e6).toISOString().replace(".000Z", "Z");
const EMPTY_ROSTER = { __guard: {}, __cells: {} };
/** Tests write to a temp dir; clean export would re-read refs under ~/gtp-evidence, which the real sourceRef enforces. */
const refOf = (f, b) => ({ ref: `gtp-evidence/test/${path.basename(f)}`, sha256: crypto.createHash("sha256").update(b).digest("hex") });

/** Real lane rows: healthy players with a pts median, one per game, most minutes first. */
const players = LANE.games.flatMap((g) => ["away", "home"].flatMap((s) => (g.players?.[s] ?? []).filter((p) => !p.injuryStatus && typeof p.medians?.pts === "number").map((p) => ({ g, s, p }))))
  .sort((a, b) => b.p.expectedMinutes - a.p.expectedMinutes);
const oneEach = (n) => { const seen = new Set(); const out = []; for (const r of players) if (!seen.has(r.g.providerEventId) && out.length < n) { seen.add(r.g.providerEventId); out.push(r); } return out; };
const playerLeg = ({ g, s, p }, market = "pts", target = { direction: "AT_LEAST", value: Math.floor(p.medians.pts * 0.75), source: "MODEL" }) => ({
  legId: `nba:${g.providerEventId}:${market}:${p.providerAthleteId}`, eventId: String(g.providerEventId), tipUtc: g.tipUtc, kind: "PLAYER_PROJECTION",
  team: g[s].abbr, opponent: g[s === "home" ? "away" : "home"].abbr, player: { id: String(p.providerAthleteId), name: p.name }, market, projection: laneValueOf(p, market),
  target, modelProbability: null, probabilityBasis: null, availability: { status: null, guard: [] },
});
const winnerGame = LANE.games.find((g) => eloWinProbabilityOf(g) && g.elo.state === "FAVOURED");
const winnerLeg = (g = winnerGame) => { const side = g.elo.favoured === g.home.abbr ? "home" : "away"; const wp = eloWinProbabilityOf(g); return { legId: `nba:${g.providerEventId}:winner:${g[side].abbr}`, eventId: String(g.providerEventId), tipUtc: g.tipUtc, kind: "GAME_WINNER", team: g[side].abbr, opponent: g[side === "home" ? "away" : "home"].abbr, player: null, market: "winner", projection: wp[side], target: null, modelProbability: null, probabilityBasis: null, availability: { status: null, guard: [] } }; };
const combo = (product, legs, o = {}) => sealCombo({
  schema: SOCIAL_COMBO_SCHEMA, product, sport: "nba", slateDate: DATE, asOf: AS_OF, testData: true, policyId: POLICY[product].id, source: { lane: LANE_REF },
  state: "CARD", reasons: [], combination: { legs, risk: { tier: product === "moonshot" ? "LONGSHOT" : "CONSERVATIVE", jointModelProbability: null, basis: null }, pricing: { state: "MODEL_ONLY" } }, ...o,
});
const bbLegs = () => [playerLeg(players.find((r) => r.g !== winnerGame)), winnerLeg()];
const ctx = (o = {}) => ({ lane: LANE, laneSha256: LANE_SHA, asOf: AS_OF, roster: EMPTY_ROSTER, ...o });
const has = (v, re) => assert.ok(v.some((x) => re.test(x)), `expected ${re} in:\n${v.join("\n")}`);
/** A sealed combo with one field changed after sealing would fail the sha; reseal after the edit. */
const edit = (doc, f) => { const d = structuredClone(doc); f(d); return sealCombo((({ contentSha256: _s, ...b }) => b)(d)); };

test("a Bank Builder built from real lane rows passes and resolves to the lane's numbers", () => {
  const doc = combo("bank-builder", bbLegs());
  assert.deepEqual(comboViolations(doc, ctx()), []);
  const c = resolveCombo(doc, ctx());
  const p = c.legs.find((l) => l.kind === "PLAYER_PROJECTION");
  const src = players.find((r) => String(r.p.providerAthleteId) === p.player.id);
  assert.equal(p.projectionText, src.p.medians.pts.toFixed(1));
  const w = c.legs.find((l) => l.kind === "GAME_WINNER");
  const wp = eloWinProbabilityOf(winnerGame);
  assert.equal(w.projectionText, `${w.home ? wp.homePct : wp.awayPct}%`);
  assert.equal(c.joint, null, "no validated basis, so no joint chance");
});

test("no qualifying combination: no card, the engine's reasons are the refusal", () => {
  const none = sealCombo({ schema: SOCIAL_COMBO_SCHEMA, product: "moonshot", sport: "nba", slateDate: DATE, asOf: AS_OF, testData: false, policyId: POLICY.moonshot.id, source: { lane: LANE_REF }, state: "NO_QUALIFYING_COMBINATION", reasons: [{ code: "TOO_FEW_ELIGIBLE_LEGS", text: "fewer eligible legs than the product needs" }], combination: null });
  has(comboViolations(none, ctx()), /NO_QUALIFYING_COMBINATION: fewer eligible legs/);
  assert.throws(() => resolveCombo(none, ctx()), /combo refused/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "combo-none-"));
  const f = path.join(dir, "m.json"); fs.writeFileSync(f, JSON.stringify(none));
  const r = prepareCombo({ comboPath: f, asOf: AS_OF, lane: LANE, laneSha256: LANE_SHA, roster: EMPTY_ROSTER, refOf });
  assert.equal(r.posts.length, 0);
  assert.match(r.refused[0].reason, /^NO_QUALIFYING_COMBINATION/);
  assert.equal(r.refused[0].contentType, CONTENT_TYPE.NBA_MOONSHOT);
});

test("the daily-candidates engine's NO_CANDIDATE maps to a sealed refusal", () => {
  const doc = comboFromDailyCandidate({ product: "bank-builder", productDay: DATE, asOf: AS_OF, policy: POLICY["bank-builder"].id, status: "NO_CANDIDATE", cardReasons: ["TOO_FEW_ELIGIBLE_LEGS"] }, { reasonCopy: { TOO_FEW_ELIGIBLE_LEGS: "too few" }, laneRef: LANE_REF });
  assert.equal(doc.state, "NO_QUALIFYING_COMBINATION");
  assert.deepEqual(doc.reasons, [{ code: "TOO_FEW_ELIGIBLE_LEGS", text: "too few" }]);
  assert.equal(doc.contentSha256, comboSha(doc));
});

test("data: an edited body, a different lane, a wrong projection, player or tip are each refused", () => {
  const doc = combo("bank-builder", bbLegs());
  const tampered = structuredClone(doc); tampered.combination.legs[0].projection += 1;
  has(comboViolations(tampered, ctx()), /contentSha256/);
  has(comboViolations(tampered, ctx()), /projection .* is not the lane's/);
  has(comboViolations(doc, ctx({ laneSha256: "0".repeat(64) })), /not the committed lane/);
  has(comboViolations(edit(doc, (d) => { d.combination.legs[0].player.name = "Someone Else"; }), ctx()), /is not the lane's/);
  has(comboViolations(edit(doc, (d) => { d.combination.legs[0].player.id = "999999999"; }), ctx()), /not on the .* lane roster/);
  has(comboViolations(edit(doc, (d) => { d.combination.legs[0].tipUtc = "2026-11-02T03:00Z"; }), ctx()), /tip .* is not the lane tip/);
  has(comboViolations(edit(doc, (d) => { d.combination.legs[1].projection = 0.99; }), ctx()), /win probability .* is not the lane's/);
});

test("shape: leg counts per product, one leg per game, tier and pricing state", () => {
  const [a, b, c] = oneEach(3);
  has(comboViolations(combo("bank-builder", [playerLeg(a), playerLeg(b), playerLeg(c)]), ctx()), /3 legs; Bank Builder takes 2/);
  has(comboViolations(combo("moonshot", [playerLeg(a)]), ctx()), /1 legs; Moonshot takes 2 to 4/);
  const same = players.filter((r) => r.g === a.g && r.p !== a.p)[0];
  has(comboViolations(combo("moonshot", [playerLeg(a), playerLeg(same)]), ctx()), /share a game/);
  has(comboViolations(edit(combo("moonshot", [playerLeg(a), playerLeg(b)]), (d) => { d.combination.risk.tier = "CONSERVATIVE"; }), ctx()), /risk tier/);
  has(comboViolations(edit(combo("moonshot", [playerLeg(a), playerLeg(b)]), (d) => { d.combination.pricing.american = 750; }), ctx()), /never holds a price/);
});

test("availability: leg guard, lane R1 status, roster R1-R3 guard, hidden cell and review row each refuse", () => {
  const [a, b] = oneEach(2);
  const doc = combo("moonshot", [playerLeg(a), playerLeg(b)]);
  const id = String(a.p.providerAthleteId);
  has(comboViolations(edit(doc, (d) => { d.combination.legs[0].availability.guard = ["R2"]; }), ctx()), /availability guard R2/);
  has(comboViolations(doc, ctx({ roster: { __guard: { [id]: ["R1", "R3"] }, __cells: {} } })), /roster guard R1, R3/);
  has(comboViolations(doc, ctx({ roster: { __guard: {}, __cells: { [id]: ["pts"] } } })), /hides pts/);
  has(comboViolations(doc, ctx({ roster: { __guard: {}, __cells: {}, [a.g[a.s].abbr]: [{ id, name: a.p.name, review: true }] } })), /under review/);
  const lane = structuredClone(LANE);
  lane.games.find((g) => g.providerEventId === a.g.providerEventId).players[a.s].find((p) => String(p.providerAthleteId) === id).injuryStatus = "Day-To-Day";
  has(comboViolations(doc, ctx({ lane })), /R1 Day-To-Day/);
});

test("freshness: past the cutoff, older than the lane, or newer than the render is refused; no age cap", () => {
  const doc = combo("bank-builder", bbLegs());
  const first = Math.min(...doc.combination.legs.map((l) => ms(l.tipUtc)));
  has(comboViolations(doc, ctx({ asOf: new Date(first - 20 * 60e3).toISOString() })), /within 30 minutes/);
  const atLane = edit(doc, (d) => { d.asOf = LANE.generatedAt; });
  assert.deepEqual(comboViolations(atLane, ctx()), [], "a card stamped with its lane's generatedAt stays valid until the cutoff");
  has(comboViolations(edit(doc, (d) => { d.asOf = "2026-10-01T00:00:00Z"; }), ctx()), /predates the lane/);
  has(comboViolations(edit(doc, (d) => { d.asOf = new Date(ms(AS_OF) + 60e3).toISOString(); }), ctx()), /newer than the render instant/);
});

test("honesty: a sportsbook-line target is refused; a joint chance prints only when every leg is validated", () => {
  const legs = bbLegs();
  has(comboViolations(combo("bank-builder", [{ ...legs[0], target: { direction: "AT_LEAST", value: 22.5, source: "SPORTSBOOK" } }, legs[1]]), ctx()), /only a model target prints/);
  const v = combo("bank-builder", legs.map((l) => ({ ...l, probabilityBasis: "MODEL_VALIDATED", modelProbability: 0.7 })), {});
  const withJoint = edit(v, (d) => { d.combination.risk.jointModelProbability = 0.49; });
  assert.equal(resolveCombo(withJoint, ctx()).joint.text, "49.0%");
  const half = edit(withJoint, (d) => { d.combination.legs[0].probabilityBasis = "MODEL_UNVALIDATED"; });
  assert.equal(resolveCombo(half, ctx()).joint, null);
});

test("cards: MODEL PROJECTION per leg, the not-an-offer state, TEST ribbon only on test data, no price text", () => {
  const bb = comboCard(resolveCombo(combo("bank-builder", bbLegs()), ctx()));
  assert.deepEqual(verifyComboCard(bb), []);
  const text = visibleText(bb.html);
  assert.equal(text.split(MODEL_LABEL).length - 1 >= 2, true);
  assert.ok(text.includes(PRICING_TEXT.MODEL_ONLY));
  assert.ok(text.includes(TEST_RIBBON));
  const ms4 = comboCard(resolveCombo(combo("moonshot", oneEach(4).map((r) => playerLeg(r))), ctx()));
  assert.deepEqual(verifyComboCard(ms4), []);
  assert.ok(visibleText(ms4.html).includes("LONGSHOT · HIGHER RISK"));
  assert.ok(visibleText(ms4.html).includes("Longshots usually miss"));
  const real = comboCard(resolveCombo(edit(combo("bank-builder", bbLegs()), (d) => { d.testData = false; d.combination.pricing.state = "VERIFIED_PRICES"; }), ctx()));
  assert.ok(!visibleText(real.html).includes(TEST_RIBBON));
  assert.ok(visibleText(real.html).includes(PRICING_TEXT.VERIFIED_PRICES));
  has(verifyComboCard({ ...real, html: real.html.replace(PRICING_TEXT.VERIFIED_PRICES, "+650 at a book") }), /(not-an-offer|price, line)/);
  has(verifyComboCard({ ...real, testData: true }), /TEST ribbon/);
});

test("package: founder review, NBA_BANK_BUILDER, slot at first tip - 90, window closes at the cutoff, caption claims", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "combo-pkg-"));
  const f = path.join(dir, "bb.json"); fs.writeFileSync(f, JSON.stringify(combo("bank-builder", bbLegs())));
  assert.match(prepareCombo({ comboPath: f, asOf: AS_OF, lane: LANE, laneSha256: LANE_SHA, refOf }).refused[0].reason, /^NO_ROSTER/);
  assert.match(prepareCombo({ comboPath: f, asOf: AS_OF, lane: LANE, laneSha256: LANE_SHA, roster: EMPTY_ROSTER }).refused[0].reason, /clean export can re-read it/);
  assert.throws(() => sourceRef(f, Buffer.from("x")), /must sit in the repository/);
  const r = prepareCombo({ comboPath: f, asOf: AS_OF, lane: LANE, laneSha256: LANE_SHA, roster: EMPTY_ROSTER, refOf });
  assert.equal(r.refused.length, 0);
  const caption = r.posts[0].caption;
  assert.equal(caption, comboCaption(resolveCombo(combo("bank-builder", bbLegs()), ctx())));
  assert.doesNotMatch(caption, /\b(bet|odds|parlay|picks?|lock|value)\b/i);
  const [{ pkg }] = await writePackages(r.posts, { outRoot: path.join(dir, "out"), png: false });
  assert.deepEqual(socialPackageViolations(pkg), []);
  assert.equal(pkg.contentType, CONTENT_TYPE.NBA_BANK_BUILDER);
  assert.equal(pkg.variant, "test");
  assert.equal(pkg.approval.status, APPROVAL_STATUS);
  const first = Math.min(...bbLegs().map((l) => ms(l.tipUtc)));
  assert.equal(Date.parse(pkg.recommendedAt), FIRST - COMBO_LEAD["bank-builder"] * 60e3, "slot follows the slate's first tip");
  assert.equal(Date.parse(pkg.window.closesAt), first - 30 * 60e3);
  assert.equal(pkg.content.sources.combo, "gtp-evidence/test/bb.json");
  // Clean export rebuilds combos from these refs; the new design stays out of clean export until the founder approves it.
  assert.deepEqual(cleanEligibilityProblems(pkg), ["design version not allowed"]);
  const again = prepareCombo({ comboPath: f, asOf: AS_OF, lane: LANE, laneSha256: LANE_SHA, roster: EMPTY_ROSTER, refOf }).posts[0];
  assert.equal(again.cards[0].html, r.posts[0].cards[0].html, "a rebuild from the same snapshot is byte-identical");
  assert.ok(COMBO_LEAD.moonshot < COMBO_LEAD["bank-builder"] && COMBO_LEAD.moonshot > 60, "Moonshot after Bank Builder, before the first winner post (tip - 60)");
});

/** A gtp.suggested-cards@1 day file in the engine's shape (380a6d98dc), built from the committed lane. */
const favoured = LANE.games.map((g) => ({ g, wp: eloWinProbabilityOf(g) })).filter((x) => x.wp && x.g.elo.state === "FAVOURED");
const engineLeg = ({ g, wp }, o = {}) => {
  const side = g.elo.favoured === g.home.abbr ? "home" : "away";
  return { legId: `nba:${g.providerEventId}:winner`, sport: "nba", eventId: String(g.providerEventId), eventLabel: `${g.away.abbr} @ ${g.home.abbr}`, startUtc: g.tipUtc, market: "winner", selection: { code: side, label: `${g[side].abbr} (official side)`, teamAbbr: g[side].abbr }, status: "MODEL_ONLY", probability: side === "home" ? wp.home : 1 - wp.home, probabilityShown: `${side === "home" ? wp.homePct : wp.awayPct}%`, guard: { state: "pass", flags: [], flagText: [], rotationFlagged: [], outAtFreeze: [] }, ...o };
};
/** Sealed as the engine seals it (rule B): sha256 of JSON.stringify of the rest, keys in written order. */
const sealFile = (f) => { const { contentSha256: _c, ...rest } = f; return { ...rest, contentSha256: crypto.createHash("sha256").update(JSON.stringify(rest)).digest("hex") }; };
const suggested = (legsBB, legsMS, o = {}) => sealFile({
  schema: "gtp.suggested-cards@1", productDay: DATE, evaluatedAt: LANE.generatedAt, pricing: { state: "MODEL_ONLY" },
  inputs: [{ sport: "nba", file: LANE_REF.ref, sha256: LANE_SHA, generatedAt: LANE.generatedAt, commit: "test" }],
  bankBuilder: { nba: { policy: "nba-game-winner-tiers@1/bank-builder", state: legsBB ? "model-only" : "insufficient", card: legsBB && { id: "bb1", tier: "low", legs: legsBB, jointProbability: 0.6, jointShown: "60.0%", status: "MODEL_ONLY", priced: false, price: null, payout: null }, reason: legsBB ? null : "Insufficient eligible legs" } },
  moonshot: { nba: { policy: "nba-game-winner-tiers@1/moonshot", state: legsMS ? "model-only" : "insufficient", card: legsMS && { id: "ms1", tier: "longshot", legs: legsMS, jointProbability: 0.14, jointShown: "14.0%", status: "MODEL_ONLY", priced: false, price: null, payout: null }, reason: legsMS ? null : "No combination in the longshot band" } },
  ...o,
});
/** Favoured sides whose top-five rotation is clear at freeze, one per game. */
const clearFav = favoured.filter(({ g }) => { const side = g.elo.favoured === g.home.abbr ? "home" : "away"; return [...g.players[side]].sort((a, b) => b.expectedMinutes - a.expectedMinutes).slice(0, 5).every((p) => !p.injuryStatus); });

test("suggested-cards adapter: a model-only card maps to a CARD combo the lane accepts; joint chance withheld (Elo unvalidated)", () => {
  assert.ok(clearFav.length >= 2, "the 11-01 lane has two favourites with a clear rotation");
  const file = suggested(clearFav.slice(0, 2).map((x) => engineLeg(x)), clearFav.slice(0, 2).map((x) => engineLeg(x)));
  for (const product of ["bank-builder", "moonshot"]) {
    const doc = comboFromSuggestedCards(file, product);
    assert.equal(doc.state, "CARD");
    assert.deepEqual(comboViolations(doc, ctx()), []);
    const c = resolveCombo(doc, ctx());
    assert.equal(c.joint, null);
    assert.equal(c.pricing, "MODEL_ONLY");
    assert.deepEqual(verifyComboCard(comboCard(c)), []);
  }
  const noisy = engineLeg(clearFav[0], { probability: 1 - (1 - clearFav[0].wp.home) + 1e-16 });
  assert.notEqual(noisy.probability, clearFav[0].wp.home);
  assert.deepEqual(comboViolations(comboFromSuggestedCards(suggested([noisy, engineLeg(clearFav[1])], null), "bank-builder"), ctx()), [], "a 1 - p float is the lane's value");
  has(comboViolations(comboFromSuggestedCards(suggested([engineLeg(clearFav[0], { probability: clearFav[0].wp.home + 0.001 }), engineLeg(clearFav[1])], null), "bank-builder"), ctx()), /is not the lane's/);
});

test("suggested-cards adapter: no card, a priced card, an engine guard flag, a shown-percent mismatch or a rotation R1 each refuse", () => {
  const none = comboFromSuggestedCards(suggested(null, null), "moonshot");
  assert.equal(none.state, "NO_QUALIFYING_COMBINATION");
  assert.deepEqual(none.reasons, [{ code: "INSUFFICIENT", text: "No combination in the longshot band" }]);
  const two = clearFav.slice(0, 2);
  const priced = suggested(two.map((x) => engineLeg(x)), null); priced.bankBuilder.nba.card.price = 120;
  assert.throws(() => comboFromSuggestedCards(priced, "bank-builder"), /not the frozen card/, "an edit after sealing breaks rule B");
  assert.equal(comboFromSuggestedCards(sealFile(priced), "bank-builder").reasons[0].code, "PRICED_CARD");
  const { contentSha256: _drop, ...unsealed } = suggested(two.map((x) => engineLeg(x)), null);
  assert.throws(() => comboFromSuggestedCards(unsealed, "bank-builder"), /contentSha256 is missing/);
  const flagged = comboFromSuggestedCards(suggested([engineLeg(two[0], { guard: { state: "review", flags: ["FAVOURED_ROTATION_R1"], rotationFlagged: [{ playerId: "1", name: "A Player", status: "Day-To-Day" }] } }), engineLeg(two[1])], null), "bank-builder");
  has(comboViolations(flagged, ctx()), /availability guard FAVOURED_ROTATION_R1, R1 A Player Day-To-Day/);
  has(comboViolations(comboFromSuggestedCards(suggested([engineLeg(two[0], { probabilityShown: "99%" }), engineLeg(two[1])], null), "bank-builder"), ctx()), /the engine shows 99%/);
  const dtd = favoured.find((x) => !clearFav.includes(x));
  has(comboViolations(comboFromSuggestedCards(suggested([engineLeg(dtd), engineLeg(two.find((x) => x.g !== dtd.g))], null), "bank-builder"), ctx()), /rotation player .* R1 Day-To-Day/);
  const g = two[0].g; const side = g.elo.favoured === g.home.abbr ? "home" : "away";
  const top = [...g.players[side]].sort((a, b) => b.expectedMinutes - a.expectedMinutes)[0];
  has(comboViolations(comboFromSuggestedCards(suggested(two.map((x) => engineLeg(x)), null), "bank-builder"), ctx({ roster: { __guard: { [String(top.providerAthleteId)]: ["R1"] }, __cells: {} } })), /rotation player .* R1 on the current roster/);
});
