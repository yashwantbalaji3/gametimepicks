/**
 * NFL TOP BOARDS · PREGAME SCOPE + STATED RANKING METHOD (Track D, 2026-10-29) — on the COMMITTED week-8 artifact.
 *
 *   1. A pregame Top board never ranks a game that has started. Thursday night's CAR @ GB (401873023, kickoff
 *      2026-10-30T00:15Z) is in the committed week-8 artifact, generated 2026-10-29T19:47:39Z; a page built after that
 *      kickoff must show the remaining games only (pregameScope), and a board that ranked a CAR/GB player is withheld
 *      (PREGAME_SCOPE_STALE), never shown. A board with no started row stays exactly as ranked — proven against the
 *      shared ranking rule (rankFamily) over the remaining games' committed per-game boards.
 *   2. The builder itself (buildTopBoards) excludes a started game from the weekly and daily scopes.
 *   3. Each board states its ranking method; medians are never relabelled as a chance to go over a line, and no Top-board
 *      row carries any over/under, line, side, edge or probability-versus-line field.
 *   4. Passing / rushing yards (not official) never rank: an explicit readiness line, no rows.
 *
 * Run (from app/): npx tsx --test src/lib/sports/nfl/top-boards-pregame.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildTopBoards, pregameScope, rankingMethodText, TOP_BOARD_METHOD, TOP_BOARD_SPECS, TOP_BOARD_SIZE, dailyFor } from "./top-boards.mjs";
import { rankFamily } from "./board-ranking.mjs";

const APP = process.cwd();
const DATA = path.join(APP, "public/data");
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));

const WEEK8 = readJson("nfl/weekly-boards/2-08.json");
const TNF = "401873023"; // CAR @ GB, Thu Oct 29 8:15 PM ET
const TNF_KICK = "2026-10-30T00:15Z";
const BEFORE_TNF = "2026-10-29T23:00:00Z";
const AFTER_TNF = "2026-10-30T00:20:00Z";
const AFTER_MNF = "2026-11-03T04:30:00Z";
const boardOf = (id) => readJson(`nfl/player-board/${id}.json`);
const weekBoards = WEEK8.topBoards.weekly.scope.events.map(boardOf);
const kickoffOf = (id) => weekBoards.find((b) => String(b.providerEventId) === id)?.kickoffUtc ?? null;

test("fixture: the committed week-8 artifact includes TNF CAR @ GB and was generated before its kickoff", () => {
  assert.deepEqual(WEEK8.period, { seasonType: 2, week: 8 });
  assert.ok(WEEK8.topBoards.weekly.scope.events.includes(TNF));
  assert.equal(boardOf(TNF).kickoffUtc, TNF_KICK);
  assert.equal(boardOf(TNF).matchup, "CAR @ GB");
  assert.ok(Date.parse(WEEK8.generatedAt) < Date.parse("2026-10-30T00:15:00Z"));
});

test("before TNF kickoff the committed scopes render exactly as generated", () => {
  assert.equal(pregameScope(WEEK8.topBoards.weekly, BEFORE_TNF, kickoffOf), WEEK8.topBoards.weekly);
  assert.equal(pregameScope(dailyFor(WEEK8.topBoards, "2026-10-29"), BEFORE_TNF, kickoffOf), dailyFor(WEEK8.topBoards, "2026-10-29"));
});

/* Committed per-game boards of TNF + MNF, ranked by the builder at the committed instant: a real pregame scope in which
   CAR/GB players DO rank (the committed 14-game weekly Top-5 happens to rank none). */
const TWO_GAME = buildTopBoards({ weekBoards: [boardOf(TNF), boardOf("401873036")], now: WEEK8.generatedAt, slotFor: () => ({}) }).weekly;

