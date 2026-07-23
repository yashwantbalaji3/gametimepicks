/**
 * DOUBLEHEADER IDENTITY — regression tests (Phase 5).
 *
 * THE DEFECT (fixed here): the MLB game-simulation generator used to stamp each sim game's `gamePk` from
 * `leans[0].gamePk`. A doubleheader's two games carry the SAME teams + date but DIFFERENT schedule ids
 * (gamePk); upstream, the board's per-lean gamePk can collapse both twins onto ONE id (last-wins). So the
 * old generator labeled BOTH sim games with the same gamePk — the twin whose id was dropped resolved to
 * NO simulation downstream ("not yet simulated") while its sibling rendered.
 *
 * THE FIX (`resolveGamePks` + a fail-closed identity gate in `generateMlbGameSimulations`): each game's
 * gamePk is re-derived from the AUTHORITATIVE schedule (`board.games[]`) by a strict, tie-free
 * commence-time↔gameDate ordering. A game is `ready` with a gamePk ONLY when a unique schedule game is
 * proven; otherwise it fails closed (status "unavailable", NO gamePk emitted) so nothing can mislabel it
 * as its twin.
 *
 * These tests assert:
 *   (a) both games of a doubleheader get DISTINCT gamePks end-to-end (through the real generator);
 *   (b) NO team/date first-match fallback remains — assignment is time-keyed, stable under lean re-order,
 *       and OVERRIDES the collapsed `leans[0].gamePk`;
 *   (c) a game-to-artifact consistency guard passes — the sim gamePk set is a bijection onto the schedule
 *       gamePks and the downstream (gamePk → gameId) join resolves each board game to a DISTINCT sim game
 *       that reconciles (sim.gamePk === board anchor);
 *   (d) a genuinely-unsplittable doubleheader AND a game with no leans BOTH yield the honest "unavailable"
 *       state (never a mislabeled twin).
 *
 * Everything is FIXTURE-based (no real board, no paid pipeline, no money file). Any file written goes to
 * os.tmpdir(), never the repo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { validateGameSimulation } from "./validate.ts";
import { readGameSimulation, gameSimulationPath } from "./read.ts";
import { generateMlbGameSimulations, resolveGamePks } from "./mlb-generator.ts";

const DATE = "2026-07-22";
const NOW = "2026-07-23T05:00:00Z";

// ---------------------------------------------------------------------------
// Fixture builders (framework-free plain objects — mirror the real board shape).
// ---------------------------------------------------------------------------

/** A single sampleable + priceable board lean (projection + sigma ⇒ a real distribution + ready pick). */
function mkLean(gameId, gamePk, commenceTime, playerId, playerName, over = { line: 5.5, projection: 6.2, sigma: 1.4 }) {
  return {
    id: `${gameId}-${playerId}-k`,
    gameId,
    gamePk, // NB: intentionally may be the COLLAPSED (wrong) id — the generator must not trust it.
    commenceTime,
    homeTeamAbbr: "NYY",
    homeTeamName: "New York Yankees",
    awayTeamAbbr: "PIT",
    awayTeamName: "Pittsburgh Pirates",
    playerId,
    playerName,
    marketKey: "pitcher_strikeouts",
    marketLabel: "Strikeouts",
    line: over.line,
    oddsOver: -115,
    oddsUnder: -105,
    impliedOver: 0.535,
    impliedUnder: 0.512,
    projection: over.projection,
    sigma: over.sigma,
    samples: 20,
    lean: "over",
    confidence: "high",
    modelProbOver: 0.58,
    modelProbUnder: 0.42,
    reasonBullets: [{ label: "Form", text: "strong recent K rate" }],
  };
}

/** A board schedule row (authoritative distinct gamePk + gameDate). */
function mkSchedule(gamePk, gameDate, away = "PIT", home = "NYY") {
  return {
    gamePk,
    gameDate,
    date: DATE,
    venue: "Yankee Stadium",
    awayTeamAbbr: away,
    awayTeamName: "Pittsburgh Pirates",
    homeTeamAbbr: home,
    homeTeamName: "New York Yankees",
  };
}

