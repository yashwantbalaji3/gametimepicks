/**
 * Player-prop intelligence guards.
 *
 * Two classes of test matter most here:
 *   · the object must never carry `lean` / `edgePct` — a demoted model's conclusion has no honest
 *     rendering, so it must not reach a renderer at all;
 *   · recent form must never contain a game dated on or after the slate, which is the one way
 *     pregame research can quietly become postgame knowledge.
 *
 * Run: npx tsx --test src/lib/markets/player-intelligence.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildPlayerPropIntelligence,
  filterLeakageSafeGames,
  propJoinKey,
  leanJoinKey,
} from "./player-intelligence.ts";

const TODAY = "2026-07-27";
const NOW = "2026-07-27T17:00:00Z";

const PROP = {
  gameId: "g1",
  player: "Cole Young",
  market: "batter_hits",
  marketLabel: "Hits",
  point: 0.5,
  americanOdds: -246,
  selection: "Over 0.5",
  provider: "DraftKings",
  startTimeUtc: "2026-07-27T18:35:00Z",
};

const LEAN = {
  gameId: "g1",
  gamePk: 822868,
  playerId: 702284,
  playerName: "Cole Young",
  playerTeamAbbr: "SEA",
  opponentAbbr: "TEX",
  playerRole: "batter",
  marketKey: "batter_hits",
  marketLabel: "Hits",
  line: 0.5,
  oddsOver: -246,
  oddsUnder: 182,
  projection: 1.01,
  sigma: 0.87,
  samples: 106,
  modelProbOver: 0.7211,
  modelProbUnder: 0.2789,
  riskFlags: [],
  recentGames: [
    { date: "2026-07-24", opponent: "TB", isHome: false, value: 1 },
    { date: "2026-07-25", opponent: "SF", isHome: true, value: 0 },
    { date: "2026-07-26", opponent: "SF", isHome: true, value: 2 },
  ],
  // Fields the object must NOT surface — a demoted model's conclusions.
  lean: "Over",
  edgePct: 1.01,
  confidence: "Low",
  commenceTime: "2026-07-27T18:35:00Z",
};

const build = (over = {}) =>
  buildPlayerPropIntelligence({
    prop: { ...PROP, ...(over.prop ?? {}) },
    lean: over.lean === undefined ? LEAN : over.lean,
    family: over.family === undefined ? "BATTER_HITS" : over.family,
    gamePk: over.gamePk === undefined ? 822868 : over.gamePk,
    homeTeam: "TEX",
    awayTeam: "SEA",
    teamMapping: over.teamMapping ?? "RESOLVED_FROM_GAME",
    artifact: over.artifact ?? { date: TODAY, generatedAt: "2026-07-27T16:35:04.938Z" },
    todayEt: over.todayEt ?? TODAY,
    nowIso: over.nowIso ?? NOW,
  });

// ── The demoted-model omission ──────────────────────────────────────────────────────────────────

/** Every property name appearing anywhere in the object graph. */
function allKeys(value, out = new Set()) {
  if (Array.isArray(value)) {
    for (const v of value) allKeys(v, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

test("no recommendation field from the board reaches the object", () => {
  // Asserted on KEYS, not on a JSON substring: the calibration disclosure legitimately contains the
  // word "confidence" ("its high-confidence reads under-perform"), and a substring check would
  // either fail on that honest sentence or have to be loosened until it caught nothing.
  const keys = allKeys(build());
  for (const banned of ["lean", "edgePct", "confidence", "edgePctOver", "edgePctUnder", "contextTag"]) {
    assert.ok(!keys.has(banned), `a demoted model's "${banned}" must not reach a renderer`);
  }
});

test("the omission is not an accident of the fixture — the source lean really carries them", () => {
  // If the board ever stopped publishing these, the guard above would pass vacuously and stop
  // protecting anything. This asserts the threat is still real.
  for (const field of ["lean", "edgePct", "confidence"]) {
    assert.ok(field in LEAN, `fixture must model the board's actual ${field} field`);
  }
});

test("no MLB family reports a validated advantage", () => {
  for (const family of ["BATTER_HITS", "BATTER_TOTAL_BASES", "PITCHER_STRIKEOUTS", "BATTER_HITS_RUNS_RBIS"]) {
    assert.equal(build({ family }).modelValidatedAgainstMarket, false, family);
  }
});

test("the calibration disclosure travels with the object", () => {
  assert.match(build().calibrationDisclosure, /Calibration notice/);
});

// ── Leakage safety ──────────────────────────────────────────────────────────────────────────────

test("recent form keeps only games strictly before the slate date", () => {
  const { kept, dropped } = filterLeakageSafeGames(
    [
      { date: "2026-07-26", value: 1 },
      { date: "2026-07-27", value: 3 }, // same day as the slate — may not have been played
      { date: "2026-07-28", value: 2 }, // after the slate — unambiguously postgame
    ],
    TODAY,
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0].date, "2026-07-26");
  assert.equal(dropped, 2);
});

test("a same-slate-date game is dropped and the row is flagged not leakage-safe", () => {
  const g = build({
    lean: { ...LEAN, recentGames: [{ date: "2026-07-26", value: 1 }, { date: TODAY, value: 4 }] },
  });
  assert.equal(g.model.recentForm.games.length, 1);
  assert.equal(g.model.recentForm.leakageSafe, false, "a surface must be able to refuse this row");
});

test("an untainted recent-form window is flagged leakage-safe", () => {
  assert.equal(build().model.recentForm.leakageSafe, true);
  assert.equal(build().model.recentForm.games.length, 3);
});

test("recent form summarizes without concluding", () => {
  const f = build().model.recentForm;
  assert.equal(f.average, 1); // (1 + 0 + 2) / 3
  assert.equal(f.overLineCount, 2); // 1 and 2 exceed a 0.5 line
});

// ── Probability provenance ──────────────────────────────────────────────────────────────────────

test("no-vig is derived from both prices, never back-filled from the raw implied", () => {
  const g = build();
  const { overImpliedProb, underImpliedProb, overNoVigProb, underNoVigProb } = g.sportsbook;
  assert.ok(overImpliedProb > 0 && underImpliedProb > 0);
  assert.ok(
    overImpliedProb + underImpliedProb > 1,
    "raw implied still contains the book's margin",
  );
  assert.ok(Math.abs(overNoVigProb + underNoVigProb - 1) < 1e-9, "no-vig sums to 1");
  assert.notEqual(overNoVigProb, overImpliedProb);
});

test("a one-sided market cannot be de-vigged", () => {
  const g = build({ lean: { ...LEAN, oddsUnder: null } });
  assert.equal(g.sportsbook.overNoVigProb, null, "overround is only observable across the pair");
  assert.ok(g.sportsbook.overImpliedProb > 0, "the raw price is still readable");
  assert.equal(g.comparison, null, "no comparison without a comparable market probability");
});

test("the methodology note attributes the math to GameTimePicks", () => {
  assert.match(build().sportsbook.methodologyNote, /converted by GameTimePicks/);
});

// ── Comparison ──────────────────────────────────────────────────────────────────────────────────

test("comparison is a neutral percentage-point difference against the no-vig price", () => {
  const g = build();
  assert.equal(g.intelligence.mode, "FULL_COMPARISON");
  assert.equal(g.comparison.modelProbOver, 0.7211);
  const expected = Math.round((0.7211 - g.sportsbook.overNoVigProb) * 1000) / 10;
  assert.equal(g.comparison.differencePoints, expected);
});

test("no comparison without a model probability", () => {
  const g = build({ lean: { ...LEAN, modelProbOver: null } });
  assert.equal(g.comparison, null);
});

// ── Degradation ─────────────────────────────────────────────────────────────────────────────────

test("an unmodeled family degrades to sportsbook-only with no model side", () => {
  const g = build({ family: "BATTER_HOME_RUNS", lean: null });
  assert.equal(g.intelligence.mode, "SPORTSBOOK_ONLY");
  assert.equal(g.model, null);
  assert.ok(g.sportsbook.overOdds, "the price is still real");
  assert.equal(g.comparison, null);
});

test("an unresolved team withholds comparison AND withholds the team attribution itself", () => {
  const g = build({ teamMapping: "UNRESOLVED" });
  assert.notEqual(g.intelligence.mode, "FULL_COMPARISON");
  assert.equal(g.player.team, null, "an unpublishable mapping must not leak the guessed team");
  assert.equal(g.player.opponent, null);
  assert.equal(g.player.mapping, "UNRESOLVED", "the reason stays visible");
});

test("ambiguous identity fails the row closed entirely", () => {
  const g = build({ teamMapping: "AMBIGUOUS" });
  assert.equal(g.intelligence.mode, "UNAVAILABLE");
  assert.equal(g.model, null);
  assert.equal(g.sportsbook, null);
});

test("a stale snapshot downgrades to model-only and drops the price", () => {
  const g = build({ artifact: { date: "2026-07-25", generatedAt: "2026-07-25T16:00:00Z" } });
  assert.equal(g.intelligence.mode, "MODEL_ONLY");
  assert.equal(g.sportsbook, null);
  assert.equal(g.comparison, null);
});

test("a missing line is incomplete rather than zero", () => {
  const g = build({ prop: { point: null } });
  assert.ok(g.intelligence.blockedBy.includes("MARKET_INCOMPLETE"));
});

test("an unresolved event fails closed", () => {
  const g = build({ gamePk: null });
  assert.equal(g.intelligence.mode, "UNAVAILABLE");
  assert.deepEqual(g.intelligence.blockedBy, ["EVENT_UNRESOLVED"]);
});

test("a null playerId stays null rather than becoming 0", () => {
  const g = build({ lean: { ...LEAN, playerId: null } });
  assert.equal(g.player.playerId, null);
});

test("a small sample is surfaced, not hidden", () => {
  const g = build({ lean: { ...LEAN, samples: 3 } });
  assert.equal(g.model.samples, 3);
});

// ── Join keys ───────────────────────────────────────────────────────────────────────────────────

test("the join key includes the line, so alternate lines do not collide", () => {
  const half = propJoinKey("Cole Young", "g1", "batter_hits", 0.5);
  const oneHalf = propJoinKey("Cole Young", "g1", "batter_hits", 1.5);
  assert.notEqual(half, oneHalf, "a 0.5 projection must not pair with a 1.5 price");
});

test("prop and lean join keys agree for the same row", () => {
  assert.equal(leanJoinKey(LEAN), propJoinKey(PROP.player, PROP.gameId, PROP.market, PROP.point));
});

// ── Event phase ─────────────────────────────────────────────────────────────────────────────────

test("event phase is independent of snapshot freshness", () => {
  const started = build({ nowIso: "2026-07-27T19:00:00Z" });
  assert.equal(started.event.phase, "STARTED");
  assert.equal(started.snapshot.freshness.state, "CURRENT");
});
