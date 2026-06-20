import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  WORLD_CUP_SPECIALS_CONFIG,
  legOddsInRange,
  combinedOddsInRange,
  buildWorldCupSpecials,
  loadSpecialsTeamLegs,
  loadSpecialsPlayerLegs,
  generateWorldCupSpecials,
  loadWorldCupSpecials,
} from "./world-cup-specials.ts";
import { combinedAmerican } from "../parlays/odds-math.ts";

const DATE = "2026-06-19";
// Generation time AFTER USA (19:00Z) + Scotland/Morocco (22:00Z) kicked off — only Brazil (00:30Z)
// and Turkey (03:00Z) remain pre-event. This is the real-world late-slate state.
const NOW = "2026-06-19T22:30:00Z";
const cfg = WORLD_CUP_SPECIALS_CONFIG;
const result = buildWorldCupSpecials({ nowIso: NOW, date: DATE });

// ── Config rules ─────────────────────────────────────────────────────────────────────────────────
test("config: strict per-leg odds band rejects -250/-251/+200/+201, accepts inside", () => {
  assert.equal(legOddsInRange(-249), true);
  assert.equal(legOddsInRange(199), true);
  assert.equal(legOddsInRange(-250), false); // boundary rejected
  assert.equal(legOddsInRange(-251), false);
  assert.equal(legOddsInRange(200), false);  // boundary rejected
  assert.equal(legOddsInRange(201), false);
  assert.equal(legOddsInRange(-400), false);  // Turkey-or-Draw style
  assert.equal(legOddsInRange(-1100), false); // Brazil ML style
});

test("config: combined odds band accepts +701..+2999, rejects the edges and outside", () => {
  assert.equal(combinedOddsInRange(701), true);
  assert.equal(combinedOddsInRange(2999), true);
  assert.equal(combinedOddsInRange(700), false);
  assert.equal(combinedOddsInRange(3000), false);
  assert.equal(combinedOddsInRange(500), false);
  assert.equal(combinedOddsInRange(3200), false);
});

// ── Generator output ─────────────────────────────────────────────────────────────────────────────
test("produces at most 5 World Cup Specials, and 5 with today's pool", () => {
  assert.ok(result.cards.length <= cfg.maxCardsShown, "never more than 5");
  assert.equal(result.cards.length, 5, "5 cards from today's pre-event pool");
});

test("every card is World Cup only — no MLB / UFC / mixed legs", () => {
  for (const c of result.cards)
    for (const l of c.legs) assert.equal(l.sport, "WORLD_CUP", `${l.participant} is World Cup`);
});

test("every card's combined odds is > +700 and < +3000 (recomputed from legs, not trusted)", () => {
  for (const c of result.cards) {
    const recomputed = combinedAmerican(c.legs.map((l) => l.odds));
    assert.equal(recomputed, c.combinedOdds, `${c.id} combinedOdds matches the legs`);
    assert.ok(combinedOddsInRange(c.combinedOdds), `${c.id} ${c.combinedOdds} in band`);
  }
});

test("every leg's odds is > -250 and < +200", () => {
  for (const c of result.cards)
    for (const l of c.legs) assert.ok(legOddsInRange(l.odds), `${l.participant} ${l.odds} in leg band`);
});

test("every card has >= 2 team props, >= 2 player props, and >= 2 distinct games", () => {
  for (const c of result.cards) {
    const team = c.legs.filter((l) => l.kind === "team").length;
    const player = c.legs.filter((l) => l.kind === "player").length;
    const games = new Set(c.legs.map((l) => l.eventId)).size;
    assert.ok(team >= cfg.minTeamPropsPerCard, `${c.id} has ${team} team props`);
    assert.ok(player >= cfg.minPlayerPropsPerCard, `${c.id} has ${player} player props`);
    assert.ok(games >= cfg.minGamesPerCard, `${c.id} spans ${games} games`);
    assert.equal(c.teamPropCount, team);
    assert.equal(c.playerPropCount, player);
  }
});

test("no started games — every leg kickoff is in the future relative to NOW", () => {
  for (const c of result.cards)
    for (const l of c.legs) assert.ok(l.startTime && l.startTime > NOW, `${l.participant} is pre-event`);
  // The two kicked-off games are recorded as excluded, never used.
  assert.ok(result.diagnostics.excludedStartedGames.includes("USA vs Australia"));
  assert.ok(result.diagnostics.excludedStartedGames.includes("Scotland vs Morocco"));
});

test("no fabricated markets — only the real posted team + player market labels appear", () => {
  const allowed = new Set([
    "Moneyline (90′)", "Double Chance", "Total Goals", "Both Teams To Score", "Draw No Bet",
    "Anytime Goalscorer", "Shots on Target", "Assists", "Shots",
  ]);
  for (const c of result.cards)
    for (const l of c.legs) assert.ok(allowed.has(l.marketLabel), `${l.marketLabel} is a real posted market`);
  // No invented "score or assist" combined market, no invented "first to score".
  const blob = JSON.stringify(result);
  assert.ok(!/score or assist/i.test(blob), "no fabricated 'score or assist' market");
  assert.ok(!/first to score/i.test(blob), "no fabricated 'first to score' market");
});

