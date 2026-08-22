/**
 * THE 4x4 GRID'S INVARIANTS.
 *
 * The grid is a policy view over cards someone will act on, so the things that must not drift are
 * the ones the backtest paid for:
 *
 *   · a tier is never shown more bands than its bankroll supports, and never a wilder band before
 *     a calmer one;
 *   · the cards ONE reader sees never share a leg (18.6% -> 43.2% -> 65.9% wipeout);
 *   · a band with no card says so, and a substitute is labelled as riskier rather than slipped in;
 *   · a sport that cannot clear the gate publishes a refusal, never a thin grid.
 *
 * The multi-sport lane cannot be observed today — only MLB clears the gate — so it is proven on a
 * fixture with two synthetic live sports. That is the whole reason to test it now: the code path
 * that runs for the first time on the day a second sport lands is the one most likely to be broken.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CELL_STATES, crossCardLegCollisions, resolveTierGrid } from "./tier-grid.mjs";
import { buildCrossSportCard, buildMultiLadder, MIN_SPORTS } from "./multi-sport.mjs";
import { BETTOR_TIERS, RISK_ORDER } from "../prefs/bettor-tiers.mjs";

const leg = (player, market = "hits", side = "over", line = 0.5) => ({ player, market, side, line });
const card = (tier, legs, slipId = `s-${tier}`) => ({ tier, slipId, legs });

test("the grid is exactly four tiers by four bands, every cell resolved", () => {
  const g = resolveTierGrid({ tiers: BETTOR_TIERS, riskOrder: RISK_ORDER, cards: [], skipped: [] });
  assert.equal(g.cells.length, BETTOR_TIERS.length * RISK_ORDER.length);
  assert.equal(g.cells.length, 16, "the founder asked for a 4x4; anything else is a different product");
  for (const c of g.cells) {
    assert.ok(Object.values(CELL_STATES).includes(c.state), `cell ${c.tier}/${c.band} has state ${c.state}`);
    if (c.state !== CELL_STATES.OFFERED) assert.ok(c.reason, `${c.tier}/${c.band} is withheld with no reason given`);
  }
});

test("a tier is shown the CALMEST bands, never a wilder one before a calmer one", () => {
  const all = RISK_ORDER.map((b) => card(b, [leg(`p-${b}`)]));
  const g = resolveTierGrid({ tiers: BETTOR_TIERS, riskOrder: RISK_ORDER, cards: all, skipped: [] });

  for (const t of BETTOR_TIERS) {
    const offered = g.cells.filter((c) => c.tier === t.id && c.state === CELL_STATES.OFFERED).map((c) => c.band);
    assert.equal(offered.length, t.cardsPerDay, `${t.id} should see ${t.cardsPerDay} card(s)`);
    // The offered set must be a PREFIX of the calmest-first order — never a gap, never a skip.
    assert.deepEqual(offered, RISK_ORDER.slice(0, t.cardsPerDay).filter((b) => offered.includes(b)));
    assert.deepEqual([...offered].sort((a, b) => RISK_ORDER.indexOf(a) - RISK_ORDER.indexOf(b)), offered);
  }
  // The smallest bankroll must never be handed the wildest card.
  const bronze = g.cells.filter((c) => c.tier === "bronze" && c.state === CELL_STATES.OFFERED);
  assert.deepEqual(bronze.map((c) => c.band), ["low"]);
});

test("the cards one reader is shown never share a leg", () => {
  const shared = leg("SharedPlayer");
  const cards = [card("low", [shared]), card("medium", [shared, leg("B")]), card("high", [leg("C")]), card("longshot", [leg("D")])];
  const collisions = crossCardLegCollisions({ tiers: BETTOR_TIERS, riskOrder: RISK_ORDER, cards });
  assert.ok(collisions.length > 0, "a leg on two of a reader's cards must be reported");
  assert.ok(collisions.some((c) => c.tier === "diamond"), "diamond sees all four bands and must catch it");
  // Bronze sees only `low`, so the same data is NOT a collision for bronze — the check is per reader.
  assert.ok(!collisions.some((c) => c.tier === "bronze"), "a tier that sees one card cannot have a cross-card collision");

  const clean = RISK_ORDER.map((b) => card(b, [leg(`unique-${b}`)]));
  assert.deepEqual(crossCardLegCollisions({ tiers: BETTOR_TIERS, riskOrder: RISK_ORDER, cards: clean }), []);
});

test("a substitute is offered only to an empty tier, and is labelled as riskier", () => {
  // `low` absent — exactly the real situation: 0 of 883 candidate cards ever priced into that band.
  const cards = [card("medium", [leg("M")]), card("high", [leg("H")]), card("longshot", [leg("L")])];
  const g = resolveTierGrid({
    tiers: BETTOR_TIERS, riskOrder: RISK_ORDER, cards,
    skipped: [{ tier: "low", reason: "no priced card in this tier on today's slate" }],
  });

  const bronze = g.tiers.find((t) => t.id === "bronze");
  assert.ok(bronze.emptyToday, "bronze's only band produced nothing");
  assert.ok(bronze.substitute, "a tier that would show nothing at all gets a labelled fallback");
  assert.equal(bronze.substitute.band, "medium", "the fallback is the CALMEST available, not the next rung up");
  assert.match(bronze.substitute.reason, /longer price|riskier/i,
    "a reader moved out of their band must be told the card is longer-priced than their range");

  // Tiers that already have a card must NOT be topped up — that would quietly widen their scope.
  for (const id of ["silver", "gold", "diamond"]) {
    assert.equal(g.tiers.find((t) => t.id === id).substitute, null, `${id} has cards and must not be given a substitute`);
  }
});

test("no substitute exists when nothing at all was published", () => {
  const g = resolveTierGrid({ tiers: BETTOR_TIERS, riskOrder: RISK_ORDER, cards: [], skipped: [] });
  for (const t of g.tiers) assert.equal(t.substitute, null, "an empty board cannot substitute anything");
});

test("MULTI · a cross-sport card is cross-sport by construction, not by luck", () => {
  // The deepest sport must not be able to supply every leg. Ten MLB legs against two UFC legs is
  // the case where a naive score-ordered fill silently produces a single-sport card.
  const legs = [
    ...Array.from({ length: 10 }, (_, i) => ({ sport: "mlb", eventId: `g${i}`, player: `m${i}`, market: "hits", side: "over", line: 0.5, decimal: 1.9, score: 100 - i })),
    { sport: "ufc", eventId: "b1", player: "u1", market: "ml", side: "win", decimal: 1.7, score: 1 },
    { sport: "ufc", eventId: "b2", player: "u2", market: "ml", side: "win", decimal: 2.1, score: 0 },
  ];
  const { card: c } = buildCrossSportCard({ legs, maxLegs: 4 });
  assert.ok(c, "a card should build from two sports");
  assert.ok(c.sports.length >= MIN_SPORTS, `built a card from ${c.sports.length} sport(s) despite far deeper MLB scores`);
  assert.deepEqual(c.sports, ["mlb", "ufc"]);
});

test("MULTI · refuses rather than degrading to a single-sport card", () => {
  const oneSport = Array.from({ length: 6 }, (_, i) => ({ sport: "mlb", eventId: `g${i}`, player: `p${i}`, market: "hits", side: "over", line: 0.5, decimal: 1.9, score: i }));
  const r = buildCrossSportCard({ legs: oneSport, maxLegs: 4 });
  assert.equal(r.card, null, "a single-sport card must never be published under a cross-sport label");
  assert.match(r.refused, /at least 2 sports/);
});

test("MULTI · one event never appears twice on a card", () => {
  const legs = [
    { sport: "mlb", eventId: "sameGame", player: "a", market: "hits", side: "over", line: 0.5, decimal: 1.9, score: 9 },
    { sport: "mlb", eventId: "sameGame", player: "b", market: "hits", side: "over", line: 0.5, decimal: 1.8, score: 8 },
    { sport: "ufc", eventId: "b1", player: "c", market: "ml", side: "win", decimal: 1.7, score: 7 },
    { sport: "ufc", eventId: "b1", player: "d", market: "ml", side: "win", decimal: 2.0, score: 6 },
  ];
  const { card: c } = buildCrossSportCard({ legs, maxLegs: 4 });
  const events = c.legs.map((l) => `${l.sport}:${l.eventId}`);
  assert.equal(new Set(events).size, events.length, "the same event is on the card twice");
  assert.equal(c.legs.length, 2, "two events means two legs, not four");
});

test("MULTI · legs already on a reader's other card are not reused", () => {
  const legs = [
    { sport: "mlb", eventId: "g1", player: "taken", market: "hits", side: "over", line: 0.5, decimal: 1.9, score: 9 },
    { sport: "mlb", eventId: "g2", player: "free", market: "hits", side: "over", line: 0.5, decimal: 1.8, score: 8 },
    { sport: "ufc", eventId: "b1", player: "u", market: "ml", side: "win", decimal: 1.7, score: 7 },
  ];
  const used = new Set(["mlb|taken|hits|over|0.5"]);
  const { card: c } = buildCrossSportCard({ legs, maxLegs: 4, usedLegKeys: used });
  assert.ok(!c.legs.some((l) => l.player === "taken"), "a leg the reader already holds was reused");
});

test("MULTI · the ladder that runs on the day a second sport goes live, run today", () => {
  /*
   * This is the point of the fixture. The multi lane is gated shut — only MLB clears the gate — so
   * the first time buildMultiLadder executes for real is the day a second sport lands, which is the
   * worst possible day to discover it is broken. Two synthetic live sports exercise it now.
   */
  const ladders = {
    mlb: { cards: [
      { tier: "medium", legs: [{ gameId: "g1", player: "A", market: "hits", side: "over", line: 0.5, odds: -110 },
                               { gameId: "g2", player: "B", market: "hits", side: "over", line: 0.5, odds: 120 }] },
      { tier: "high", legs: [{ gameId: "g3", player: "C", market: "tb", side: "over", line: 1.5, odds: 200 }] },
    ] },
    ufc: { cards: [
      { tier: "medium", legs: [{ eventId: "b1", player: "D", market: "ml", side: "win", odds: -140 },
                               { eventId: "b2", player: "E", market: "ml", side: "win", odds: 165 }] },
    ] },
  };
  const out = buildMultiLadder({
    liveSports: ["mlb", "ufc"], riskOrder: RISK_ORDER, date: "2026-08-17",
    ladderFor: (sport) => ladders[sport] ?? null,
    // This test is about the day-one LADDER MECHANICS. Settleability is a separate precondition
    // with its own test, so it is granted here rather than silently gating this one.
    settleableSports: ["mlb", "ufc"],
  });

  assert.ok(out.cards.length > 0, "two live sports with priced legs must produce at least one card");
  for (const c of out.cards) {
    assert.ok((c.sports ?? []).length >= MIN_SPORTS, `${c.tier} card draws on ${c.sports?.length} sport(s)`);
    assert.ok(Number.isFinite(c.combinedDecimal) && c.combinedDecimal > 1, `${c.tier} card has no usable price`);
    assert.equal(c.tierRecord, null, "an unsettled stream must carry a null record, never 0-0");
  }
  // The grid must resolve over them exactly as a single-sport ladder does.
  const g = resolveTierGrid({ tiers: BETTOR_TIERS, riskOrder: RISK_ORDER, cards: out.cards, skipped: out.skipped });
  assert.equal(g.cells.length, 16);
  assert.deepEqual(crossCardLegCollisions({ tiers: BETTOR_TIERS, riskOrder: RISK_ORDER, cards: out.cards }), []);
});

