/**
 * PART 2 — Moonshot dual-lane activation. Two STRUCTURED longshot lanes (own $25 stake / exposure /
 * progression), built by game: Lane A ("structured") = one RESULT leg + one TOTAL leg per game (2
 * legs/game); Lane B ("aggressive") = the structured pairs PLUS each game's BTTS where distinct (a
 * SUPERSET tier of Lane A — legs MAY overlap across A and B). Team markets only (no player props).
 * Gated by a +700 longshot floor. An operator-approved card lock pins + force-activates a lane exactly
 * like Bank Builder. A thin slate leaves lanes AWAITING — never forced, never fabricated. Canonical
 * money is never touched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildDailyLaneCandidates,
  MOONSHOT_MIN_LEGS,
  MOONSHOT_MIN_COMBINED_ODDS,
} from "./world-cup/model-qualified-picks.ts";
import { buildPersistedDailyPortfolio, applyCardLocks, laneEligibility } from "./daily-portfolio/accounting.ts";
import { buildMasterLedger } from "./mr-dub/master-ledger.ts";

const root = path.join(process.cwd(), "public", "data");
const read = (p) => fs.readFileSync(p, "utf8");
const DATE = "2026-06-24";
const NOW = Date.parse(`${DATE}T08:00:00Z`);
const KICK = `${DATE}T20:00:00Z`; // 12h out — pre-event, outside the activation cutoff
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

/** A model-qualified longshot pick in its own game. */
const mkPick = (i, odds) => ({
  id: `WORLD_CUP:game${i}:moneyline_90:Team${i}`,
  sport: "WORLD_CUP", gameId: `game${i}`, matchup: `Team${i} vs Opp${i}`,
  kickoffUtc: KICK, kickoffEt: "4:00 PM ET", category: "team", marketKey: "moneyline_90",
  marketLabel: "Match Result", selection: `Team${i} to win`, player: null, team: `Team${i}`,
  odds, provider: "draftkings", modelProbability: 0.3, edge: 0.05, volatility: "higher",
  risk: "Higher-volatility", dataQuality: "B", hitRateScore: 0.3, upsideScore: odds, teamLogo: null,
});
/** A team-market pick for game `i` in a specific market (result / total / btts) — the structured Moonshot
 *  builder groups these by game into a result + total(/BTTS) pair. `prob` drives the draw-lean branch
 *  (favourite < 55% → draw-protected result). */
const mkMarketPick = (i, marketKey, odds, prob = 0.6) => ({
  ...mkPick(i, odds),
  id: `WORLD_CUP:game${i}:${marketKey}:sel`, marketKey, marketLabel: marketKey,
  selection: `game${i} ${marketKey}`, upsideScore: odds, modelProbability: prob,
  category: marketKey === "match_total_goals" || marketKey === "btts" ? "total_btts" : "team",
});
/** All team-market legs for one STRUCTURED game: a result (moneyline_90) + a total (match_total_goals),
 *  plus a BTTS leg when `withBtts` — so Lane A pairs it (result + total) and Lane B (aggressive) can add BTTS. */
const mkGame = (i, { resultOdds = 520, totalOdds = 610, bttsOdds = 300, withBtts = false, prob = 0.6 } = {}) => {
  const legs = [mkMarketPick(i, "moneyline_90", resultOdds, prob), mkMarketPick(i, "match_total_goals", totalOdds)];
  if (withBtts) legs.push(mkMarketPick(i, "btts", bttsOdds));
  return legs;
};
const mkLeg = (i, odds) => ({
  id: `WORLD_CUP:game${i}:moneyline_90:Team${i}`, matchup: `Team${i} vs Opp${i}`,
  market: "Match Result", selection: `Team${i} to win`, player: null, odds, provider: "draftkings",
  modelConfidence: 0.3, kickoffEt: "4:00 PM ET", risk: "Higher-volatility", photoUrl: null, teamLogo: null,
});
const mkLane = (lane, legs) => ({
  id: `moonshot-lane-${lane.toLowerCase()}-${DATE}`, product: "moonshot", productLabel: "Moonshot", lane,
  step: 1, clearedSteps: 0, status: "awaiting", stake: 25, exposure: 25, targetReturn: null, fitsTarget: true,
  combinedOdds: 0, combinedDecimal: 1, potentialReturn: 0, legCount: legs.length, targetLegs: MOONSHOT_MIN_LEGS,
  legs, correlationNote: null, shortfallNote: "thin", whyThisCard: [], activationEligibility: { eligible: false, reason: "thin" },
});