test("no duplicate full cards; cards are meaningfully distinct", () => {
  const sigs = result.cards.map((c) => c.legs.map((l) => l.legId).sort().join("|"));
  assert.equal(new Set(sigs).size, sigs.length, "all 5 card signatures are unique");
});

test("cards spread across the odds band (not all clustered at one price)", () => {
  const odds = result.cards.map((c) => c.combinedOdds).sort((a, b) => a - b);
  assert.ok(odds[odds.length - 1] - odds[0] >= 500, `spread ${odds[0]}..${odds[odds.length - 1]} is meaningful`);
});

test("each card exposes the disclosure fields the homepage renders", () => {
  for (const c of result.cards) {
    assert.equal(c.stakePreview, 10);
    assert.ok(c.projectedReturn > c.stakePreview, "projected return exceeds the $10 stake");
    assert.ok(Array.isArray(c.whyThisCard) && c.whyThisCard.length, "why this card");
    assert.ok(Array.isArray(c.whyItCanFail) && c.whyItCanFail.length, "why it can fail");
    assert.ok(Array.isArray(c.settlementNotes) && c.settlementNotes.length, "settlement notes");
    assert.ok(/correlation|stack|independent/.test(c.correlationProfile), "correlation profile");
    assert.ok(/limited-data|market-implied/.test(c.dataQuality + " " + c.whyItCanFail.join(" ")), "data-quality note");
  }
});

test("player legs carry a real headshot OR a flag fallback — never a fabricated photo", () => {
  const playerLegs = result.cards.flatMap((c) => c.legs).filter((l) => l.kind === "player");
  assert.ok(playerLegs.length > 0, "player legs present");
  for (const l of playerLegs) {
    assert.ok(l.photoUrl || l.countryCode, `${l.participant} has a photo or flag`);
    if (l.photoUrl) assert.match(l.photoUrl, /media\.api-sports\.io/, "headshot from the real feed");
  }
});

test("diagnostics report the real eligible-pool sizes + rejection counts", () => {
  const team = loadSpecialsTeamLegs(process.cwd() + "/public/data", NOW, DATE);
  const players = loadSpecialsPlayerLegs(process.cwd() + "/public/data", NOW, DATE);
  assert.equal(result.diagnostics.eligibleTeamLegs, team.length);
  assert.equal(result.diagnostics.eligiblePlayerLegs, players.length);
  assert.equal(result.diagnostics.preEventGames, 2, "exactly 2 pre-event games");
  assert.ok(result.diagnostics.rejectedOutOfLegOddsRange > 0, "extreme-priced legs were rejected");
  // Every loaded leg respects the strict band + pre-event rule.
  for (const l of [...team, ...players]) {
    assert.ok(legOddsInRange(l.odds), `${l.participant} ${l.odds} in band`);
    assert.ok(l.startTime > NOW, `${l.participant} pre-event`);
  }
});

test("an exact duplicate of the active Moonshot card would be excluded", () => {
  // Synthesize the Moonshot active card as a candidate, plus a clean distinct card, and confirm the
  // generator drops the duplicate via the exclude-signature path.
  const moon = JSON.parse(fs.readFileSync("public/data/moonshot-lane/active.json", "utf8"));
  const legs = moon.ladder[0].card.legs;
  const sigOf = (ls) => ls
    .map((l) => `${(l.fixture ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${(l.marketLabel ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${(l.participant ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${(l.side ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${l.line ?? ""}`)
    .sort().join("||");
  const moonSig = sigOf(legs);
  // Build SpecialLeg copies of the Moonshot legs so the generated combo's signature equals moonSig.
  const fakeTeam = legs.filter((l) => l.kind === "team").map((l, i) => ({
    legId: `m-team-${i}`, kind: "team", sport: "WORLD_CUP", fixture: l.fixture, eventId: `g${i}`,
    participant: l.participant, team: l.team ?? null, opponent: l.opponent, countryCode: l.countryCode,
    playerId: null, photoUrl: null, market: l.market, marketLabel: l.marketLabel, side: l.side ?? null,
    line: l.line ?? null, odds: -120, modelProbability: 0.5, startTime: "2099-01-01T00:00:00Z",
    dataQuality: "B", confidence: "Lean", settlement: "x", limitedData: false,
  }));
  const fakePlayer = legs.filter((l) => l.kind === "player").map((l, i) => ({
    legId: `m-player-${i}`, kind: "player", sport: "WORLD_CUP", fixture: l.fixture, eventId: `g${10 + i}`,
    participant: l.participant, team: l.team ?? null, opponent: l.opponent, countryCode: l.countryCode,
    playerId: l.playerId ?? null, photoUrl: l.photoUrl ?? null, market: l.market, marketLabel: l.marketLabel,
    side: l.side ?? null, line: l.line ?? null, odds: 130, modelProbability: 0.45,
    startTime: "2099-01-01T00:00:00Z", dataQuality: "limited", confidence: "Lower confidence", settlement: "x", limitedData: true,
  }));
  const r = generateWorldCupSpecials(fakeTeam, fakePlayer, {
    date: DATE, generatedAt: NOW, excludeSignatures: [moonSig],
  });
  // The only assemblable card is the Moonshot duplicate → it is excluded → no cards survive.
  assert.equal(r.cards.length, 0, "the exact Moonshot duplicate is excluded");
  assert.ok(r.diagnostics.rejectedDuplicates >= 1, "duplicate rejection counted");
});

