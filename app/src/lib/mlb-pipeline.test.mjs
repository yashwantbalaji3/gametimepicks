/**
 * MLB pipeline — ingestion normalizers + Diamond Specials generator + settlement engine.
 *
 * Pure-function coverage with FIXTURE provider responses + box scores (clearly test data, never written
 * as a real board). Proves the pipeline transforms, generates and settles correctly — and that empty
 * input yields empty output (no fabrication). Run: npx tsx --test this-file.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeMlbSchedule, normalizeMlbProps, extractHomeRunProps, MLB_INGEST_MARKET_KEYS } from "./mlb/ingest-normalize.ts";
import { generateDiamondSpecials } from "./mlb/diamond-specials-generator.ts";
import { gradeProp, settleHomerNukes, settleDiamondSpecials } from "./mlb/mlb-settlement.ts";

const DATE = "2026-06-23";
const GEN = "2026-06-23T12:00:00Z";

// ── Ingestion normalizers ───────────────────────────────────────────────────────────────────────
const EVENTS = [
  { id: "g1", commence_time: "2026-06-23T23:05:00Z", home_team: "New York Yankees", away_team: "Boston Red Sox" },
  { id: "g2", commence_time: "2026-06-22T23:05:00Z", home_team: "LA Dodgers", away_team: "SF Giants" }, // different day → dropped
];

test("normalizeMlbSchedule: filters to the date, builds matchups; empty in → empty out", () => {
  const s = normalizeMlbSchedule(EVENTS, DATE, GEN);
  assert.equal(s.games.length, 1, "only the same-day game");
  assert.equal(s.games[0].matchup, "Boston Red Sox @ New York Yankees");
  assert.equal(s.sport, "MLB");
  assert.equal(normalizeMlbSchedule([], DATE, GEN).games.length, 0, "no fabrication on empty");
});

const EVENT_ODDS = [{
  id: "g1", commence_time: "2026-06-23T23:05:00Z", home_team: "New York Yankees", away_team: "Boston Red Sox",
  bookmakers: [
    { key: "fanduel", title: "FanDuel", markets: [
      { key: "batter_home_runs", outcomes: [{ name: "Over", description: "Aaron Judge", price: 320, point: 0.5 }, { name: "Under", description: "Aaron Judge", price: -420, point: 0.5 }] },
      { key: "batter_hits", outcomes: [{ name: "Over", description: "Rafael Devers", price: -140, point: 0.5 }] },
    ]},
    { key: "draftkings", title: "DraftKings", markets: [
      { key: "batter_home_runs", outcomes: [{ name: "Over", description: "Aaron Judge", price: 350, point: 0.5 }] }, // better price → wins
      { key: "pitcher_strikeouts", outcomes: [{ name: "Over", description: "Gerrit Cole", price: -115, point: 6.5 }] },
    ]},
  ],
}];

test("normalizeMlbProps: Over side only, best price per player+market, groups + HR subset", () => {
  const p = normalizeMlbProps(EVENT_ODDS, DATE, GEN);
  const judge = p.props.find((x) => x.player === "Aaron Judge" && x.market === "batter_home_runs");
  assert.ok(judge, "Judge HR present");
  assert.equal(judge.americanOdds, 350, "best (highest) Over price across books");
  assert.equal(judge.selection, "Over 0.5");
  assert.ok(!p.props.some((x) => x.selection.toLowerCase().includes("under")), "Under side excluded");
  const hr = extractHomeRunProps(p);
  assert.ok(hr.props.every((x) => x.group === "hr"), "HR subset only");
  assert.equal(normalizeMlbProps([], DATE, GEN).props.length, 0, "no fabrication on empty");
});

test("ingest market keys cover HR + hits + bases + runs + pitchers", () => {
  for (const k of ["batter_home_runs", "batter_hits", "batter_total_bases", "batter_rbis", "pitcher_strikeouts"]) {
    assert.ok(MLB_INGEST_MARKET_KEYS.includes(k), `ingests ${k}`);
  }
});

// ── Diamond Specials generator ────────────────────────────────────────────────────────────────────
const POOL = [
  { id: "1", gameId: "g1", matchup: "BOS @ NYY", player: "Aaron Judge", team: null, opponent: null, market: "batter_home_runs", marketLabel: "To hit a home run", group: "hr", selection: "Over 0.5", point: 0.5, americanOdds: 320, provider: "FanDuel", startTimeUtc: GEN, modelProbability: 0.30 },
  { id: "2", gameId: "g2", matchup: "SF @ LAD", player: "Shohei Ohtani", team: null, opponent: null, market: "batter_home_runs", marketLabel: "To hit a home run", group: "hr", selection: "Over 0.5", point: 0.5, americanOdds: 280, provider: "DK", startTimeUtc: GEN, modelProbability: 0.34 },
  { id: "3", gameId: "g1", matchup: "BOS @ NYY", player: "Rafael Devers", team: null, opponent: null, market: "batter_hits", marketLabel: "Hits", group: "hits", selection: "Over 0.5", point: 0.5, americanOdds: -140, provider: "FanDuel", startTimeUtc: GEN, modelProbability: 0.62 },
  { id: "4", gameId: "g2", matchup: "SF @ LAD", player: "Mookie Betts", team: null, opponent: null, market: "batter_hits", marketLabel: "Hits", group: "hits", selection: "Over 0.5", point: 0.5, americanOdds: -160, provider: "DK", startTimeUtc: GEN, modelProbability: 0.65 },
  { id: "5", gameId: "g1", matchup: "BOS @ NYY", player: "Gerrit Cole", team: null, opponent: null, market: "pitcher_strikeouts", marketLabel: "Strikeouts", group: "pitchers", selection: "Over 6.5", point: 6.5, americanOdds: -115, provider: "DK", startTimeUtc: GEN, modelProbability: 0.55 },
  { id: "6", gameId: "g2", matchup: "SF @ LAD", player: "Matt Chapman", team: null, opponent: null, market: "batter_total_bases", marketLabel: "Total bases", group: "bases", selection: "Over 1.5", point: 1.5, americanOdds: 150, provider: "FD", startTimeUtc: GEN, modelProbability: 0.45 },
];

test("generateDiamondSpecials: builds themed cards + a longshot, max one leg per game, reconciling odds", () => {
  const snap = generateDiamondSpecials(POOL, DATE, GEN);
  const cats = snap.cards.map((c) => c.category);
  assert.ok(cats.includes("Homer Special") && cats.includes("Hits Special") && cats.includes("Pitching Special") && cats.includes("Bases Special"), "themed cards present");
  assert.ok(cats.includes("Longshot Special"), "longshot present");
  for (const c of snap.cards) {
    assert.ok(c.legs.length >= 1 && c.stake === 20, "stake $20");
    assert.equal(new Set(c.legs.map((l) => l.gameId)).size, c.legs.length, `${c.category}: max 1 leg per game`);
    assert.ok(c.projectedReturn > c.stake || c.combinedOdds < 0, "projected return reconciles");
  }
  assert.equal(generateDiamondSpecials([], DATE, GEN).cards.length, 0, "empty pool → no cards (no fabrication)");
});

// ── Settlement engine ─────────────────────────────────────────────────────────────────────────────
const BOX = [
  { player: "Aaron Judge", homeRuns: 1, hits: 2, totalBases: 5, strikeouts: 0 },
  { player: "Rafael Devers", homeRuns: 0, hits: 0, totalBases: 0 },
  { player: "Gerrit Cole", strikeouts: 8, outs: 18 },
  // Mookie Betts / Ohtani / Chapman absent → DNP → void
];

test("gradeProp: HR over hits/misses; Over line; DNP → void", () => {
  assert.equal(gradeProp({ player: "Aaron Judge", market: "batter_home_runs", selection: "Over 0.5", point: 0.5 }, BOX), "hit");
  assert.equal(gradeProp({ player: "Rafael Devers", market: "batter_hits", selection: "Over 0.5", point: 0.5 }, BOX), "miss");
  assert.equal(gradeProp({ player: "Gerrit Cole", market: "pitcher_strikeouts", selection: "Over 6.5", point: 6.5 }, BOX), "hit");
  assert.equal(gradeProp({ player: "Shohei Ohtani", market: "batter_home_runs", selection: "Over 0.5", point: 0.5 }, BOX), "void", "DNP → void, never a loss");
});

test("settleHomerNukes: accuracy from decided picks only (voids excluded)", () => {
  const s = settleHomerNukes([{ player: "Aaron Judge" }, { player: "Rafael Devers" }, { player: "Shohei Ohtani" }], BOX);
  assert.equal(s.hits, 1); assert.equal(s.misses, 1); assert.equal(s.voids, 1);
  assert.equal(s.accuracy, 0.5, "1 hit / 2 decided");
});

test("settleDiamondSpecials: won (all hit), lost (a miss), push (all void); honest P/L", () => {
  const cards = [
    { id: "w", category: "Homer Special", legs: [{ player: "Aaron Judge", market: "batter_home_runs", selection: "Over 0.5", point: 0.5, odds: 320 }] },
    { id: "l", category: "Hits Special", legs: [{ player: "Aaron Judge", market: "batter_hits", selection: "Over 0.5", point: 0.5, odds: -140 }, { player: "Rafael Devers", market: "batter_hits", selection: "Over 0.5", point: 0.5, odds: -140 }] },
    { id: "p", category: "Bases Special", legs: [{ player: "Mookie Betts", market: "batter_total_bases", selection: "Over 1.5", point: 1.5, odds: 150 }] },
  ];
  const s = settleDiamondSpecials(cards, BOX);
  const byId = Object.fromEntries(s.cards.map((c) => [c.id, c]));
  assert.equal(byId.w.result, "won"); assert.ok(byId.w.pnl > 0, "won pays out");
  assert.equal(byId.l.result, "lost"); assert.equal(byId.l.pnl, -20, "lost = -stake");
  assert.equal(byId.p.result, "push"); assert.equal(byId.p.pnl, 0, "all-void → push, no loss");
  assert.deepEqual(s.record, { wins: 1, losses: 1, pushes: 1 });
  assert.equal(s.staked, 60);
});
