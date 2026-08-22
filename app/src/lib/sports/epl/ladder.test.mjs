/**
 * The EPL risk ladder — what it may claim, and what it must never claim.
 *
 * Run: npx tsx --test src/lib/sports/epl/ladder.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { gradeEplLeg } from "./settlement-contract.mjs";
import { getRiskBucketForCombinedOdds, INDIVIDUAL_LEG_ODDS_GUARDS } from "../../parlays/risk-odds-bands.mjs";

const APP = process.cwd();
const SRC = fs.readFileSync(path.join(APP, "scripts/epl/build-epl-ladder.mjs"), "utf8");
const LADDER = path.join(APP, "public/data/parlays/risk-ladder-epl/latest.json");
const ladder = fs.existsSync(LADDER) ? JSON.parse(fs.readFileSync(LADDER, "utf8")) : null;
const allLegs = (ladder?.cards ?? []).flatMap((c) => c.legs ?? []);

test("THE LADDER MAKES NO MODEL CLAIM — the side is the market's own favourite", () => {
  /*
   * The UFC ladder picks the side its model reads and says so, because that model PASSED its
   * preregistered bar. EPL's has passed nothing: calibration is UNPROVEN, zero matches have been
   * compared against a no-vig price, and on 2026-08-21 it read Hull City at 42.2% at home to
   * Manchester United against a market price of 10.6%. A ladder selecting on that model would have
   * published a Hull City home win. So EPL follows MLB's precedent, not UFC's — and the code must
   * not drift back, which is what this pins.
   */
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /modelProbability/, "a leg must carry no model probability");
  assert.doesNotMatch(code, /forecasts?\/latest|player-projections/, "the ladder must not read the model's artifacts at all");
  for (const l of allLegs) {
    assert.equal(l.modelProbability, undefined, `${l.matchup}: a published leg must carry no model read`);
  }
});

test("EVERY published leg is settleable by the contract that will grade it", () => {
  // "Settleability is a precondition" — an ungradeable card never enters the record, so it must
  // never publish either. Exercised against the real contract, not asserted about it.
  const official = { fixtureId: "x", status: "FULL_TIME", homeGoalsFT: 2, awayGoalsFT: 1 };
  for (const l of allLegs) {
    const out = gradeEplLeg({ market: l.market, side: l.side, line: l.line ?? undefined }, official);
    assert.notEqual(out.outcome, "VOID_PENDING_REVIEW", `${l.matchup} ${l.market}/${l.side}: the contract cannot grade this leg — ${out.reason}`);
  }
});

test("the slate day is derived from the FIXTURES, never from the run's own clock", () => {
  /*
   * The night-before slot fires at 21:00 UTC — 17:00 ET the previous day — to serve the next
   * morning. Scoped to its own ET day it found zero fixtures and published an empty ladder, so the
   * one slot that exists to have the product ready in advance produced nothing at all. Same defect
   * as an /nfl hub anchored to a stale index day: a slate day no fixture shares is not a slate day.
   */
  assert.match(SRC, /nextKickoff/, "the date must come from the next upcoming fixture");
  if (!ladder?.cards?.length) return;
  const etDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  for (const l of allLegs) {
    assert.equal(etDay(l.kickoffUtc), ladder.date, `${l.matchup} kicks off on a different day than the ladder claims`);
    assert.ok(Date.parse(l.kickoffUtc) > Date.parse(ladder.generatedAt), "a published leg must not have kicked off already");
  }
});

test("BANDS ARE PRICE RANGES, assigned by the canonical bucket function", () => {
  // The cross-sport lane once labelled cards by LEG COUNT and published a +203 card as "Low risk".
  for (const c of ladder?.cards ?? []) {
    assert.equal(getRiskBucketForCombinedOdds(c.combinedAmerican), c.tier, `${c.tier} card priced ${c.combinedAmerican} is not in its own band`);
  }
});

test("an unreachable band is SKIPPED with its reason — thresholds are never widened", () => {
  if (!ladder) return;
  for (const s of ladder.skipped ?? []) {
    assert.ok(s.reason?.length > 0, `${s.tier}: a skipped band must say why`);
  }
  // The bands actually carded plus those skipped must account for all four. A band that silently
  // vanished would read as "we chose not to" rather than "we could not".
  const seen = new Set([...(ladder.cards ?? []).map((c) => c.tier), ...(ladder.skipped ?? []).map((s) => s.tier)]);
  assert.equal(seen.size, 4, "every band is either carded or explicitly skipped");
});

test("no fixture appears on two cards", () => {
  const ids = allLegs.map((l) => l.eventId);
  assert.equal(new Set(ids).size, ids.length, "two legs from one match are one match twice, and correlated");
});

test("every leg price respects the canonical guard", () => {
  for (const l of allLegs) {
    assert.ok(l.odds >= INDIVIDUAL_LEG_ODDS_GUARDS.minFavoriteAmerican, `${l.matchup}: ${l.odds} is shorter than the floor — filler that buys nothing`);
    assert.ok(l.odds <= INDIVIDUAL_LEG_ODDS_GUARDS.maxUnderdogAmerican, `${l.matchup}: ${l.odds} is beyond the underdog ceiling`);
  }
});

test("the ladder carries no stake and claims no record it has not earned", () => {
  if (!ladder) return;
  assert.equal(ladder.moneyClass, "NON_MONEY");
  for (const c of ladder.cards ?? []) {
    // Null, never 0-0: a zeroed record reads as a measured result rather than an absent one.
    assert.equal(c.tierRecord, null, "this stream has settled nothing yet");
    assert.equal(c.status, "pending");
  }
});

test("the lab settler grades EPL legs through the IDENTITY BRIDGE, not the raw capture", () => {
  /*
   * The raw results artifact carries only the PROVIDER's id. A settler keyed on canonicalEventId
   * against that file builds an empty map, grades every EPL leg "pending", and leaves cards
   * unsettled forever while the published hit rate computes over only the cards that happened to be
   * settleable — the exact failure the UFC path was written to end, and the same mistake the EPL
   * forecast grader made twelve hours earlier against the same file.
   */
  const settler = fs.readFileSync(path.join(APP, "scripts/parlays/settle-lab-cards.mjs"), "utf8");
  assert.match(settler, /loadCurrentEplResults/, "EPL settlement must go through the identity bridge");
  const code = settler.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /soccer["'\s,\]]+.*epl.*results.*latest\.json/, "and must not re-read the raw capture");
  // Routed by the leg's OWN sport, so a cross-sport card grades each leg on its own path.
  assert.match(code, /leg\.sport[^\n]*"epl"/, "EPL legs must be routed by leg.sport");
});