/**
 * A doubleheader fixture board reproducing the exact defect: two PIT@NYY games with DISTINCT schedule
 * gamePks (823518 @17:05, 823519 @23:05) but whose LEANS are both stamped with the collapsed id 823519.
 * @param collapsedPk the (wrong) gamePk stamped on every lean of both games
 * @param reverse     emit the late game's leans first (to prove order-independence)
 */
function dhBoard({ collapsedPk = 823519, reverse = false } = {}) {
  const early = [
    mkLean("g1early", collapsedPk, "2026-07-22T17:06:00Z", 543037, "Gerrit Cole"),
    mkLean("g1early", collapsedPk, "2026-07-22T17:06:00Z", 999001, "Aaron Judge", { line: 1.5, projection: 1.9, sigma: 0.9 }),
  ];
  const late = [mkLean("g2late", collapsedPk, "2026-07-22T23:05:00Z", 696149, "Bubba Chandler", { line: 4.5, projection: 5.1, sigma: 1.2 })];
  return {
    sport: "mlb",
    date: DATE,
    generatedAt: "2026-07-22T12:00:00Z",
    bookmaker: "fixturebook",
    games: [mkSchedule(823518, "2026-07-22T17:05:00Z"), mkSchedule(823519, "2026-07-22T23:05:00Z")],
    leans: reverse ? [...late, ...early] : [...early, ...late],
  };
}

/** Map a game's gameId ⇒ its gamePk from a generated artifact (undefined when omitted / fail-closed). */
function gamePkByGameId(artifact) {
  const m = new Map();
  for (const g of artifact.games) m.set(g.gameId, g.gamePk);
  return m;
}

/**
 * Replicate the downstream game-detail joiner (src/lib/game-detail.ts `mlbSimulationJoiner`): build the
 * (gamePk-string | slug | gameId) → gameId map exactly as production does, so we test the REAL join.
 */
function buildJoinerMap(artifact) {
  const gameIdByKey = new Map();
  for (const g of artifact.games) {
    if (g.gamePk != null) gameIdByKey.set(String(g.gamePk), g.gameId);
    if (g.slug) gameIdByKey.set(g.slug, g.gameId);
    gameIdByKey.set(g.gameId, g.gameId);
  }
  return gameIdByKey;
}

/** Reconcile mirror of `reconcileMlbGame`'s sim-gamePk check: a rendered sim must be for the same gamePk. */
function reconcileOk(anchorGamePk, sim) {
  if (sim && (sim.status === "ready" || sim.status === "stale") && anchorGamePk != null && sim.gamePk != null) {
    return String(sim.gamePk) === String(anchorGamePk);
  }
  return true;
}

// ===========================================================================
// (a) Both games of a doubleheader get DISTINCT gamePks — end-to-end.
// ===========================================================================
test("(a) doubleheader twins get DISTINCT gamePks matching the schedule", () => {
  const board = dhBoard();
  const { artifact } = generateMlbGameSimulations(board, NOW, DATE);
  assert.ok(validateGameSimulation(artifact).ok, "artifact must validate");

  const byId = gamePkByGameId(artifact);
  assert.equal(byId.get("g1early"), 823518, "early game ⇒ early schedule gamePk");
  assert.equal(byId.get("g2late"), 823519, "late game ⇒ late schedule gamePk");

  const pks = artifact.games.map((g) => g.gamePk);
  assert.equal(new Set(pks).size, pks.length, "no two sim games share a gamePk");
  assert.deepEqual([...pks].sort(), [823518, 823519], "sim gamePks == schedule gamePks");
});