// ── Generation: structured team-market lanes (result + total per game) from a deep slate ──────────
test("a deep slate (5 structured games) → Lane A pairs each game (result + total, 2 legs/game); team markets only; ≥ +700", () => {
  // 5 games, each with a result (moneyline_90) + a total (match_total_goals) market.
  const pool = Array.from({ length: 5 }, (_, i) => mkGame(i + 1)).flat();
  const { moonshotA: a, moonshotB: b } = buildDailyLaneCandidates(pool, DATE);
  // STRUCTURED: one RESULT leg + one TOTAL leg per game → 2 legs/game across all 5 games.
  const gamesA = new Set(a.legs.map((l) => l.gameId));
  assert.equal(gamesA.size, 5, "Lane A covers every game on the slate");
  assert.equal(a.legCount, 10, "Lane A = 2 legs per game (result + total) across 5 games");
  for (const gid of gamesA) {
    const markets = a.legs.filter((l) => l.gameId === gid).map((l) => l.marketKey);
    assert.ok(markets.includes("moneyline_90"), `game ${gid}: has a RESULT leg`);
    assert.ok(markets.includes("match_total_goals"), `game ${gid}: has a TOTAL leg`);
  }
  // Team markets ONLY — no player props in either Moonshot lane.
  assert.ok(a.legs.every((l) => l.category !== "player"), "Lane A: team markets only (no player props)");
  assert.ok(b.legs.every((l) => l.category !== "player"), "Lane B: team markets only (no player props)");
  // Lane B (aggressive) is a SUPERSET tier of Lane A — no BTTS market here, so it matches A's structured pairs.
  assert.ok(b.legCount >= a.legCount, "Lane B (aggressive) is a superset tier of Lane A");
  assert.ok(a.combinedOdds >= MOONSHOT_MIN_COMBINED_ODDS && b.combinedOdds >= MOONSHOT_MIN_COMBINED_ODDS, "both clear the +700 floor");
  assert.equal(a.stake, 25); assert.equal(b.stake, 25);
});

test("a medium slate (3 games w/ BTTS): Lane A = result + total per game; Lane B (aggressive) adds each game's BTTS as a SUPERSET tier", () => {
  // 3 games, each with result + total + BTTS markets → Lane A pairs (2/game), Lane B adds BTTS (3/game).
  const pool = Array.from({ length: 3 }, (_, i) => mkGame(i + 1, { withBtts: true })).flat();
  const { moonshotA: a, moonshotB: b } = buildDailyLaneCandidates(pool, DATE);
  // Lane A ("structured"): result + total per game, no BTTS.
  assert.equal(a.legCount, 6, "Lane A = 2 legs per game (result + total) across 3 games");
  assert.ok(a.legs.every((l) => l.marketKey !== "btts"), "Lane A carries no BTTS leg (structured tier)");
  // Lane B ("aggressive"): result + total + BTTS per game — a SUPERSET of Lane A's markets (tiers, may overlap).
  assert.equal(b.legCount, 9, "Lane B = 3 legs per game (result + total + BTTS) across 3 games");
  const aMarketsByGame = new Map();
  for (const l of a.legs) aMarketsByGame.set(l.gameId, [...(aMarketsByGame.get(l.gameId) ?? []), l.marketKey]);
  for (const [gid, markets] of aMarketsByGame) {
    const bMarkets = b.legs.filter((l) => l.gameId === gid).map((l) => l.marketKey);
    assert.ok(markets.every((m) => bMarkets.includes(m)), `game ${gid}: Lane B superset includes all of Lane A's markets (tiers overlap)`);
    assert.ok(bMarkets.includes("btts"), `game ${gid}: Lane B adds the BTTS leg`);
  }
  assert.ok(a.combinedOdds >= MOONSHOT_MIN_COMBINED_ODDS && b.combinedOdds >= MOONSHOT_MIN_COMBINED_ODDS, "both clear the +700 floor");
});