for (const [label, scope] of [["committed 14-game weekly board", WEEK8.topBoards.weekly], ["committed TNF + MNF boards", TWO_GAME]]) {
  test(`after TNF kickoff (${label}): no CAR/GB row in any shown pregame board; a board that ranked one is withheld, never re-ranked`, () => {
    const live = pregameScope(scope, AFTER_TNF, kickoffOf);
    assert.ok(live);
    assert.equal(live.scope.kind, "REMAINING_EVENTS");
    assert.ok(!live.scope.events.includes(TNF));
    assert.equal(live.scope.eventsIncluded, scope.scope.events.length - 1);
    assert.deepEqual(live.scope.startedSinceBuild, [TNF]);
    let withheld = 0, kept = 0;
    for (const b of live.boards) {
      for (const r of b.rows ?? []) assert.notEqual(r.providerEventId, TNF, `${b.id}: ${r.name} is from a started game`);
      const orig = scope.boards.find((x) => x.id === b.id);
      const hadTnf = (orig.rows ?? []).some((r) => r.providerEventId === TNF);
      if (orig.state === "PUBLISHED" && hadTnf) {
        withheld += 1;
        assert.equal(b.state, "NOT_PUBLISHED");
        assert.equal(b.readiness.code, "PREGAME_SCOPE_STALE");
        assert.match(b.readiness.text, /not ranked right now — this list was ranked before 1 game in it kicked off/);
        assert.deepEqual(b.rows, []);
      } else {
        kept += 1;
        assert.equal(b, orig, `${b.id}: a board with no started row is shown exactly as ranked`);
      }
    }
    if (scope === TWO_GAME) assert.ok(withheld >= 1, "the probe ranks at least one CAR/GB player");
    assert.equal(withheld + kept, 5);
  });
}

test("after TNF kickoff: today's TNF-only board closes; Sunday's is untouched", () => {
  assert.equal(pregameScope(dailyFor(WEEK8.topBoards, "2026-10-29"), AFTER_TNF, kickoffOf), null);
  const sun = dailyFor(WEEK8.topBoards, "2026-11-01");
  assert.equal(pregameScope(sun, AFTER_TNF, kickoffOf), sun);
});

test("a kept board IS the Top-N over the remaining games (shared ranking rule, committed per-game boards)", () => {
  const live = pregameScope(WEEK8.topBoards.weekly, AFTER_TNF, kickoffOf);
  const remaining = weekBoards.filter((b) => String(b.providerEventId) !== TNF);
  let checked = 0;
  for (const b of live.boards) {
    if (b.state !== "PUBLISHED") continue;
    const want = rankFamily(remaining, b.family, b.method, { asOf: WEEK8.generatedAt }).slice(0, TOP_BOARD_SIZE).map((x) => x.player.playerId);
    assert.deepEqual(b.rows.map((r) => r.playerId), want, `${b.id}`);
    checked += 1;
  }
  assert.ok(checked >= 1);
});

test("after the week's last kickoff there is no pregame board; an unknown kickoff fails closed", () => {
  assert.equal(pregameScope(WEEK8.topBoards.weekly, AFTER_MNF, kickoffOf), null);
  /* No kickoff known for a rowless event → it counts as started (dropped from the scope), never as upcoming. */
  const sc = structuredClone(WEEK8.topBoards.weekly);
  sc.scope.events.push("999999999");
  const live = pregameScope(sc, BEFORE_TNF, kickoffOf);
  assert.ok(!live.scope.events.includes("999999999"));
  assert.deepEqual(live.scope.startedSinceBuild, ["999999999"]);
  /* A row whose event is outside the scope list is a started row: its board is withheld. */
  const sc2 = structuredClone(WEEK8.topBoards.weekly);
  const pub = sc2.boards.find((b) => b.state === "PUBLISHED");
  pub.rows[0].providerEventId = "888888888";
  assert.equal(pregameScope(sc2, BEFORE_TNF, kickoffOf).boards.find((b) => b.id === pub.id).state, "NOT_PUBLISHED");
  assert.throws(() => pregameScope(WEEK8.topBoards.weekly, "not-a-date"), /nowIso/);
});

test("builder: a game that has kicked off is excluded from the weekly and daily pregame scopes", () => {
  const doc = buildTopBoards({ weekBoards, now: AFTER_TNF, slotFor: () => ({}) });
  assert.equal(doc.weekly.scope.kind, "REMAINING_EVENTS");
  assert.ok(!doc.weekly.scope.events.includes(TNF));
  assert.equal(doc.weekly.scope.eventsDroppedAfterKickoff, 1);
  for (const sc of [doc.weekly, ...doc.daily]) for (const b of sc.boards) for (const r of b.rows ?? []) assert.notEqual(r.providerEventId, TNF);
  assert.ok(!doc.daily.some((d) => d.etDate === "2026-10-29"), "a day with no game left has no pregame board");
  /* Same instant as the committed artifact → the committed weekly rows (regeneration is deterministic). */
  const same = buildTopBoards({ weekBoards, now: WEEK8.generatedAt, slotFor: () => ({}) });
  for (const b of same.weekly.boards) {
    const orig = WEEK8.topBoards.weekly.boards.find((x) => x.id === b.id);
    assert.deepEqual((b.rows ?? []).map((r) => [r.playerId, r.value]), (orig.rows ?? []).map((r) => [r.playerId, r.value]), b.id);
  }
});

