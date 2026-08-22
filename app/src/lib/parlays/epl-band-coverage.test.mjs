/**
 * CAN THIS LADDER ACTUALLY REACH ALL FOUR BANDS?
 *
 * Run: npx tsx --test src/lib/parlays/epl-band-coverage.test.mjs
 *
 * The EPL ladder offered one leg per fixture — the market's shortest price in the three-way. That is
 * a defensible selection and a terrible price range: three-way favourites cluster short, so the
 * shortest two-leg card a matchday could build was already past `low`, and three of four bands were
 * routinely reported as skipped on a full slate.
 *
 * The authorised capture pays for TOTALS too, and gradeEplLeg settles them from the same official
 * score. Those prices sit either side of even money where favourites do not.
 *
 * This exercises the built ladder against a synthetic ten-fixture slate rather than whatever is left
 * of today's — by mid-afternoon most fixtures have kicked off, so the live artifact cannot answer
 * "can four bands be built" either way, and a guard that silently skips is not a guard.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";

import { getRiskBucketForCombinedOdds, INDIVIDUAL_LEG_ODDS_GUARDS } from "./risk-odds-bands.mjs";
import { RISK_ORDER } from "../prefs/bettor-tiers.mjs";
import { gradeEplLeg } from "../sports/epl/settlement-contract.mjs";

const APP = process.cwd();

/** A realistic matchday: ten fixtures, three-way favourites plus two total lines each. */
function syntheticCapture(kickoffDay) {
  const clubs = [
    ["Arsenal", "Everton"], ["Liverpool", "Brentford"], ["Chelsea", "Fulham"],
    ["Manchester City", "Bournemouth"], ["Newcastle United", "Sunderland"],
    ["Aston Villa", "Leeds United"], ["Brighton & Hove Albion", "Burnley"],
    ["Crystal Palace", "Ipswich Town"], ["Tottenham Hotspur", "Nottingham Forest"],
    ["Manchester United", "Hull City"],
  ];
  const favs = [-260, -180, -155, -320, -140, -210, -175, -125, -195, -230];
  return {
    capturedAt: `${kickoffDay}T09:00:00Z`,
    rows: clubs.map(([home, away], i) => ({
      eventId: `soccer:epl:${home.toLowerCase().replace(/[^a-z]/g, "-")}-v-${away.toLowerCase().replace(/[^a-z]/g, "-")}:${kickoffDay.replace(/-/g, "")}t1400`,
      providerEventId: `syn-${i}`,
      kickoffIso: `${kickoffDay}T14:00:00Z`,
      home, away,
      matchResult: [
        { outcome: home, american: favs[i], books: 9 },
        { outcome: "Draw", american: 260, books: 9 },
        { outcome: away, american: 420 + i * 30, books: 9 },
      ],
      totalGoals: [
        { line: 2.5, outcomes: [{ outcome: "Over", point: 2.5, american: -145 + i * 4, books: 6 }, { outcome: "Under", point: 2.5, american: 115 + i * 4, books: 6 }] },
        { line: 3, outcomes: [{ outcome: "Over", point: 3, american: 121 + i * 5, books: 5 }, { outcome: "Under", point: 3, american: -140 - i * 3, books: 5 }] },
      ],
    })),
  };
}

/**
 * Run the real builder against a TEMPORARY odds file, and read back what it wrote.
 *
 * The first version swapped the live capture and restored it in a finally block. That is unsafe the
 * moment test files run in parallel: another guard read the synthetic slate mid-swap and reported a
 * sport closed on a price dated 2099. A temp path and an --odds flag touch no shared state at all.
 *
 * The ladder's own output still has to be cleaned up, because the builder writes both a dated file
 * and latest.json — and leaving a synthetic ten-fixture card on a live product path is what the
 * published-cards guard caught the first time round.
 */