test("a thin slate (2 structured games) still fields TWO Moonshot lanes — 2 legs/game structured pairs, team markets only, ≥ +700 (A and B are tiers that MAY overlap)", () => {
  // A thin knockout window (2 games) still yields two real STRUCTURED lanes: a result + total pair per game.
  // With BTTS present, Lane B (aggressive) layers BTTS on top — legs CAN overlap across A and B now (tiers).
  const pool = Array.from({ length: 2 }, (_, i) => mkGame(i + 1, { withBtts: true })).flat();
  const { moonshotA: a, moonshotB: b } = buildDailyLaneCandidates(pool, DATE);
  assert.ok(a.legCount >= MOONSHOT_MIN_LEGS, "Lane A fills from the thin window (2 games × 2 legs = 4)");
  assert.ok(b.legCount >= MOONSHOT_MIN_LEGS, "Lane B ALSO fills (aggressive superset) — not left awaiting");
  // STRUCTURED composition per game: result + total in Lane A; result + total + BTTS in Lane B.
  const gamesA = new Set(a.legs.map((l) => l.gameId));
  assert.equal(gamesA.size, 2, "Lane A covers both games");
  for (const gid of gamesA) {
    const markets = a.legs.filter((l) => l.gameId === gid).map((l) => l.marketKey);
    assert.ok(markets.includes("moneyline_90") && markets.includes("match_total_goals"), `game ${gid}: Lane A = result + total pair`);
  }
  // Team markets only in BOTH lanes (no player props); A and B are TIERS and MAY overlap.
  assert.ok(a.legs.every((l) => l.category !== "player") && b.legs.every((l) => l.category !== "player"), "both lanes: team markets only");
  const bMarketsByGame = new Map();
  for (const l of b.legs) bMarketsByGame.set(l.gameId, [...(bMarketsByGame.get(l.gameId) ?? []), l.marketKey]);
  for (const [gid, markets] of bMarketsByGame) assert.ok(markets.includes("btts"), `game ${gid}: Lane B aggressive adds BTTS on top of the pair`);
  assert.ok(a.combinedOdds >= MOONSHOT_MIN_COMBINED_ODDS && b.combinedOdds >= MOONSHOT_MIN_COMBINED_ODDS, "both clear the +700 floor");
});

test("a thin SINGLE-market slate (4 games, result market only) yields a RESULT leg per game — the builder NEVER fabricates a total/BTTS that isn't posted", () => {
  const pool = Array.from({ length: 4 }, (_, i) => mkPick(i + 1, 500)); // moneyline_90 only, no total/BTTS market
  const { moonshotA: a, moonshotB: b } = buildDailyLaneCandidates(pool, DATE);
  // Structured builder honestly pairs only what exists: one RESULT leg per game, no invented second market.
  assert.equal(a.legCount, 4, "Lane A = one result leg per game (4 games) — no fabricated total");
  assert.ok(a.legs.every((l) => l.marketKey === "moneyline_90"), "Lane A carries only the posted result market");
  assert.ok(a.legs.every((l) => l.category !== "player"), "team markets only (no player props)");
  assert.equal(new Set(a.legs.map((l) => l.gameId)).size, a.legCount, "one leg per game (no fabricated total to double up)");
  // Lane B (aggressive) has no extra market to layer on a single-market slate → it mirrors A's tier, not fabricated.
  assert.equal(b.legCount, a.legCount, "Lane B mirrors A when there is no BTTS market to add (no fabrication)");
  assert.ok(a.combinedOdds >= MOONSHOT_MIN_COMBINED_ODDS, "the 4 real longshot result legs clear the +700 floor");
});

test("structured fallbacks: draw-leaning games use a draw-protected result; a game with no totals market uses BTTS as the total leg", () => {
  // Draw-lean (moneyline favourite < 55%) → result leg is the draw-protected market (DNB), not raw moneyline.
  const drawLean = Array.from({ length: 3 }, (_, i) => [
    mkMarketPick(i + 1, "moneyline_90", 300, 0.5), // favourite prob 0.50 < 0.55 → draw-leaning
    mkMarketPick(i + 1, "draw_no_bet", 180),
    mkMarketPick(i + 1, "match_total_goals", 210),
  ]).flat();
  const { moonshotA: da } = buildDailyLaneCandidates(drawLean, DATE);
  for (const gid of new Set(da.legs.map((l) => l.gameId))) {
    const markets = da.legs.filter((l) => l.gameId === gid).map((l) => l.marketKey);
    assert.ok(markets.includes("draw_no_bet") && !markets.includes("moneyline_90"), `game ${gid}: draw-leaning → draw-protected result (DNB), not raw moneyline`);
    assert.ok(markets.includes("match_total_goals"), `game ${gid}: still carries a total leg`);
  }
  // No totals market → BTTS is used as the total leg (structured still gets a 2-leg pair).
  const noTotals = Array.from({ length: 3 }, (_, i) => [
    mkMarketPick(i + 1, "moneyline_90", 520, 0.6),
    mkMarketPick(i + 1, "btts", 250),
  ]).flat();
  const { moonshotA: na } = buildDailyLaneCandidates(noTotals, DATE);
  for (const gid of new Set(na.legs.map((l) => l.gameId))) {
    const markets = na.legs.filter((l) => l.gameId === gid).map((l) => l.marketKey);
    assert.deepEqual(markets.sort(), ["btts", "moneyline_90"], `game ${gid}: BTTS stands in as the total leg (result + BTTS pair)`);
  }
});