test("ranking method: stated per board; TD by probability, yards/receptions by projected median — never an over chance", () => {
  for (const spec of TOP_BOARD_SPECS) {
    const m = TOP_BOARD_METHOD[spec.family];
    assert.ok(m, spec.family);
    assert.equal(m.metric, spec.method, `${spec.family}: stated method == ranking metric`);
    const text = rankingMethodText(spec);
    if (spec.family === "anytime_td") {
      assert.equal(spec.method, "probability");
      assert.match(text, /chance that the player scores at least one touchdown/);
    } else {
      assert.equal(spec.method, "median");
      assert.match(text, /projected median/);
      assert.match(text, /Not a chance to go over any line\./);
      assert.doesNotMatch(text, /\b(over|under)\s+\d|probabilit|likely to (go )?over/i);
    }
  }
  assert.throws(() => rankingMethodText({ id: "x", family: "player_receptions", method: "probability" }), /stated method is median/);
  for (const sc of [WEEK8.topBoards.weekly, ...WEEK8.topBoards.daily]) for (const b of sc.boards) assert.ok(rankingMethodText(b), `${b.id}`);
});

test("no Top-board row carries a line-comparison probability, side, edge or over/under field", () => {
  const BANNED = /prob|over|under|edge|\bev\b|side|lean|direction|line|beat/i;
  const ALLOWED = new Set(["rank", "playerId", "name", "team", "opponent", "providerEventId", "kickoffUtc", "etDate", "participation", "value", "p10", "p90", "pricingState", "market"]);
  let n = 0;
  for (const sc of [WEEK8.topBoards.weekly, ...WEEK8.topBoards.daily]) for (const b of sc.boards) for (const r of b.rows ?? []) {
    for (const k of Object.keys(r)) {
      assert.ok(ALLOWED.has(k), `${b.id} row key ${k} is not a Top-board field`);
      assert.doesNotMatch(k, BANNED, `${b.id} row key ${k}`);
    }
    if (b.method === "probability") assert.ok(r.value >= 0 && r.value <= 1 && !("p10" in r));
    n += 1;
  }
  assert.ok(n >= 15);
  /* The board modules never compare a projection to a line. */
  for (const f of ["src/lib/sports/nfl/top-boards.mjs", "src/lib/sports/nfl/board-ranking.mjs"]) {
    const src = fs.readFileSync(path.join(APP, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.doesNotMatch(src, /compareToLine|line-comparison|evaluateMarket|\.line\b|pOver|overProb/, f);
  }
});

test("passing and rushing yards (not official) never rank: an explicit readiness line, no rows, on every scope", () => {
  for (const sc of [WEEK8.topBoards.weekly, ...WEEK8.topBoards.daily]) for (const fam of ["player_pass_yds", "player_rush_yds"]) {
    const b = sc.boards.find((x) => x.family === fam);
    assert.equal(b.state, "NOT_PUBLISHED");
    assert.equal(b.rows, undefined);
    assert.match(b.readiness.text, /^(Passing|Rushing) yards: not yet published — /);
  }
});

test("SOURCE · the week page and the hub render topBoards only through pregameScope and print the ranking method", () => {
  const week = fs.readFileSync(path.join(APP, "src/app/nfl/week/[key]/page.tsx"), "utf8");
  const hub = fs.readFileSync(path.join(APP, "src/app/nfl/page.tsx"), "utf8");
  assert.match(week, /const weeklyPregame = wb\?\.topBoards \? pregameScope\(wb\.topBoards\.weekly, nowIso, kickoffOf\)/);
  assert.match(week, /pregameScope\(dailyFor\(wb\.topBoards, etDateOfKickoff\(nowIso\)\), nowIso, kickoffOf\)/);
  assert.match(week, /<TopBoardsList artifact=\{wb\} scope=\{weeklyPregame\} \/>/);
  assert.doesNotMatch(week, /scope=\{wb\.topBoards\.weekly\}/, "the week page never renders the unfiltered weekly scope");
  assert.match(week, /data-ranking-method=\{b\.family\}[^>]*>\{rankingMethodText\(b\)\}/);
  assert.match(week, /data-top-boards-closed/);
  assert.match(hub, /pregameScope\(weeklyBoards\.topBoards\.weekly, nowIso, kickoffAt\)/);
  assert.match(hub, /pregameScope\(dailyFor\(topBoardsBlock, todayEt\), nowIso, kickoffAt\)/);
  assert.match(hub, /data-ranking-methods/);
  assert.doesNotMatch(hub, /boardsLive\(/, "the old any-game-left check (which kept started games) is gone");
});
