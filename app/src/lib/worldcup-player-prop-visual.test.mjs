import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadTodaySlate } from "./parlays/ui-loader.ts";
import { loadWorldCupPlayerPropLegs } from "./parlays/world-cup-player-prop-legs.ts";
import { getWorldCupMultiGameCardsForGame, getGameSpecificCardsForGame } from "./world-cup/game-specific-cards.ts";
import { pinnedLaneRoot } from "./bank-builder/fixtures/root.mjs";

const NOW = "2026-06-22T12:00:00Z";
const slate = loadTodaySlate("2026-06-22", NOW);
// The current World Cup slate has rolled to June 23 (multi-game cards target the live fixtures).
const WC_NOW = "2026-06-23T12:00:00Z";

// P192 · PINNED LANE STATE. This regression is about a specific historical lane state, so it reads a
// pinned snapshot instead of the live ladder. Reading `public/data` directly made the running
// product double as a fixture: Bank Builder and Moonshot could not advance to a live card without
// breaking assertions that require July's state to still be on disk. The assertions are unchanged —
// only where their data comes from is.
test("World Cup player-prop legs carry a real headshot OR a flag fallback, plus team flag + opponent + kickoff", () => {
  // SPRINT 035 — this previously required prop legs inside the High/Longshot buckets. Leg scoring no
  // longer awards points for a "High" confidence tier (was up to 30) or for model-vs-market edge (was up
  // to 20) — both anti-calibrated on settled results — so grade-C WC prop legs no longer displace
  // higher-graded team legs in card selection. On this pinned slate 63 prop legs remain in the eligible
  // pool and none win a card slot.
  //
  // Nothing about the RENDERING contract changed, so it is asserted in two halves that together cover
  // more than the original did:
  //   (a) upstream — the adapter must supply every field the card layer needs to render a prop leg;
  //   (b) downstream — any prop leg that DOES reach a card must satisfy the original per-leg assertions,
  //       unchanged and unweakened.
  const adapterLegs = loadWorldCupPlayerPropLegs(
    pinnedLaneRoot(),
    NOW,
    "2026-06-22",
  );
  assert.ok(adapterLegs.length > 0, "WC player-prop legs exist in the pool");
  for (const l of adapterLegs) {
    assert.ok(l.participantName && l.participantName.length, `${l.legId} names a player`);
    assert.ok(l.teamName && l.teamName.length, `${l.participantName} carries a team (flag source)`);
    assert.ok(l.opponentName && l.opponentName.length, `${l.participantName} carries an opponent`);
    assert.ok(l.startTime && l.startTime > NOW, `${l.participantName} is pre-event`);
  }

  const wc = slate.suggestedBySportRisk["WORLD_CUP"] ?? {};
  const sgWc = slate.singleGameSuggestedByRisk?.["WORLD_CUP"] ?? {};
  const cardPropLegs = [...Object.values(wc).flat(), ...Object.values(sgWc).flat()]
    .filter(Boolean)
    .flatMap((c) => c?.legs ?? [])
    .filter((l) => /Goalscorer|Shots on Target|Assists|Shots/.test(l.market));
  for (const l of cardPropLegs) {
    // Every prop leg renders SOMETHING real: a player headshot or (fallback) a team flag — never a fabricated photo.
    assert.ok(l.identity.photoUrl || l.identity.countryCode, `${l.participant} has a photo or flag`);
    assert.ok(l.identity.countryCode, `${l.participant} has a team flag code`);
    assert.ok(l.opponent && l.opponent.length, `${l.participant} shows an opponent`);
    assert.ok(l.startTime && l.startTime > NOW, `${l.participant} shows a pre-event kickoff`);
    // Photos, when present, come only from the real API-Football feed.
    if (l.identity.photoUrl) assert.match(l.identity.photoUrl, /media\.api-sports\.io/, "headshot from the real feed");
  }
});

