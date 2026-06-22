import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { loadWorldCupPlayerPropLegs } from "./parlays/world-cup-player-prop-legs.ts";
import { loadTodaySlate } from "./parlays/ui-loader.ts";
import { getRiskBucketForCombinedOdds } from "./parlays/risk-odds-bands.ts";

const root = path.join(process.cwd(), "public", "data");
const NOW = "2026-06-19T21:05:00Z";
const legs = loadWorldCupPlayerPropLegs(root, NOW, "2026-06-19");
const REAL_MARKETS = new Set(["Anytime Goalscorer", "Shots on Target", "Assists", "Shots"]);

test("player-prop adapter returns only REAL posted markets, odds-backed + pre-event + guarded", () => {
  assert.ok(legs.length > 0, "real player-prop legs present");
  for (const l of legs) {
    assert.ok(REAL_MARKETS.has(l.marketType), `${l.marketType} is a real posted market (no fakes)`);
    assert.equal(l.sport, "WORLD_CUP");
    assert.ok(typeof l.odds === "number", `${l.participantName} odds-backed`);
    assert.ok(l.odds >= -500 && l.odds <= 1200, `${l.participantName} ${l.odds} within leg guards`);
    assert.ok(l.startTime && l.startTime > NOW, `${l.participantName} pre-event`);
    assert.equal(l.dataQualityGrade, "C", "limited-data grade");
    assert.ok(l.topNegativeFactors.some((f) => /limited-data|market-implied/i.test(f.label)), "limited-data label present");
    assert.ok(l.eventId && l.opponentName, `${l.participantName} joined to a team game (eventId + opponent)`);
  }
  // No fabricated "score or assist" combined market.
  assert.ok(!legs.some((l) => /score or assist|goal or assist/i.test(l.marketType)), "no fabricated combined market");
});

test("player-prop adapter is date-aware: a non-matching slate date yields no legs (no stale day)", () => {
  assert.equal(loadWorldCupPlayerPropLegs(root, NOW, "1999-01-01").length, 0, "no legs for a stale date");
  assert.equal(loadWorldCupPlayerPropLegs(root, NOW, "").length, 0, "no legs for an empty date");
});

const slate = loadTodaySlate("2026-06-19", NOW);

test("World Cup single-game cards now fill High and Longshot with a team + player mix", () => {
  const sg = { low: [], medium: [], high: [], longshot: [] };
  for (const g of slate.gameSpecific.filter((x) => x.sport === "WORLD_CUP")) for (const p of g.parlays) sg[p.riskLevel].push(p);
  assert.ok(sg.high.length > 0, "WC single-game has High cards");
  assert.ok(sg.longshot.length > 0, "WC single-game has Longshot cards");
  for (const c of sg.high) assert.equal(getRiskBucketForCombinedOdds(c.combinedOdds), "high", `${c.parlayId} fits High`);
  for (const c of sg.longshot) assert.equal(getRiskBucketForCombinedOdds(c.combinedOdds), "longshot", `${c.parlayId} fits Longshot`);
  // At least some High/Longshot cards mix a player prop with a team market (Moonshot-style, not team-only).
  const mixes = [...sg.high, ...sg.longshot].filter((c) =>
    c.legs.some((l) => /Goalscorer|Shots|Assists/.test(l.market)) && c.legs.some((l) => /moneyline|draw_no_bet|double_chance|total|btts/i.test(l.market)));
  assert.ok(mixes.length > 0, "some WC High/Longshot cards mix player + team props");
});

test("World Cup multi-game Longshot cards now exist, span ≥2 games, with a player + team mix", () => {
  const wc = slate.suggestedBySportRisk["WORLD_CUP"] ?? {};
  const longshot = wc.longshot ?? [];
  assert.ok(longshot.length > 0, "WC multi-game has Longshot cards");
  for (const c of longshot) {
    assert.equal(getRiskBucketForCombinedOdds(c.combinedOdds), "longshot", `${c.parlayId} > +600`);
    const games = new Set(c.legs.map((l) => l.legId.split(":")[1]));
    assert.ok(games.size >= 2, `${c.parlayId} spans ≥2 games`);
  }
  // Player props are present in the upside cards (not team-only).
  const hasPlayer = (wc.high ?? []).concat(longshot).some((c) => c.legs.some((l) => /Goalscorer|Shots on Target|Assists|Shots/.test(l.market)));
  assert.ok(hasPlayer, "WC High/Longshot include player props");
});

test("no leg shorter than -500 anywhere in the WC suggested cards", () => {
  const wc = slate.suggestedBySportRisk["WORLD_CUP"] ?? {};
  for (const rb of ["medium", "high", "longshot"]) for (const c of wc[rb] ?? []) for (const l of c.legs)
    if (l.odds != null) assert.ok(l.odds >= -500, `${c.parlayId} leg ${l.odds} ≥ -500`);
});

test("active cards untouched: Lane A/B, Moonshot, Mr. Dub unchanged by the player-prop pool", () => {
  const dual = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8"));
  assert.ok(/Gonzales/.test(JSON.stringify(dual.run.laneA.legs)) && /Hoskins/.test(JSON.stringify(dual.run.laneB.legs)), "Lane A/B legs unchanged");
  const moon = JSON.parse(fs.readFileSync("public/data/moonshot-lane/active.json", "utf8"));
  assert.equal(moon.ladder[0].card.combinedOdds, 1152, "Moonshot Step 1 active card is +1152");
  const p = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(p.openExposure, 200, "core open exposure (Lane A + Lane B placed seeds)");
  assert.equal(p.totalOpenExposure, 225, "total open exposure $225 (core $200 + moonshot $25)");
});