function buildAgainst(capture, day) {
  const tmp = path.join(os.tmpdir(), `gtp-epl-odds-${day}-${process.pid}.json`);
  const outPath = path.join(APP, "public/data/parlays/risk-ladder-epl", `${day}.json`);
  const latestPath = path.join(APP, "public/data/parlays/risk-ladder-epl", "latest.json");
  const savedOut = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : null;
  const savedLatest = fs.existsSync(latestPath) ? fs.readFileSync(latestPath, "utf8") : null;
  try {
    fs.writeFileSync(tmp, JSON.stringify(capture));
    execFileSync("node", [path.join(APP, "scripts/epl/build-epl-ladder.mjs"), "--now", `${day}T09:00:00Z`, "--date", day, "--odds", tmp], { cwd: APP, encoding: "utf8" });
    return JSON.parse(fs.readFileSync(outPath, "utf8"));
  } finally {
    fs.rmSync(tmp, { force: true });
    if (savedOut != null) fs.writeFileSync(outPath, savedOut); else fs.rmSync(outPath, { force: true });
    if (savedLatest != null) fs.writeFileSync(latestPath, savedLatest); else fs.rmSync(latestPath, { force: true });
  }
}

const DAY = "2099-01-15";                    // far future: cannot collide with a real slate
const ladder = buildAgainst(syntheticCapture(DAY), DAY);

test("ALL FOUR BANDS build on a full ten-fixture slate", () => {
  const built = new Set(ladder.cards.map((c) => c.tier));
  assert.deepEqual(
    RISK_ORDER.filter((b) => !built.has(b)), [],
    `bands not built: ${RISK_ORDER.filter((b) => !built.has(b)).join(", ")} — skipped reasons: ${JSON.stringify(ladder.skipped)}`,
  );
});

test("TOTALS legs are what make that possible", () => {
  // The premise of the change. If every card were still a three-way favourite, the price range would
  // be the one that could only reach a single band.
  const markets = new Set(ladder.cards.flatMap((c) => c.legs.map((l) => l.market)));
  assert.ok(markets.has("total_goals"), "a ladder that reaches four bands uses the totals market");
});

test("NO BAND THRESHOLD IS WIDENED — every card sits in its own band", () => {
  // The fix this repository rejected once, when a +203 card was published as "Low risk".
  for (const c of ladder.cards) {
    assert.equal(getRiskBucketForCombinedOdds(c.combinedAmerican), c.tier,
      `${c.tier} card priced ${c.combinedAmerican} does not belong to its own band`);
  }
});

test("one leg per fixture, across the whole ladder", () => {
  const ids = ladder.cards.flatMap((c) => c.legs.map((l) => l.eventId));
  assert.equal(new Set(ids).size, ids.length, "a match result and a total from one match are one match twice, and correlated");
});

test("every leg — including a total — is settleable by the contract that will grade it", () => {
  const official = { fixtureId: "x", status: "FULL_TIME", homeGoalsFT: 2, awayGoalsFT: 1 };
  for (const c of ladder.cards) {
    for (const l of c.legs) {
      const out = gradeEplLeg({ market: l.market, side: l.side, line: l.line ?? undefined }, official);
      assert.notEqual(out.outcome, "VOID_PENDING_REVIEW", `${l.marketLabel}/${l.side}: ungradeable — ${out.reason}`);
    }
  }
});

test("every leg price respects the canonical guard", () => {
  for (const c of ladder.cards) for (const l of c.legs) {
    assert.ok(l.odds >= INDIVIDUAL_LEG_ODDS_GUARDS.minFavoriteAmerican && l.odds <= INDIVIDUAL_LEG_ODDS_GUARDS.maxUnderdogAmerican,
      `${l.matchup}: ${l.odds} is outside the leg guard`);
  }
});

test("the ladder still claims no model read", () => {
  // The sentence NEGATES a model read ("never this model's read"), so a bare substring check on
  // "model's read" fails on the honest version. What matters is that it names the market as the
  // source and disclaims the model, and that no leg carries a model probability.
  assert.match(ladder.selection, /market price|market's own/i);
  assert.match(ladder.selection, /never this model's read/i);
  for (const c of ladder.cards) for (const l of c.legs) assert.equal(l.modelProbability, undefined);
});