test("MULTI · an unpriced leg is dropped rather than defaulted to even money", () => {
  const ladders = {
    mlb: { cards: [{ tier: "medium", legs: [{ gameId: "g1", player: "A", market: "hits", side: "over", line: 0.5, odds: null }] }] },
    ufc: { cards: [{ tier: "medium", legs: [{ eventId: "b1", player: "D", market: "ml", side: "win", odds: -140 },
                                            { eventId: "b2", player: "E", market: "ml", side: "win", odds: 150 }] }] },
  };
  const out = buildMultiLadder({ liveSports: ["mlb", "ufc"], riskOrder: RISK_ORDER, date: "2026-08-17", ladderFor: (s) => ladders[s] ?? null, settleableSports: ["mlb", "ufc"] });
  // Dropping MLB's only leg leaves one sport, so every band must refuse rather than publish a
  // single-sport card or price the missing leg at something convenient.
  assert.equal(out.cards.length, 0);
  assert.ok(out.skipped.every((s) => /at least 2 sports/.test(s.reason)), "refusal must name the real cause");
});

test("PRODUCTION TRUTH · every published grid is internally consistent", () => {
  const dir = path.join(process.cwd(), "public", "data", "parlays", "tier-grid");
  if (!fs.existsSync(dir)) return;

  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith("-latest.json"))) {
    const g = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

    if (g.state !== "PUBLISHED") {
      // A closed sport must say why and must carry no cards at all.
      assert.ok(g.reason, `${f} is not published and gives no reason`);
      assert.deepEqual(g.cells, [], `${f} is closed but carries cells`);
      assert.deepEqual(g.tiers, [], `${f} is closed but carries tiers`);
      continue;
    }

    assert.equal(g.cells.length, 16, `${f} is not a 4x4`);
    // Every offered cell must point at a card that is actually in the artifact.
    const byId = new Set((g.cards ?? []).map((c) => c.slipId));
    for (const c of g.cells.filter((x) => x.state === "OFFERED")) {
      assert.ok(byId.has(c.slipId), `${f}: cell ${c.tier}/${c.band} points at ${c.slipId}, which is not published`);
    }
    // And the disjointness the whole design rests on, checked against what actually shipped.
    const collisions = crossCardLegCollisions({
      tiers: BETTOR_TIERS, riskOrder: RISK_ORDER,
      cards: (g.cards ?? []).map((c) => ({ tier: c.band, slipId: c.slipId, legs: c.legs })),
    });
    assert.deepEqual(collisions, [], `${f} ships a leg on two cards one reader would hold`);
  }
});

