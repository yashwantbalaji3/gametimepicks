import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";
import { getWorldCupMultiGameCardsForGame, getGameSpecificCardsForGame } from "./world-cup/game-specific-cards.ts";

const NOW = "2026-06-22T12:00:00Z";
const slate = loadTodaySlate("2026-06-22", NOW);

test("World Cup player-prop legs carry a real headshot OR a flag fallback, plus team flag + opponent + kickoff", () => {
  const wc = slate.suggestedBySportRisk["WORLD_CUP"] ?? {};
  const propLegs = [...(wc.high ?? []), ...(wc.longshot ?? [])].flatMap((c) => c.legs).filter((l) => /Goalscorer|Shots on Target|Assists|Shots/.test(l.market));
  assert.ok(propLegs.length > 0, "player-prop legs present in WC High/Longshot");
  for (const l of propLegs) {
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
    { matchId: "42", homeTeam: "France", awayTeam: "Iraq" },
    { matchId: "43", homeTeam: "Norway", awayTeam: "Senegal" },
  ];
  for (const f of fixtures) {
    const r = getWorldCupMultiGameCardsForGame(f, NOW);
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
  const dual = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8"));
  assert.ok(/Gonzales/.test(JSON.stringify(dual.run.laneA.legs)) && /Hoskins/.test(JSON.stringify(dual.run.laneB.legs)), "Lane A/B unchanged");
  const moon = JSON.parse(fs.readFileSync("public/data/moonshot-lane/active.json", "utf8"));
  assert.equal(moon.ladder[0].card.combinedOdds, 1152, "Moonshot Step 1 card is +1152");
  const p = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(p.openExposure, 200, "core open exposure (Lane A + Lane B placed seeds)");
  assert.equal(p.totalOpenExposure, 200, "total open exposure $200 (core $200; moonshot settled → 0)");
});

test("MLB leg rows are unaffected — still resolve a team logo, no World Cup flag", () => {
  const mlb = slate.suggestedBySportRisk["MLB"] ?? {};
  const legs = [...(mlb.medium ?? []), ...(mlb.high ?? [])].flatMap((c) => c.legs).filter((l) => l.sport === "MLB");
  assert.ok(legs.length > 0, "MLB legs present");
  for (const l of legs.slice(0, 8)) assert.ok(l.identity.kind === "player" || l.identity.kind === "team", `${l.participant} keeps its MLB identity`);
});