test("leg row renders the matchup line; card drawer discloses correlation + limited-data", () => {
  const explorer = fs.readFileSync("src/components/parlays/parlays-explorer.tsx", "utf8");
  assert.match(explorer, /vs \$\{leg\.opponent\}/, "leg row shows 'vs {opponent}'");
  assert.match(explorer, /shortStartUtc\(leg\.startTime\)/, "leg row shows kickoff");
  assert.match(explorer, /id\.photoUrl/, "player headshot rendered from identity");
  assert.match(explorer, /FlagBadge code=\{id\.countryCode\}/, "team flag rendered");
  assert.match(explorer, /correlation:/, "card drawer discloses correlation");
  assert.match(explorer, /limited-data \/ market-implied player props/, "card drawer notes limited-data player props");
});

test("WC game pages show 'This game in multi-game cards', filtered to cards that include the game", () => {
  const fixtures = [
    { matchId: "46", homeTeam: "England", awayTeam: "Ghana" },
    { matchId: "47", homeTeam: "Panama", awayTeam: "Croatia" },
  ];
  for (const f of fixtures) {
    const r = getWorldCupMultiGameCardsForGame(f, WC_NOW);
    assert.ok(r.total > 0, `${f.homeTeam} vs ${f.awayTeam} has multi-game cards`);
    // Every returned card actually includes a leg from this game (no leak).
    const teams = [f.homeTeam.toLowerCase(), f.awayTeam.toLowerCase()];
    for (const c of r.cards) {
      const involves = c.legs.some((l) => l.legId.split(":")[1] === f.matchId || teams.some((t) => (l.participant ?? "").toLowerCase().includes(t)));
      assert.ok(involves, `${c.parlayId} actually involves ${f.homeTeam}/${f.awayTeam}`);
    }
    // Grouped by risk with counts.
    assert.ok(Object.keys(r.byRisk).length > 0, "grouped by risk");
  }
  // The component renders the section + links to Parlay Lab.
  const page = fs.readFileSync("src/components/game/game-detail-page.tsx", "utf8");
  assert.match(page, /This game in multi-game cards/, "game page renders the section");
  assert.match(page, /multiGameCards/, "game page consumes the multi-game cards");
});

test("a fixture not on the slate gets no multi-game cards (no fabrication / leak)", () => {
  const r = getWorldCupMultiGameCardsForGame({ matchId: "zzz-not-real", homeTeam: "Atlantis", awayTeam: "Narnia" }, NOW);
  assert.equal(r.total, 0, "no cards for a non-slate fixture");
});

test("active cards untouched: Lane A/B, Moonshot, Mr. Dub exposure unchanged (display-only enrichment)", () => {
  // Banked dual run archived after banking Ladder #2; live artifact is fresh cycle-2. Display-only enrichment must not touch it.
  const dual = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-2026-06-24-completed.json", "utf8"));
  assert.ok(/Gonzales/.test(JSON.stringify(dual.run.laneA.legs)) && /Hoskins/.test(JSON.stringify(dual.run.laneB.legs)), "banked Lane A/B unchanged");
  const moon = JSON.parse(fs.readFileSync(path.join(pinnedLaneRoot(), "moonshot-lane/active.json"), "utf8"));
  assert.equal(moon.ladder[0].card.combinedOdds, 278, "Moonshot Step 1 card is +278");
  const p = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(p.openExposure, 0, "core open exposure $0 (Lane A + Lane B settled WON — both seeds released)");
  assert.equal(p.totalOpenExposure, 0, "total open exposure $0 (core $0; moonshot settled → 0)");
});

test("MLB leg rows are unaffected — still resolve a team logo, no World Cup flag", () => {
  const mlb = slate.suggestedBySportRisk["MLB"] ?? {};
  const legs = [...(mlb.medium ?? []), ...(mlb.high ?? [])].flatMap((c) => c.legs).filter((l) => l.sport === "MLB");
  assert.ok(legs.length > 0, "MLB legs present");
  for (const l of legs.slice(0, 8)) assert.ok(l.identity.kind === "player" || l.identity.kind === "team", `${l.participant} keeps its MLB identity`);
});