test("PRODUCTION TRUTH · no grid bakes in a stake", () => {
  const dir = path.join(process.cwd(), "public", "data", "parlays", "tier-grid");
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    // Bankroll is entered in the reader's browser and never leaves it, so the artifact cannot know
    // it. A stake field would be a recommendation nobody asked for.
    for (const banned of [/"stake"/, /"unitSize"/, /"recommendedStake"/, /"betAmount"/]) {
      assert.doesNotMatch(raw, banned, `${f} carries a staking field: ${banned}`);
    }
  }
});

test("the client-side tier derivation agrees with the precomputed grid", async () => {
  /*
   * The board still derives tier -> bands in the browser to render, while the artifact resolves the
   * same mapping on the server. Two derivations of one thing is exactly the drift this repo has
   * been bitten by (a registry keying soccer as "soccer" against a gate keying it "epl"). Neither
   * is removed — the artifact is what ships and can be graded, the client derivation is what paints
   * — so this asserts they cannot disagree.
   */
  const { tierForBankroll, risksForTier } = await import("../prefs/bettor-tier.ts");
  const g = resolveTierGrid({
    tiers: BETTOR_TIERS, riskOrder: RISK_ORDER,
    cards: RISK_ORDER.map((b) => ({ tier: b, slipId: `s-${b}`, legs: [{ player: b, market: "m", side: "over", line: 0.5 }] })),
    skipped: [],
  });

  // A bankroll from inside every tier's range, plus the boundaries themselves.
  for (const bankroll of [1, 25, 49, 50, 75, 99, 100, 175, 249, 250, 1000, 25_000]) {
    const tier = tierForBankroll(bankroll);
    const clientBands = [...risksForTier(tier)];
    const row = g.tiers.find((t) => t.id === tier.id);
    assert.ok(row, `bankroll ${bankroll} resolved to tier ${tier.id}, which the grid does not contain`);
    assert.deepEqual(clientBands, [...row.bands],
      `at $${bankroll} the browser would show ${clientBands.join("/")} but the artifact says ${row.bands.join("/")}`);
  }
});