// ===========================================================================
// (b) No team/date first-match fallback — time-keyed, order-stable, overrides the collapsed lean gamePk.
// ===========================================================================
test("(b) assignment is time-keyed, OVERRIDES the collapsed leans[0].gamePk, and is order-independent", () => {
  // The early game's leans were stamped with the WRONG (collapsed) gamePk 823519; the generator must
  // override it with the schedule-derived 823518 — proving it does NOT just copy leans[0].gamePk.
  const early = generateMlbGameSimulations(dhBoard({ collapsedPk: 823519 }), NOW, DATE).artifact;
  assert.equal(gamePkByGameId(early).get("g1early"), 823518, "early game gamePk overrides the collapsed lean id");
  assert.notEqual(gamePkByGameId(early).get("g1early"), 823519, "not a first-match copy of leans[0].gamePk");

  // Re-ordering the leans (late game first) must NOT change the assignment — it's keyed by schedule time,
  // not by input order. A first-match fallback would flip the ids here.
  const reordered = generateMlbGameSimulations(dhBoard({ reverse: true }), NOW, DATE).artifact;
  assert.equal(gamePkByGameId(reordered).get("g1early"), 823518, "stable under lean re-order (early ⇒ 823518)");
  assert.equal(gamePkByGameId(reordered).get("g2late"), 823519, "stable under lean re-order (late ⇒ 823519)");

  // The pure resolver reports schedule-time-order (NOT any lean/first-match method).
  const resolved = resolveGamePks(
    [
      { gameId: "g1early", awayTeamAbbr: "PIT", homeTeamAbbr: "NYY", commenceTime: "2026-07-22T17:06:00Z", leanGamePk: 823519 },
      { gameId: "g2late", awayTeamAbbr: "PIT", homeTeamAbbr: "NYY", commenceTime: "2026-07-22T23:05:00Z", leanGamePk: 823519 },
    ],
    [mkSchedule(823518, "2026-07-22T17:05:00Z"), mkSchedule(823519, "2026-07-22T23:05:00Z")],
  );
  assert.equal(resolved.get("g1early").method, "schedule-time-order");
  assert.equal(resolved.get("g1early").gamePk, 823518);
  assert.equal(resolved.get("g2late").gamePk, 823519);
});

// ===========================================================================
// (c) Game-to-artifact consistency guard: bijection onto schedule + downstream join reconciles distinctly.
// ===========================================================================
test("(c) each board gamePk joins to a DISTINCT sim game that reconciles", () => {
  const board = dhBoard();
  const { artifact } = generateMlbGameSimulations(board, NOW, DATE);
  const joiner = buildJoinerMap(artifact);

  const resolvedGameIds = [];
  for (const sched of board.games) {
    const anchor = String(sched.gamePk); // the board fixture's matchId is its own gamePk
    const gameId = joiner.get(anchor);
    assert.ok(gameId, `board gamePk ${anchor} must resolve to a sim game (no more "not yet simulated" twin)`);
    resolvedGameIds.push(gameId);

    const sim = artifact.games.find((g) => g.gameId === gameId);
    assert.equal(String(sim.gamePk), anchor, "joined sim must carry the SAME gamePk (identity anchor)");
    assert.ok(reconcileOk(sched.gamePk, sim), "reconcileMlbGame gate must pass (no sim_gamepk_mismatch)");
    assert.equal(sim.status, "ready");
  }
  // Both DH board games resolve to DIFFERENT sim games (the core symptom: previously both hit one id).
  assert.equal(new Set(resolvedGameIds).size, board.games.length, "distinct sim games per board game");
});

// ===========================================================================
// (d1) Fail-closed doubleheader: unsplittable identity ⇒ honest "unavailable", no gamePk, no mis-join.
// ===========================================================================
test("(d1) unsplittable doubleheader fails CLOSED (unavailable, no gamePk, honest module)", () => {
  // Same commence time on both games' leans AND no gameDate on the schedule ⇒ the resolver cannot order
  // them ⇒ it must refuse to guess (fail closed) rather than pick a first match.
  const board = {
    sport: "mlb",
    date: DATE,
    bookmaker: "fixturebook",
    // schedule rows deliberately have NO gameDate ⇒ cannot time-order.
    games: [
      { gamePk: 823518, awayTeamAbbr: "PIT", homeTeamAbbr: "NYY", awayTeamName: "Pittsburgh Pirates", homeTeamName: "New York Yankees" },
      { gamePk: 823519, awayTeamAbbr: "PIT", homeTeamAbbr: "NYY", awayTeamName: "Pittsburgh Pirates", homeTeamName: "New York Yankees" },
    ],
    leans: [
      mkLean("g1", 823519, "2026-07-22T17:05:00Z", 1, "P One"),
      mkLean("g2", 823519, "2026-07-22T17:05:00Z", 2, "P Two"),
    ],
  };
  const { artifact } = generateMlbGameSimulations(board, NOW, DATE);
  assert.ok(validateGameSimulation(artifact).ok, "fail-closed artifact still validates");

  for (const g of artifact.games) {
    assert.equal(g.status, "unavailable", "an unresolved twin must be unavailable, never ready");
    assert.equal(g.gamePk, undefined, "no gamePk is emitted for an unresolved twin");
    assert.ok(
      (g.unavailableModules || []).some((m) => m.module === "game_identity" && m.reason === "ambiguous_doubleheader"),
      "an honest game_identity module is declared",
    );
  }

  // Downstream: NEITHER board gamePk can join to a sim game ⇒ both honestly "not yet simulated" (never a
  // mislabeled twin). This is the whole point of failing closed.
  const joiner = buildJoinerMap(artifact);
  assert.equal(joiner.get("823518"), undefined, "823518 does not resolve to any sim (honest unavailable)");
  assert.equal(joiner.get("823519"), undefined, "823519 does not resolve to any sim (honest unavailable)");
});

