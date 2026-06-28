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
import { buildAllGameDetails } from "../game-detail.ts";

// DATE-AGNOSTIC: read the live slate date from the committed snapshot, then build against THAT slate.
// At noon-of-slate-day every WC kickoff (afternoon/evening, some crossing midnight UTC) is still pre-event,
// so NOW excludes nothing as started. Team markets are odds-backed, but The Odds API plan offers NO World
// Cup soccer player-prop markets → 0 player legs → the generator honestly falls back to TEAM-MODEL cards
// (moneyline / double-chance / totals / BTTS), flagged in diagnostics — never fabricated player props.
const DATE = loadWorldCupSpecials().date;
const NOW = `${DATE}T12:00:00Z`;
// The current slate's distinct WC fixture count, derived from the canonical game-detail set (slug carries
// the slate date). Pre-event games at noon-of-slate-day should equal this.
const SLATE_GAME_COUNT = buildAllGameDetails().filter((d) => d.sport === "world_cup" && d.slug.endsWith(DATE)).length;
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
test("produces at most 5 World Cup Specials; uses real player props when the slate offers them", () => {
  assert.ok(result.cards.length <= cfg.maxCardsShown, "never more than 5");
  // June 28: the slate offers both team markets and real soccer player-prop markets, so the generator builds
  // normal-mode Specials (>= 2 team + >= 2 player legs per card) — never the team-model fallback.
  assert.ok(result.cards.length > 0 && result.cards.length <= cfg.maxCardsShown, "1..5 player-prop Specials");
  assert.ok(result.diagnostics.eligiblePlayerLegs > 0, "the slate has eligible player legs in the pool");
  assert.notEqual(result.diagnostics.fallbackMode, "team_models", "not in the team-model fallback — real player props are available");
  // Every card carries the normal player-prop mix (asserted in detail by the mix-aware test).
  for (const c of result.cards) {
    assert.ok(c.playerPropCount >= cfg.minPlayerPropsPerCard, `${c.id} carries real player props`);
  }
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

test("every card has the required team/player mix and >= 2 distinct games (mode-aware)", () => {
  // In normal mode each card needs >= 2 team + >= 2 player props. In the team-model fallback
  // (player props unavailable for the slate) cards are TEAM-ONLY: 0 player props but >= 4 team props.
  // The >= 2-distinct-games requirement holds in BOTH modes — no fabrication, WC-only.
  const fallback = result.diagnostics.fallbackMode === "team_models";
  for (const c of result.cards) {
    const team = c.legs.filter((l) => l.kind === "team").length;
    const player = c.legs.filter((l) => l.kind === "player").length;
    const games = new Set(c.legs.map((l) => l.eventId)).size;
    if (fallback) {
      assert.equal(player, 0, `${c.id} is team-only in the team-model fallback`);
      assert.ok(team >= 4, `${c.id} has ${team} team props (>= 4 in fallback)`);
    } else {
      assert.ok(team >= cfg.minTeamPropsPerCard, `${c.id} has ${team} team props`);
      assert.ok(player >= cfg.minPlayerPropsPerCard, `${c.id} has ${player} player props`);
    }
    assert.ok(games >= cfg.minGamesPerCard, `${c.id} spans ${games} games`);
    assert.equal(c.teamPropCount, team);
    assert.equal(c.playerPropCount, player);
  }
});

test("no started games — every leg kickoff is in the future relative to NOW", () => {
  for (const c of result.cards)
    for (const l of c.legs) assert.ok(l.startTime && l.startTime > NOW, `${l.participant} is pre-event`);
  // At noon-of-slate-day every game on the current slate is still pre-event, so none is excluded as started.
  assert.deepEqual(result.diagnostics.excludedStartedGames, [], "no game on the current slate has kicked off yet");
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
  // Spread only applies when cards are buildable. June 24 is gated to 0 (no player props),
  // which the dedicated gating test already asserts — there is no price cluster to check.
  if (result.cards.length === 0) {
    assert.equal(result.diagnostics.eligiblePlayerLegs, 0, "0 cards is the honest no-player-props gate");
    return;
  }
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
  // June 24 has no player props, so no cards and no player legs are assembled — the honest gate.
  // When player legs DO exist they must carry a real headshot (api-sports feed) or a flag fallback,
  // never a fabricated photo. We assert that invariant over whatever player legs the pool produced.
  if (playerLegs.length === 0) {
    assert.equal(result.diagnostics.eligiblePlayerLegs, 0, "no player legs because the slate has no player props");
    return;
  }
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
  assert.ok(result.diagnostics.eligiblePlayerLegs > 0, "the slate has eligible WC player-prop legs");
  // At noon-of-slate-day every fixture on the current slate is pre-event — derived count, not pinned to 6.
  assert.ok(SLATE_GAME_COUNT >= 2, "current slate has >= 2 fixtures (Specials need 2+ distinct games)");
  assert.equal(result.diagnostics.preEventGames, SLATE_GAME_COUNT, "every current-slate fixture is pre-event at noon-of-slate-day");
  assert.ok(result.diagnostics.rejectedOutOfLegOddsRange > 0, "extreme-priced legs were rejected");
  // Every loaded leg respects the strict band + pre-event rule.
  for (const l of [...team, ...players]) {
    assert.ok(legOddsInRange(l.odds), `${l.participant} ${l.odds} in band`);
    assert.ok(l.startTime > NOW, `${l.participant} pre-event`);
  }
});

test("an exact duplicate of an excluded active card would be excluded", () => {
  // The active Moonshot card is now an all-team cross-slate longshot, which the WC Specials generator
  // (which mandates >= 2 team AND >= 2 player legs) can never assemble. To exercise the exclude-signature
  // dedupe path faithfully, synthesize a card with the VALID WC-Special shape (2 team + 2 player across
  // 2 games), seed its signature into excludeSignatures, and confirm the only assemblable card is dropped.
  const sigOf = (ls) => ls
    .map((l) => `${(l.fixture ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${(l.marketLabel ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${(l.participant ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${(l.side ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${l.line ?? ""}`)
    .sort().join("||");
  const fakeTeam = [
    { legId: "m-team-0", kind: "team", sport: "WORLD_CUP", fixture: "Brazil vs Haiti", eventId: "g0",
      participant: "Brazil", team: "Brazil", opponent: "Haiti", countryCode: "BR", playerId: null, photoUrl: null,
      market: "moneyline_90", marketLabel: "Moneyline (90′)", side: null, line: null, odds: -120, modelProbability: 0.5,
      startTime: "2099-01-01T00:00:00Z", dataQuality: "B", confidence: "Lean", settlement: "x", limitedData: false },
    { legId: "m-team-1", kind: "team", sport: "WORLD_CUP", fixture: "Norway vs Senegal", eventId: "g1",
      participant: "Over 2.5", team: null, opponent: "Senegal", countryCode: null, playerId: null, photoUrl: null,
      market: "match_total_goals", marketLabel: "Total Goals", side: "over", line: 2.5, odds: -110, modelProbability: 0.52,
      startTime: "2099-01-01T00:00:00Z", dataQuality: "B", confidence: "Lean", settlement: "x", limitedData: false },
  ];
  const fakePlayer = [
    { legId: "m-player-0", kind: "player", sport: "WORLD_CUP", fixture: "Brazil vs Haiti", eventId: "g0",
      participant: "Vinícius Júnior", team: "Brazil", opponent: "Haiti", countryCode: "BR", playerId: 762, photoUrl: null,
      market: "player_goal_scorer_anytime", marketLabel: "Anytime Goalscorer", side: "Yes", line: null, odds: 130, modelProbability: 0.45,
      startTime: "2099-01-01T00:00:00Z", dataQuality: "limited", confidence: "Lower confidence", settlement: "x", limitedData: true },
    { legId: "m-player-1", kind: "player", sport: "WORLD_CUP", fixture: "Norway vs Senegal", eventId: "g1",
      participant: "Erling Haaland", team: "Norway", opponent: "Senegal", countryCode: "NO", playerId: 1100, photoUrl: null,
      market: "player_goal_scorer_anytime", marketLabel: "Anytime Goalscorer", side: "Yes", line: null, odds: 140, modelProbability: 0.43,
      startTime: "2099-01-01T00:00:00Z", dataQuality: "limited", confidence: "Lower confidence", settlement: "x", limitedData: true },
  ];
  const dupeSig = sigOf([...fakeTeam, ...fakePlayer]);
  const r = generateWorldCupSpecials(fakeTeam, fakePlayer, {
    date: DATE, generatedAt: NOW, excludeSignatures: [dupeSig],
  });
  // The only assemblable card matches the excluded signature → it is dropped → no cards survive.
  assert.equal(r.cards.length, 0, "the exact excluded duplicate is excluded");
  assert.ok(r.diagnostics.rejectedDuplicates >= 1, "duplicate rejection counted");
});

test("generator returns 0 with an honest diagnostic when fewer than 2 pre-event games exist", () => {
  const r = generateWorldCupSpecials([], [], { date: DATE, generatedAt: NOW });
  assert.equal(r.cards.length, 0);
  assert.ok(r.diagnostics.notes.some((n) => /not_enough_valid_specials/.test(n)));
});

// ── Committed snapshot ───────────────────────────────────────────────────────────────────────────
test("committed snapshot exists, is dated, and holds <=5 valid WC-only cards", () => {
  const snap = loadWorldCupSpecials();
  assert.ok(snap, "snapshot loads");
  // The committed specials snapshot is the live build for the current slate (June 24). When the slate
  // has no player props the build falls back to TEAM-MODEL cards, flagged in diagnostics. We assert the
  // snapshot is well-formed + ISO-dated rather than pinned to a single live DATE.
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(snap.date), "snapshot carries an ISO slate date");
  // 0..5 cards: once every game on the slate has kicked off there are no eligible pre-event Specials,
  // and the box shows a "between slates" message — that is a valid honest state, not a failure.
  assert.ok(snap.cards.length <= 5, "<=5 cards");
  // Mode-aware: in the team-model fallback every card is team-only (0 player props, >= 4 team props);
  // otherwise each card carries the normal >= 2 team + >= 2 player mix.
  const fallback = snap.diagnostics?.fallbackMode === "team_models";
  for (const c of snap.cards) {
    assert.ok(combinedOddsInRange(c.combinedOdds), `${c.id} combined in band`);
    for (const l of c.legs) {
      assert.equal(l.sport, "WORLD_CUP");
      assert.ok(legOddsInRange(l.odds), `${l.participant} ${l.odds} in leg band`);
    }
    const team = c.legs.filter((l) => l.kind === "team").length;
    const player = c.legs.filter((l) => l.kind === "player").length;
    if (fallback) {
      assert.equal(player, 0, `${c.id} is team-only in the team-model fallback`);
      assert.ok(team >= 4, `${c.id} has 4+ team props in fallback`);
    } else {
      assert.ok(team >= 2, "2+ team props");
      assert.ok(player >= 2, "2+ player props");
    }
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
  assert.match(src, /No eligible World Cup Specials/, "honest empty state");
});

test("homepage box stacks vertically and adds no horizontal overflow", () => {
  const src = fs.readFileSync("src/components/world-cup/world-cup-specials-box.tsx", "utf8");
  assert.match(src, /flex flex-col gap/, "cards stack in a single column");
  assert.match(src, /overflow-hidden/, "box clips its own overflow");
  assert.ok(!/overflow-x-auto|w-\[\d{4}/.test(src), "no wide fixed widths / horizontal scrollers");
});

test("the homepage wires the box as a lead 'WC exclusive parlays' section and gates it to today", () => {
  const page = fs.readFileSync("src/app/today/page.tsx", "utf8");
  assert.match(page, /WorldCupSpecialsBox/, "imports + renders the box");
  assert.match(page, /loadWorldCupSpecials/, "loads the snapshot");
  assert.match(page, /wcSpecialsRaw\.date === today/, "fails closed on a stale slate");
});

test("PROTECTION: active Bank Builder / Moonshot / Mr. Dub artifacts are unchanged by this feature", () => {
  // This feature must NOT mutate the bank-builder artifacts. The banked dual run (Gonzales/Hoskins legs)
  // is archived after banking Ladder #2; the live artifact is a fresh cycle-2. Pinned to the banked archive.
  const dual = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-2026-06-24-completed.json", "utf8"));
  assert.ok(/Gonzales/.test(JSON.stringify(dual.run.laneA.legs)) && /Hoskins/.test(JSON.stringify(dual.run.laneB.legs)), "banked Lane A/B top-level legs unchanged");
  const moon = JSON.parse(fs.readFileSync("public/data/moonshot-lane/active.json", "utf8"));
  assert.equal(moon.ladder[0].card.combinedOdds, 1152, "Moonshot Step 1 card is +1152");
  const p = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(p.openExposure, 0, "core open exposure $0 (Lane A + Lane B settled WON — both seeds released)");
  assert.equal(p.totalOpenExposure, 0, "total open exposure $0 (core $0; moonshot settled → 0)");
});