test("the bankroll ranges cover the number line with no gap and no overlap", () => {
  // A gap would drop a reader into no tier at all; an overlap would make the tier depend on
  // iteration order. Both are silent — the reader just sees the wrong set.
  const sorted = [...BETTOR_TIERS].sort((a, b) => a.minBankroll - b.minBankroll);
  assert.equal(sorted[0].minBankroll, 0, "the lowest tier must start at zero");
  assert.equal(sorted[sorted.length - 1].maxBankroll, null, "the top tier must be unbounded");
  for (let i = 0; i < sorted.length - 1; i++) {
    assert.equal(sorted[i].maxBankroll, sorted[i + 1].minBankroll,
      `${sorted[i].id} ends at ${sorted[i].maxBankroll} but ${sorted[i + 1].id} starts at ${sorted[i + 1].minBankroll}`);
  }
  // cardsPerDay must rise with bankroll, never fall — a bigger bankroll seeing fewer bands would
  // invert the whole design.
  for (let i = 0; i < sorted.length - 1; i++) {
    assert.ok(sorted[i].cardsPerDay <= sorted[i + 1].cardsPerDay, "cards per day must not fall as bankroll rises");
  }
});

test("MULTI · a card's band is decided by its PRICE, never by its leg count", async () => {
  /*
   * The defect this pins. The first cross-sport ladder built one card per band using that band's
   * leg CAP and labelled the result with the band's name — nothing checked the price. Against a
   * real two-sport slate it published a +203 card as "Low risk" (low ends at +100), and three of
   * its four cards were mislabelled, every one understating the risk. The worst case landed on
   * bronze, which is shown ONE card precisely because that band is meant to be the calmest.
   */
  const { getRiskBucketForCombinedOdds } = await import("./risk-odds-bands.mjs");

  // Two sports, prices that make a 2-leg card land outside `low` — the real situation.
  const ladders = {
    mlb: { cards: [{ tier: "medium", legs: [
      { gameId: "g1", player: "A", market: "hits", side: "over", line: 0.5, odds: -185 },
      { gameId: "g2", player: "B", market: "hits", side: "over", line: 0.5, odds: 150 },
      { gameId: "g3", player: "C", market: "tb", side: "over", line: 1.5, odds: 180 },
    ] }] },
    ufc: { cards: [{ tier: "medium", legs: [
      { eventId: "b1", player: "D", market: "ml", side: "win", odds: -105 },
      { eventId: "b2", player: "E", market: "ml", side: "win", odds: 140 },
      { eventId: "b3", player: "F", market: "ml", side: "win", odds: 165 },
    ] }] },
  };
  const out = buildMultiLadder({
    liveSports: ["mlb", "ufc"], riskOrder: RISK_ORDER, date: "2026-08-18",
    ladderFor: (s) => ladders[s] ?? null,
    // Grade both, so this test isolates the BAND question from the settleability question.
    settleableSports: ["mlb", "ufc"],
  });

  assert.ok(out.cards.length > 0, "two sports with real prices should produce at least one card");
  for (const c of out.cards) {
    const actual = getRiskBucketForCombinedOdds(c.combinedAmerican);
    assert.equal(actual, c.tier,
      `a card at ${c.combinedAmerican} is labelled "${c.tier}" but prices into "${actual}"`);
  }
  // A band that cannot be filled must say what it reached, not be filled with the wrong card.
  for (const s of out.skipped) {
    assert.ok(s.reason && s.reason.length > 10, `${s.tier} was skipped with no usable reason`);
  }
});