test("generator returns 0 with an honest diagnostic when fewer than 2 pre-event games exist", () => {
  const r = generateWorldCupSpecials([], [], { date: DATE, generatedAt: NOW });
  assert.equal(r.cards.length, 0);
  assert.ok(r.diagnostics.notes.some((n) => /not_enough_valid_specials/.test(n)));
});

// ── Committed snapshot ───────────────────────────────────────────────────────────────────────────
test("committed snapshot exists, is today-dated, and holds <=5 valid WC-only cards", () => {
  const snap = loadWorldCupSpecials();
  assert.ok(snap, "snapshot loads");
  assert.equal(snap.date, DATE, "snapshot is today-dated");
  assert.ok(snap.cards.length <= 5 && snap.cards.length > 0, "1..5 cards");
  for (const c of snap.cards) {
    assert.ok(combinedOddsInRange(c.combinedOdds), `${c.id} combined in band`);
    for (const l of c.legs) {
      assert.equal(l.sport, "WORLD_CUP");
      assert.ok(legOddsInRange(l.odds), `${l.participant} ${l.odds} in leg band`);
    }
    assert.ok(c.legs.filter((l) => l.kind === "team").length >= 2, "2+ team props");
    assert.ok(c.legs.filter((l) => l.kind === "player").length >= 2, "2+ player props");
  }
});

// ── Homepage component + protections ───────────────────────────────────────────────────────────────
test("homepage box renders title, badges, $10 projection, mix counts, and the disclosure drawer", () => {
  const src = fs.readFileSync("src/components/world-cup/world-cup-specials-box.tsx", "utf8");
  assert.match(src, /World Cup Specials/, "renders the title");
  assert.match(src, /High-volatility/, "high-volatility badge");
  assert.match(src, /Paper-only/, "paper-only badge");
  assert.match(src, /Odds-backed/, "odds-backed badge");
  assert.match(src, /usd\(card\.stakePreview\)\} → \{usd\(card\.projectedReturn\)/, "shows $10 → projected return");
  assert.match(src, /team \/ \{card\.playerPropCount\} player/, "shows team/player mix");
  assert.match(src, /correlation:/, "discloses correlation");
  assert.match(src, /Why this card/, "why this card drawer label");
  assert.match(src, /No World Cup Specials available yet/, "honest empty state");
});

test("homepage box stacks vertically and adds no horizontal overflow", () => {
  const src = fs.readFileSync("src/components/world-cup/world-cup-specials-box.tsx", "utf8");
  assert.match(src, /flex flex-col gap/, "cards stack in a single column");
  assert.match(src, /overflow-hidden/, "box clips its own overflow");
  assert.ok(!/overflow-x-auto|w-\[\d{4}/.test(src), "no wide fixed widths / horizontal scrollers");
});

test("the homepage page wires the box below Today's Focus and gates it to today", () => {
  const page = fs.readFileSync("src/app/today/page.tsx", "utf8");
  assert.match(page, /WorldCupSpecialsBox/, "imports + renders the box");
  assert.match(page, /loadWorldCupSpecials/, "loads the snapshot");
  assert.match(page, /wcSpecialsRaw\.date === today/, "fails closed on a stale slate");
});

test("PROTECTION: active Bank Builder / Moonshot / Mr. Dub artifacts are unchanged by this feature", () => {
  const dual = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8"));
  assert.ok(/Gonzales/.test(JSON.stringify(dual.run.laneA.legs)) && /Hoskins/.test(JSON.stringify(dual.run.laneB.legs)), "Lane A/B unchanged");
  const moon = JSON.parse(fs.readFileSync("public/data/moonshot-lane/active.json", "utf8"));
  assert.equal(moon.ladder[0].card.combinedOdds, 808, "Moonshot active card unchanged");
  const p = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(p.openExposure, 0, "core exposure settled to $0 (June 19 cards officially settled)");
  assert.equal(p.totalOpenExposure, 0, "total exposure $0 after settlement");
});