// ── +700 longshot floor (a 3-leg lane of short legs is not a moonshot) ───────────────────────────
test("eligibility: a 3-leg moonshot BELOW the +700 floor is not eligible; a longshot card is", () => {
  const legs = [mkPick(1, 100), mkPick(2, 100), mkPick(3, 100)]; // dec 2 × 2 × 2 = 8 → +700 exactly
  const short = { product: "moonshot", lane: "A", legCount: 3, targetLegs: 3, combinedOdds: 500, legs };
  const long = { product: "moonshot", lane: "A", legCount: 3, targetLegs: 3, combinedOdds: 5000, legs };
  assert.equal(laneEligibility(short, NOW).eligible, false, "below floor → not eligible");
  assert.match(laneEligibility(short, NOW).reason, /longshot floor/i);
  assert.equal(laneEligibility(long, NOW).eligible, true, "longshot card pre-event → eligible");
});

// ── Approved-card lock: pins + force-activates both lanes independently ───────────────────────────
test("an approved Moonshot lock force-activates both lanes (pinned, re-priced, $25 each)", () => {
  const lanes = [mkLane("A", [mkLeg(1, 600), mkLeg(2, 700), mkLeg(3, 800)]), mkLane("B", [mkLeg(4, 500), mkLeg(5, 650), mkLeg(6, 900)])];
  const pool = [1, 2, 3, 4, 5, 6].map((i) => mkPick(i, 600)); // every locked leg is live + pre-event
  const entries = {
    A: { approvedAt: "2026-06-24T13:00:00Z", reason: "operator-approved", legs: lanes[0].legs },
    B: { approvedAt: "2026-06-24T13:00:00Z", reason: "operator-approved", legs: lanes[1].legs },
  };
  applyCardLocks(lanes, entries, pool, "moonshot", { activate: true, nowMs: NOW });
  for (const lane of lanes) {
    assert.equal(lane.status, "active", `Lane ${lane.lane} force-activated`);
    assert.equal(lane.locked, true, `Lane ${lane.lane} flagged locked`);
    assert.equal(lane.exposure, 25, "independent $25 paper exposure");
    const d = lane.legs.reduce((p, l) => p * dec(l.odds), 1);
    assert.ok(Math.abs(lane.potentialReturn - lane.stake * d) < 0.5, "re-priced from its own legs");
  }
  // Independent lanes: no shared game.
  const gamesA = new Set(lanes[0].legs.map((l) => l.id));
  assert.equal(lanes[1].legs.filter((l) => gamesA.has(l.id)).length, 0, "lanes share no leg/game");
});

test("a Moonshot lock RELEASES (no activation) when a locked leg's odds are unavailable", () => {
  const lanes = [mkLane("A", [mkLeg(1, 600), mkLeg(2, 700), mkLeg(3, 800)])];
  const pool = [mkPick(1, 600), mkPick(2, 700)]; // game3 missing → odds unavailable
  const entries = { A: { approvedAt: "2026-06-24T13:00:00Z", legs: lanes[0].legs } };
  applyCardLocks(lanes, entries, pool, "moonshot", { activate: true, nowMs: NOW });
  assert.notEqual(lanes[0].status, "active", "not activated when a leg is gone");
  assert.ok(!lanes[0].locked, "not locked");
  assert.match(lanes[0].shortfallNote ?? "", /odds unavailable/i);
});

