/**
 * Tests for `results-drilldown.ts`.
 *
 * Lock the honesty rules:
 *   - Status normalization defaults to "pending" (never invents
 *     decisive).
 *   - Pending slips aren't hidden.
 *   - Combined American odds null when any leg lacks a price.
 *   - Source is `publicRiskSections.{section}.all` only (no double
 *     count from per-sport tabs).
 *   - Null / missing payload → empty result, no fabrication.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRiskSectionDrilldown,
  sortDrilldownSlips,
} from "./results-drilldown.ts";

function _fakeGraded(sections) {
  const out = { publicRiskSections: {} };
  for (const [key, allSlips] of Object.entries(sections)) {
    out.publicRiskSections[key] = { all: allSlips, nba: [], mlb: [], multi: [] };
  }
  return out;
}

function _slip({ id = "s1", status = "win", sport = "mlb", legs = [], singleGame = false }) {
  return { slipId: id, status, sport, singleGame, legs };
}

function _leg({ playerName = "P", oddsForSide = -110, sport = "mlb", result = null }) {
  return {
    playerName,
    team: "TEAM",
    opponent: "OPP",
    market: "batter_hits",
    marketLabel: "Hits",
    side: "Over",
    line: 0.5,
    oddsForSide,
    sport,
    result,
  };
}

test("null payload → all sections empty", () => {
  const out = buildRiskSectionDrilldown(null);
  assert.deepEqual(out, { low: [], medium: [], high: [], longshot: [] });
});

test("undefined publicRiskSections → all sections empty", () => {
  const out = buildRiskSectionDrilldown({});
  assert.deepEqual(out, { low: [], medium: [], high: [], longshot: [] });
});

test("flattens all-bucket slips into the right section", () => {
  const out = buildRiskSectionDrilldown(
    _fakeGraded({
      low: [_slip({ id: "low_1", status: "win", legs: [_leg({}), _leg({ playerName: "P2" })] })],
      medium: [_slip({ id: "med_1", status: "loss", legs: [_leg({}), _leg({ playerName: "P2" }), _leg({ playerName: "P3" })] })],
      high: [],
      longshot: [],
    }),
  );
  assert.equal(out.low.length, 1);
  assert.equal(out.low[0].slipId, "low_1");
  assert.equal(out.low[0].status, "win");
  assert.equal(out.medium.length, 1);
  assert.equal(out.medium[0].status, "loss");
  assert.equal(out.high.length, 0);
  assert.equal(out.longshot.length, 0);
});

test("pending status preserved — never silently dropped", () => {
  const out = buildRiskSectionDrilldown(
    _fakeGraded({
      low: [_slip({ id: "p_1", status: "pending", legs: [_leg({}), _leg({ playerName: "P2" })] })],
      medium: [],
      high: [],
      longshot: [],
    }),
  );
  assert.equal(out.low.length, 1);
  assert.equal(out.low[0].status, "pending");
});

test("unknown status → pending (never invents decisive)", () => {
  const out = buildRiskSectionDrilldown(
    _fakeGraded({
      low: [_slip({ id: "x_1", status: "weirdvalue", legs: [_leg({}), _leg({ playerName: "P2" })] })],
      medium: [],
      high: [],
      longshot: [],
    }),
  );
  assert.equal(out.low[0].status, "pending");
});

test("null status → pending", () => {
  const out = buildRiskSectionDrilldown(
    _fakeGraded({
      low: [_slip({ id: "n_1", status: null, legs: [_leg({}), _leg({ playerName: "P2" })] })],
      medium: [],
      high: [],
      longshot: [],
    }),
  );
  assert.equal(out.low[0].status, "pending");
});

test("combined American odds null when any leg lacks a price", () => {
  const out = buildRiskSectionDrilldown(
    _fakeGraded({
      low: [
        _slip({
          id: "noodds_1",
          legs: [_leg({}), { ...(_leg({ playerName: "P2" })), oddsForSide: null }],
        }),
      ],
      medium: [],
      high: [],
      longshot: [],
    }),
  );
  assert.equal(out.low.length, 1);
  assert.equal(out.low[0].combinedAmericanOdds, null);
});

test("two -110 legs → ~+265 combined", () => {
  const out = buildRiskSectionDrilldown(
    _fakeGraded({
      low: [_slip({ id: "c_1", legs: [_leg({ oddsForSide: -110 }), _leg({ playerName: "P2", oddsForSide: -110 })] })],
      medium: [],
      high: [],
      longshot: [],
    }),
  );
  assert.ok(out.low[0].combinedAmericanOdds >= 250 && out.low[0].combinedAmericanOdds <= 280);
});

test("does NOT double-count slips that also live under per-sport tabs", () => {
  const payload = {
    publicRiskSections: {
      low: {
        all: [_slip({ id: "shared_1", legs: [_leg({}), _leg({ playerName: "P2" })] })],
        nba: [],
        mlb: [_slip({ id: "shared_1", legs: [_leg({}), _leg({ playerName: "P2" })] })],
        multi: [],
      },
      medium: { all: [], nba: [], mlb: [], multi: [] },
      high: { all: [], nba: [], mlb: [], multi: [] },
      longshot: { all: [], nba: [], mlb: [], multi: [] },
    },
  };
  const out = buildRiskSectionDrilldown(payload);
  // Source is `all` only → exactly one row.
  assert.equal(out.low.length, 1);
});

test("singleGame flag preserved when present", () => {
  const out = buildRiskSectionDrilldown(
    _fakeGraded({
      low: [_slip({ id: "sg_1", singleGame: true, legs: [_leg({ sport: "nba" }), _leg({ playerName: "P2", sport: "nba" })] })],
      medium: [],
      high: [],
      longshot: [],
    }),
  );
  assert.equal(out.low[0].singleGame, true);
});

test("sortDrilldownSlips: wins → losses → pushes → pending", () => {
  const slips = [
    { status: "pending", slipId: "p" },
    { status: "loss", slipId: "l" },
    { status: "push", slipId: "ps" },
    { status: "win", slipId: "w" },
  ];
  const sorted = sortDrilldownSlips(slips);
  assert.deepEqual(sorted.map((s) => s.slipId), ["w", "l", "ps", "p"]);
});

test("never throws on hostile input", () => {
  assert.doesNotThrow(() => buildRiskSectionDrilldown({ publicRiskSections: undefined }));
  assert.doesNotThrow(() => buildRiskSectionDrilldown({ publicRiskSections: { low: undefined } }));
  assert.doesNotThrow(() => buildRiskSectionDrilldown({ publicRiskSections: { low: { all: undefined } } }));
});
