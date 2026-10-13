/**
 * MLB-002 forward shadow · matchup features are point-in-time and frozen (FORWARD-PREREGISTRATION.md).
 *
 * Run: npx tsx --test src/lib/mlb/full-game/matchup-features.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MATCHUP_V1_LEAGUE, MATCHUP_V1_PA_BY_SLOT, matchupInputFor } from "./matchup-features.mjs";
import { PA_BY_SLOT } from "../../../../scripts/capture-mlb-pregame-pa-opportunity.mjs";

const ROOT = path.resolve(process.cwd(), "..");

test("frozen constants equal their registered sources", () => {
  const L = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/research/mlb/mlb-002/matchup-v1/league-constants.json"), "utf8"));
  assert.deepEqual({ ...MATCHUP_V1_LEAGUE }, { k: L.k, bb: L.bb, hr: L.hr, hbp: L.hbp });
  assert.deepEqual({ ...MATCHUP_V1_PA_BY_SLOT }, { ...PA_BY_SLOT });
});

const START = "2026-10-12T20:00:00Z";
const bat = (id) => ({ playerId: id, name: `b${id}`, team: "A", expHits: 1, expTotalBases: 1.6, expHrr: null });
const input = {
  gamePk: 7, date: "2026-10-12",
  awayLineup: [bat(1), bat(2), { playerId: -1, name: "filler", team: "A", expHits: null, expTotalBases: null, expHrr: null }],
  homeLineup: [bat(3)],
  awayStarter: { playerId: 10, name: "p", team: "A", expStrikeouts: null },
  homeStarter: { playerId: 11, name: "q", team: "H", expStrikeouts: 6 },
  completeness: { awayLineupSource: "confirmed", homeLineupSource: "prop-derived" },
};
const split = (playerId, capturedAt, gamePk = 7, eventStartTime = START, bbPct = 20) => ({
  playerId, gamePk, capturedAt, eventStartTime,
  seasonSplits: { vsRHP: { pa: 400, k: 80, bb: bbPct * 4, hr: 20 }, vsLHP: { pa: 100, k: 20, bb: 8, hr: 3 } },
});

test("only captures at or before the run's clock and before first pitch are used; nothing is invented", () => {
  const cutoff = Date.parse("2026-10-12T15:00:00Z");
  const r = matchupInputFor({
    input, cutoffMs: cutoff, league: MATCHUP_V1_LEAGUE, paBySlot: MATCHUP_V1_PA_BY_SLOT,
    captures: {
      splitsSameGame: [split(1, "2026-10-12T14:00:00Z"), split(2, "2026-10-12T16:00:00Z") /* after the run */],
      splitsPrior: [split(2, "2026-10-11T18:00:00Z", 6, "2026-10-11T20:00:00Z"), split(3, "2026-09-20T18:00:00Z", 5) /* > 10 days */],
      workload: [{ gamePk: 7, capturedAt: "2026-10-12T21:00:00Z", eventStartTime: START, pitchers: { home: { id: 11, seasonToDate: { ip: 100, k: 120, bb: 30, hr: 12 } } } } /* after first pitch */],
      matchup: [{ gamePk: 7, capturedAt: "2026-10-12T14:30:00Z", eventStartTime: START, homeStartingPitcher: { pitchHand: "R" }, awayStartingPitcher: { pitchHand: "L" }, homeBatters: [{ playerId: 3, battingOrderSlot: 9 }] }],
    },
  });
  const [b1, b2, filler] = r.input.awayLineup;
  assert.equal(filler.matchup, undefined, "replacement-level filler keeps the published model");
  assert.equal(b1.matchup.slotPa, 4.65, "confirmed order: slot 1");
  assert.equal(b2.matchup.slotPa, 4.55, "confirmed order: slot 2");
  assert.equal(r.input.homeLineup[0].matchup.slotPa, 3.75, "prop-derived: slot from the matchup capture");
  // b2: the same-game capture is after the run, so the previous day's capture is used.
  assert.ok(r.captures.some((c) => c.playerId === 2 && c.capturedAt === "2026-10-11T18:00:00Z"));
  assert.ok(!r.captures.some((c) => c.capturedAt === "2026-10-12T16:00:00Z"));
  // b3: only a stale (> 10 days) capture → league rates.
  assert.deepEqual(r.input.homeLineup[0].matchup.vsStarter, { k: MATCHUP_V1_LEAGUE.k, bb: MATCHUP_V1_LEAGUE.bb, hr: MATCHUP_V1_LEAGUE.hr });
  // The workload capture is after first pitch → the home starter gets no season line; its K comes from the projection.
  assert.equal(r.coverage.startersWithLine, 0);
  assert.equal(r.input.homeStarter.matchup.k, 6 / 25);
  assert.equal(r.input.homeStarter.matchup.bb, MATCHUP_V1_LEAGUE.bb);
  // Away batters face the home starter (R): their vsStarter uses the vsRHP split, a heavy walker here.
  assert.ok(b1.matchup.vsStarter.bb > MATCHUP_V1_LEAGUE.bb);
  assert.equal(r.coverage.battersWithSplits, 2);
  // The champion input is untouched.
  assert.equal(input.awayLineup[0].matchup, undefined);
});