test("a Moonshot lock does NOT force a STARTED game live (no late activation)", () => {
  const started = { ...mkPick(1, 600), kickoffUtc: "2026-06-24T07:00:00Z" }; // already kicked off vs NOW (08:00Z)
  const lanes = [mkLane("A", [mkLeg(1, 600), mkLeg(2, 700), mkLeg(3, 800)])];
  const pool = [started, mkPick(2, 700), mkPick(3, 800)];
  const entries = { A: { approvedAt: "2026-06-24T13:00:00Z", legs: lanes[0].legs } };
  applyCardLocks(lanes, entries, pool, "moonshot", { activate: true, nowMs: NOW });
  assert.notEqual(lanes[0].status, "active", "a started leg blocks force-activation");
  assert.equal(lanes[0].locked, true, "legs still pinned (lock honored), just not placed");
});

// ── Live June-24 slate: structured team-market lanes field real longshots; canonical money frozen ─
test("live June-24 portfolio: both STRUCTURED Moonshot lanes display; paper exposure reconciles; canonical money frozen", () => {
  const dp = buildPersistedDailyPortfolio(root, `${DATE}T08:00:00Z`, DATE, `${DATE}T08:00:00Z`, true);
  const moon = dp.lanes.filter((l) => l.product === "moonshot");
  assert.equal(moon.length, 2, "both Moonshot lanes are present (displayed)");
  for (const l of moon) {
    // NEW spec: the structured team-market builder fields real longshot lanes (result + total per game),
    // so a lane is a genuine STRUCTURED longshot — team markets only, clearing the +700 floor.
    assert.ok(l.activationEligibility?.reason, "discloses its activation eligibility reason");
    assert.ok(l.legs.every((g) => g.category !== "player"), `Lane ${l.lane}: team markets only (no player props)`);
    if (l.status === "active") assert.ok(l.combinedOdds >= MOONSHOT_MIN_COMBINED_ODDS, `Lane ${l.lane}: an active structured lane clears the +700 floor`);
  }
  // Paper exposure reconciles from the ACTIVE lanes ($25 each) — the daily view derives it, never fabricates it.
  const activeMoon = moon.filter((l) => l.status === "active");
  assert.equal(dp.products.moonshot.exposure, activeMoon.length * 25, "Moonshot paper exposure = $25 × active structured lanes (reconciles)");
  // Canonical money is FROZEN — the daily portfolio never touches the bankroll / crown / record.
  assert.equal(dp.activeBankroll, 19465.40, "canonical active bankroll frozen (crown − $1000 ten real lost seeds, after the July-1 settlement)");
  assert.equal(dp.crownBankroll, 20465.40, "canonical crown frozen (Σ of two completed-ladder finals)");
  const p = JSON.parse(read(path.join(root, "mr-dub", "portfolio.json")));
  assert.deepEqual(p.record, { wins: 16, losses: 10, voids: 0, pending: 0 }, "canonical record untouched by the moonshot view (16-10 after the July-1 BB settlement)");
  assert.deepEqual(p.moonshot.record, { wins: 0, losses: 1, voids: 0, pending: 0 }, "canonical moonshot block untouched");
});

// ── Master ledger: Moonshot tracked as an independent product, exposure off the LIVE portfolio ────
test("master ledger tracks Moonshot (record/ROI/P&L) with exposure keyed off the live daily portfolio", () => {
  // Date-agnostic: build the ledger for the CURRENT slate (read from the live daily-portfolio) so the
  // freshness check tracks the live slate as it rolls day to day.
  const liveDp = JSON.parse(read(path.join(root, "mr-dub", "daily-portfolio.json")));
  const liveDate = liveDp.date;
  const ml = buildMasterLedger(root, `${liveDate}T08:00:00Z`, liveDate);
  const m = ml.products.find((p) => p.productId === "moonshot");
  assert.ok(m, "Moonshot is a tracked product in Mr. Dub");
  assert.equal(m.exposure, liveDp.products.moonshot.exposure, "Moonshot exposure mirrors the LIVE daily portfolio (combined-window slate fields real longshot lanes)");
  assert.equal(m.freshness, "fresh", "freshness follows the live slate, not the frozen run artifact");
  // Record / ROI / P&L derive from the settled product ledger (real history only).
  assert.equal(m.roi, m.stake > 0 ? Number(((m.profit / m.stake) * 100).toFixed(2)) : 0, "ROI reconciles");
  assert.ok(typeof m.profit === "number", "P&L present");
});