test("MULTI · a card the settler cannot grade is never published", async () => {
  const { SETTLEABLE_SPORTS } = await import("./multi-sport.mjs");
  const ladders = {
    mlb: { cards: [{ tier: "medium", legs: [{ gameId: "g1", player: "A", market: "hits", side: "over", line: 0.5, odds: -120 }] }] },
    ufc: { cards: [{ tier: "medium", legs: [{ eventId: "b1", player: "D", market: "ml", side: "win", odds: 140 }] }] },
  };
  const out = buildMultiLadder({
    liveSports: ["mlb", "ufc"], riskOrder: RISK_ORDER, date: "2026-08-18",
    ladderFor: (s) => ladders[s] ?? null,
  });

  // With UFC ungradeable today, every band must refuse and say so — a card that cannot be graded
  // would sit pending forever and never enter the record, flattering the published hit rate.
  if (!SETTLEABLE_SPORTS.includes("ufc")) {
    assert.equal(out.cards.length, 0, "a cross-sport card containing an ungradeable leg was published");
    assert.ok(out.skipped.every((s) => /cannot grade/.test(s.reason)), "the refusal must name the real cause");
  }
});

test("MULTI · the settleable-sports list matches what the settler implements", () => {
  /*
   * A hardcoded capability list drifts from the capability. Adding a sport here without teaching
   * settle-lab-cards.mjs to grade it re-opens the exact hole the list closes, so this checks the
   * settler for evidence of each declared sport rather than trusting the declaration.
   */
  const src = fs.readFileSync(path.join(process.cwd(), "scripts", "parlays", "settle-lab-cards.mjs"), "utf8");
  const declared = /export const SETTLEABLE_SPORTS = \[([^\]]*)\]/.exec(
    fs.readFileSync(path.join(process.cwd(), "src", "lib", "parlays", "multi-sport.mjs"), "utf8"),
  )?.[1] ?? "";
  const sports = [...declared.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(sports.length > 0, "no settleable sports declared at all");

  const EVIDENCE = {
    mlb: /statsapi\.mlb\.com/,
    ufc: /graded-moneylines|ufc/i,
    nfl: /nfl/i,
    epl: /epl|soccer/i,
  };
  for (const sp of sports) {
    assert.ok(EVIDENCE[sp], `"${sp}" is declared settleable but this guard has no way to verify it`);
    assert.match(src, EVIDENCE[sp],
      `"${sp}" is declared settleable but settle-lab-cards.mjs shows no sign of grading it`);
  }
});