// ===========================================================================
// (d2) A game with NO leans is absent from the artifact ⇒ the reader returns honest "unavailable".
// ===========================================================================
test("(d2) a genuinely-missing game yields the honest unavailable read state", () => {
  const board = dhBoard();
  const { artifact } = generateMlbGameSimulations(board, NOW, DATE);

  // Persist to a temp data root and read through the REAL reader (the honesty surface).
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-dh-sim-"));
  const outPath = gameSimulationPath(tmpRoot, "mlb", DATE);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");

  try {
    // A gameId that was never in the board (no leans) is simply not in the artifact ⇒ unavailable.
    const missing = readGameSimulation(tmpRoot, "mlb", DATE, "no-such-game");
    assert.equal(missing.status, "unavailable");
    assert.equal(missing.reason, "game_not_in_artifact");
    assert.equal(missing.game, null);

    // Sanity: a real game DOES read "ready" from the same file (the reader isn't blanket-unavailable).
    const real = readGameSimulation(tmpRoot, "mlb", DATE, "g1early");
    assert.equal(real.status, "ready");
    assert.equal(real.game.gamePk, 823518);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

// ===========================================================================
// Pure-function coverage of resolveGamePks — every branch of the identity resolver.
// ===========================================================================
test("resolveGamePks: single game uses the unique schedule row (schedule-unique)", () => {
  const r = resolveGamePks(
    [{ gameId: "s1", awayTeamAbbr: "SF", homeTeamAbbr: "KC", commenceTime: "2026-07-22T18:00:00Z", leanGamePk: 824083 }],
    [mkSchedule(824083, "2026-07-22T18:05:00Z", "SF", "KC")],
  );
  assert.deepEqual(r.get("s1"), { gamePk: 824083, resolved: true, method: "schedule-unique" });
});

test("resolveGamePks: no schedule + single game trusts the lean id (safe, no collision)", () => {
  const r = resolveGamePks(
    [{ gameId: "s1", awayTeamAbbr: "SF", homeTeamAbbr: "KC", commenceTime: "2026-07-22T18:00:00Z", leanGamePk: 824083 }],
    [],
  );
  assert.deepEqual(r.get("s1"), { gamePk: 824083, resolved: true, method: "lean-single-no-schedule" });
});

test("resolveGamePks: balanced DH splits by strict time order, distinct pks, order-independent", () => {
  const groups = [
    { gameId: "late", awayTeamAbbr: "PIT", homeTeamAbbr: "NYY", commenceTime: "2026-07-22T23:05:00Z", leanGamePk: 823519 },
    { gameId: "early", awayTeamAbbr: "PIT", homeTeamAbbr: "NYY", commenceTime: "2026-07-22T17:06:00Z", leanGamePk: 823519 },
  ];
  const sched = [mkSchedule(823519, "2026-07-22T23:05:00Z"), mkSchedule(823518, "2026-07-22T17:05:00Z")];
  const r = resolveGamePks(groups, sched);
  assert.equal(r.get("early").gamePk, 823518);
  assert.equal(r.get("late").gamePk, 823519);
  assert.equal(r.get("early").method, "schedule-time-order");
  assert.notEqual(r.get("early").gamePk, r.get("late").gamePk);
});

test("resolveGamePks: DH with a time TIE fails closed (cannot order ⇒ no guess)", () => {
  const groups = [
    { gameId: "a", awayTeamAbbr: "PIT", homeTeamAbbr: "NYY", commenceTime: "2026-07-22T17:05:00Z", leanGamePk: 823519 },
    { gameId: "b", awayTeamAbbr: "PIT", homeTeamAbbr: "NYY", commenceTime: "2026-07-22T17:05:00Z", leanGamePk: 823519 },
  ];
  const sched = [mkSchedule(823518, "2026-07-22T17:05:00Z"), mkSchedule(823519, "2026-07-22T23:05:00Z")];
  const r = resolveGamePks(groups, sched);
  assert.equal(r.get("a").resolved, false);
  assert.equal(r.get("a").gamePk, null);
  assert.equal(r.get("b").resolved, false);
  assert.equal(r.get("a").method, "unresolved-ambiguous");
});

test("resolveGamePks: DH with missing schedule times fails closed", () => {
  const groups = [
    { gameId: "a", awayTeamAbbr: "PIT", homeTeamAbbr: "NYY", commenceTime: "2026-07-22T17:06:00Z", leanGamePk: 823519 },
    { gameId: "b", awayTeamAbbr: "PIT", homeTeamAbbr: "NYY", commenceTime: "2026-07-22T23:05:00Z", leanGamePk: 823519 },
  ];
  const sched = [
    { gamePk: 823518, awayTeamAbbr: "PIT", homeTeamAbbr: "NYY" },
    { gamePk: 823519, awayTeamAbbr: "PIT", homeTeamAbbr: "NYY" },
  ];
  const r = resolveGamePks(groups, sched);
  assert.equal(r.get("a").resolved, false);
  assert.equal(r.get("b").resolved, false);
});

test("resolveGamePks: counts mismatch (2 groups, 1 schedule row) fails closed", () => {
  const groups = [
    { gameId: "a", awayTeamAbbr: "PIT", homeTeamAbbr: "NYY", commenceTime: "2026-07-22T17:06:00Z", leanGamePk: 823519 },
    { gameId: "b", awayTeamAbbr: "PIT", homeTeamAbbr: "NYY", commenceTime: "2026-07-22T23:05:00Z", leanGamePk: 823519 },
  ];
  const sched = [mkSchedule(823519, "2026-07-22T23:05:00Z")];
  const r = resolveGamePks(groups, sched);
  assert.equal(r.get("a").resolved, false);
  assert.equal(r.get("b").resolved, false);
  assert.equal(r.get("a").method, "unresolved-ambiguous");
});

test("resolveGamePks: single group vs multi schedule rows matches nearest time", () => {
  const r = resolveGamePks(
    [{ gameId: "only", awayTeamAbbr: "PIT", homeTeamAbbr: "NYY", commenceTime: "2026-07-22T23:04:00Z", leanGamePk: 823519 }],
    [mkSchedule(823518, "2026-07-22T17:05:00Z"), mkSchedule(823519, "2026-07-22T23:05:00Z")],
  );
  assert.equal(r.get("only").gamePk, 823519, "nearest scheduled start wins");
  assert.equal(r.get("only").method, "schedule-nearest-time");
});

test("resolveGamePks: distinctness invariant — twins never share a gamePk across many random-ish orders", () => {
  const sched = [mkSchedule(823518, "2026-07-22T17:05:00Z"), mkSchedule(823519, "2026-07-22T23:05:00Z")];
  for (const [t1, t2] of [
    ["2026-07-22T17:06:00Z", "2026-07-22T23:05:00Z"],
    ["2026-07-22T23:05:00Z", "2026-07-22T17:06:00Z"],
  ]) {
    const r = resolveGamePks(
      [
        { gameId: "x", awayTeamAbbr: "PIT", homeTeamAbbr: "NYY", commenceTime: t1, leanGamePk: 823519 },
        { gameId: "y", awayTeamAbbr: "PIT", homeTeamAbbr: "NYY", commenceTime: t2, leanGamePk: 823519 },
      ],
      sched,
    );
    assert.notEqual(r.get("x").gamePk, r.get("y").gamePk, "twins must never collide on a gamePk");
    assert.deepEqual([r.get("x").gamePk, r.get("y").gamePk].sort(), [823518, 823519]);
  }
});
