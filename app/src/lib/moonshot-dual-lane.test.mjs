/**
 * PART 2 — Moonshot dual-lane activation. Two INDEPENDENT longshot lanes (own $25 stake / exposure /
 * progression), filled from disjoint games toward 5 legs but valid at 3, gated by a +700 longshot floor.
 * An operator-approved card lock pins + force-activates a lane exactly like Bank Builder. A thin slate
 * leaves lanes AWAITING — never forced, never fabricated. Canonical money is never touched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildDailyLaneCandidates,
  MOONSHOT_MIN_LEGS,
  MOONSHOT_TARGET_LEGS,
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

// ── Generation: two independent lanes from a deep longshot slate ────────────────────────────────
test("a deep slate (10 longshot games) fills BOTH lanes to 5 legs, disjoint games, each ≥ +700", () => {
  const pool = Array.from({ length: 10 }, (_, i) => mkPick(i + 1, 600));
  const { moonshotA: a, moonshotB: b } = buildDailyLaneCandidates(pool, DATE);
  assert.equal(a.legCount, MOONSHOT_TARGET_LEGS, "Lane A reaches 5 legs");
  assert.equal(b.legCount, MOONSHOT_TARGET_LEGS, "Lane B reaches 5 legs");
  const gamesA = new Set(a.legs.map((l) => l.gameId));
  const gamesB = new Set(b.legs.map((l) => l.gameId));
  assert.equal([...gamesA].filter((g) => gamesB.has(g)).length, 0, "lanes share NO game (independent)");
  assert.equal(gamesA.size, a.legCount, "Lane A: max 1 leg per game");
  assert.ok(a.combinedOdds >= MOONSHOT_MIN_COMBINED_ODDS && b.combinedOdds >= MOONSHOT_MIN_COMBINED_ODDS, "both clear the +700 floor");
  assert.equal(a.stake, 25); assert.equal(b.stake, 25);
});

test("a medium slate (6 longshot games) splits FAIRLY into two 3-leg lanes (not 5 + 1)", () => {
  const pool = Array.from({ length: 6 }, (_, i) => mkPick(i + 1, 500));
  const { moonshotA: a, moonshotB: b } = buildDailyLaneCandidates(pool, DATE);
  assert.equal(a.legCount, MOONSHOT_MIN_LEGS, "Lane A gets 3");
  assert.equal(b.legCount, MOONSHOT_MIN_LEGS, "Lane B gets 3");
  const gamesA = new Set(a.legs.map((l) => l.gameId));
  assert.equal(b.legs.filter((l) => gamesA.has(l.gameId)).length, 0, "still disjoint games");
});

test("a thin slate (4 games) leaves BOTH lanes short of the 3-leg minimum → awaiting (never forced)", () => {
  const pool = Array.from({ length: 4 }, (_, i) => mkPick(i + 1, 500));
  const { moonshotA: a, moonshotB: b } = buildDailyLaneCandidates(pool, DATE);
  assert.ok(a.legCount < MOONSHOT_MIN_LEGS && b.legCount < MOONSHOT_MIN_LEGS, "neither lane fills");
  assert.ok(a.shortfallNote && b.shortfallNote, "both disclose the shortfall — no low-quality legs forced");
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

// ── Live June-24 slate: thin → both lanes await honestly, money frozen ───────────────────────────
test("live June-24 portfolio: both Moonshot lanes display + await (thin WC slate), $0 placed, money frozen", () => {
  const dp = buildPersistedDailyPortfolio(root, `${DATE}T08:00:00Z`, DATE, `${DATE}T08:00:00Z`, true);
  const moon = dp.lanes.filter((l) => l.product === "moonshot");
  assert.equal(moon.length, 2, "both Moonshot lanes are present (displayed)");
  for (const l of moon) {
    assert.equal(l.status, "awaiting", `Lane ${l.lane} awaiting — slate can't field a longshot lane`);
    assert.ok(l.activationEligibility?.reason, "discloses why it is awaiting");
  }
  assert.equal(dp.products.moonshot.exposure, 0, "no Moonshot exposure placed today");
  assert.equal(dp.activeBankroll, 20065.40, "canonical active bankroll frozen (after banking Ladder #2)");
  assert.equal(dp.crownBankroll, 20465.40, "canonical crown frozen (Σ of two completed-ladder finals)");
  const p = JSON.parse(read(path.join(root, "mr-dub", "portfolio.json")));
  assert.deepEqual(p.record, { wins: 14, losses: 4, voids: 0, pending: 0 }, "canonical record untouched by the moonshot view (14-4 from the BB settlement)");
  assert.deepEqual(p.moonshot.record, { wins: 0, losses: 1, voids: 0, pending: 0 }, "canonical moonshot block untouched");
});

// ── Master ledger: Moonshot tracked as an independent product, exposure off the LIVE portfolio ────
test("master ledger tracks Moonshot (record/ROI/P&L) with exposure keyed off the live daily portfolio", () => {
  // Date-agnostic: build the ledger for the CURRENT slate (read from the live daily-portfolio) so the
  // freshness check tracks the live slate as it rolls day to day.
  const liveDate = JSON.parse(read(path.join(root, "mr-dub", "daily-portfolio.json"))).date;
  const ml = buildMasterLedger(root, `${liveDate}T08:00:00Z`, liveDate);
  const m = ml.products.find((p) => p.productId === "moonshot");
  assert.ok(m, "Moonshot is a tracked product in Mr. Dub");
  assert.equal(m.exposure, 0, "no open Moonshot exposure (lanes awaiting/candidate, below the +700 floor)");
  assert.equal(m.freshness, "fresh", "freshness follows the live slate, not the frozen run artifact");
  // Record / ROI / P&L derive from the settled product ledger (real history only).
  assert.equal(m.roi, m.stake > 0 ? Number(((m.profit / m.stake) * 100).toFixed(2)) : 0, "ROI reconciles");
  assert.ok(typeof m.profit === "number", "P&L present");
});