test("PRODUCTION TRUTH · every published leg carries a posted price", () => {
  /*
   * The cross-sport lane published three cards whose every leg read `odds: undefined`. The combined
   * price was right — the builder had the numbers, it just never put them on the leg — so the card
   * looked complete and quoted nothing. On a lane whose entire claim is that it quotes REAL POSTED
   * PRICES, a leg with no price is the one thing it must not ship.
   */
  const dir = path.join(process.cwd(), "public", "data", "parlays", "tier-grid");
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith("-latest.json"))) {
    const g = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (g.state !== "PUBLISHED") continue;
    for (const c of g.cards ?? []) {
      for (const l of c.legs ?? []) {
        assert.ok(Number.isFinite(l.odds) && l.odds !== 0,
          `${f}: ${c.band} card leg "${l.player}" publishes odds=${l.odds}`);
      }
      assert.ok(Number.isFinite(c.combinedAmerican), `${f}: ${c.band} card has no combined price`);
    }
  }
});

/* ── LEG IDENTITY IS THE EVENT PLUS THE SELECTION ───────────────────────────────────────────────
 *
 * The collision key was `player|market|side|line`, which works only while every leg names a person.
 * EPL is a TEAM market and its legs carry no player, so two entirely different fixtures both keyed
 * as "null|match_result|home|null" and a perfectly disjoint ladder was refused as a collision.
 *
 * These pin that adding the event made the key MORE accurate, not looser — the direction that
 * matters, since this guard is what stands between a reader and one bet wearing several hats.
 */
const legOf = (o) => ({ market: "match_result", side: "home", line: null, ...o });
const collide = (a, b) => crossCardLegCollisions({
  tiers: BETTOR_TIERS, riskOrder: RISK_ORDER,
  cards: [{ tier: "low", legs: [a] }, { tier: "medium", legs: [b] }],
});

test("a REAL collision is still caught — same selection, same event, two cards", () => {
  const hits = collide(legOf({ eventId: "E1", player: null }), legOf({ eventId: "E1", player: null }));
  assert.ok(hits.length > 0, "the same leg on two cards must still refuse to publish");
});

test("the same selection on DIFFERENT events is not a collision — it never was", () => {
  // This is the false positive that blocked EPL: two different fixtures, both "home".
  assert.equal(collide(legOf({ eventId: "E1", player: null }), legOf({ eventId: "E2", player: null })).length, 0);
});

test("an MLB doubleheader is two legs, not one — a case that was always latent", () => {
  // The same player appears in two games on one slate day. Under the old key those keyed identically
  // and a legitimate ladder would have been refused; nobody had hit it because doubleheaders are rare.
  const a = legOf({ gameId: "G1", player: "Pete Alonso", market: "batter_hits", side: "Over", line: 0.5 });
  const b = legOf({ gameId: "G2", player: "Pete Alonso", market: "batter_hits", side: "Over", line: 0.5 });
  assert.equal(collide(a, b).length, 0);
  // ...but the SAME player in the SAME game on two cards is exactly what this guard exists for.
  assert.ok(collide(a, { ...b, gameId: "G1" }).length > 0);
});
