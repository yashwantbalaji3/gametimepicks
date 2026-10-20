/**
 * NBA Top Board row evaluation contract + row view model.
 *
 * TEST FIXTURE NOTICE: every price object in this file is a SYNTHETIC TEST FIXTURE built inline (marked
 * `fixture: "TEST FIXTURE"`). No NBA price exists or is committed as data; nothing here is read by any page.
 *
 * Run (from app/): npx tsx --test src/lib/sports/nba/top-board-evaluation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { evaluateMarket } from "../../consistency/market-evaluator.mjs";
import {
  DISTRIBUTION_KIND, NBA_NOT_MODELLED, NBA_OFFICIAL_FAMILY, NBA_PLAYER_FAMILIES, OFFICIAL_SNAPSHOT_SCHEMA, PUBLICATION, nbaOfficialSnapshot, quantilePoints, sealSnapshot,
} from "../../consistency/official-snapshot.mjs";
import { CATEGORIES, DEFAULT_BOARD_FAMILY, NOT_MODELLED_CATEGORIES, freezeBoards } from "./top-boards.mjs";
import {
  NBA_PROVIDER_KEY_BY_STAT, PRICE_REJECTION, ROW_EVALUATION_STATE, TEST_FIXTURE_MARK, VERIFIED_PRICE_KIND, authorizedNbaStats, boardRowEvaluation,
} from "./top-board-evaluation.mjs";
import {
  NO_AUTHORIZED_PRICE, NO_PRICE_TEXT, OFFICIAL_PLAYER_FAMILY, PRICE_FIELDS, boardRowView, boardTableModel, filterOptions, filterRowViews, marketStates, sortRowViews,
} from "./top-board-rows.mjs";
import { artifact, game, player, SHA } from "./__fixtures__/top-board-fixtures.mjs";

const NOW = "2026-11-01T16:00:00Z";
const doc = freezeBoards({
  existing: null, sourceSha256: SHA, frozenAt: NOW, family: "v0.1", date: "2026-11-01",
  artifact: artifact([
    game("fx-1", { home: [player(1, { pts: 20 }), player(2, { pts: 15 })], away: [player(3, { pts: 25, reb: 10 })] }),
    game("fx-2", { tip: "2026-11-02T02:00Z", home: [player(4, { pts: 18 })], away: [] }),
  ]),
}).doc;
const edition = doc.editions[0];
const rowOf = (id, cat = "points") => edition.boards[cat].rows.find((r) => r.player.providerAthleteId === String(id));

/* ── SYNTHETIC official snapshot for fx-1 (built here, not by nbaOfficialSnapshot, so it carries combo families) ── */
function fixtureSnapshot(rows, { eventId = "fx-1", inputRef } = {}) {
  const fam = (d) => ({ state: "PRIVATE_SHADOW", distribution: { kind: DISTRIBUTION_KIND.QUANTILES, points: quantilePoints(d), mean: d.mean, lowerBound: 0 }, expected: d.mean, sd: d.sd ?? null, median: d.p50, support: "integer", modelVersion: "fixture" });
  const players = rows.map((r) => ({ playerId: r.player.providerAthleteId, team: r.team.abbr, side: r.homeAway, displayName: r.player.name, participation: "active", injuryStatus: null, families: { [r.stat]: fam({ ...r.projection, ...r.range }) } }));
  return sealSnapshot({
    schema: OFFICIAL_SNAPSHOT_SCHEMA, sport: "NBA", eventId, fixture: TEST_FIXTURE_MARK,
    home: { abbr: "BOS" }, away: { abbr: "NYK" }, modelVersions: { game: "fixture", players: {} },
    generatedAt: "2026-11-01T15:00:00.000Z", frozenAt: "2026-11-01T15:00:00.000Z", lockAt: "2026-11-01T23:30:00.000Z",
    publication: PUBLICATION.PRIVATE, capability: { state: "HISTORICAL_ONLY", canShowLiveProjections: false, canEnterPredictionProducts: false },
    game: {}, players, excluded: [],
    sources: [{ role: "OFFICIAL", inputRef: inputRef ?? rows[0].receipt.gamePayloadSha256 }],
  });
}

/** TEST FIXTURE price — synthetic, never data. */
const fixturePrice = (row, o = {}) => ({
  kind: VERIFIED_PRICE_KIND, verified: true, fixture: TEST_FIXTURE_MARK,
  provenance: { provider: "TEST FIXTURE", captureId: "fixture-capture-1", authorizationRef: "TEST FIXTURE — no authorization exists" },
  eventId: row.eventId, providerAthleteId: row.player.providerAthleteId, stat: row.stat,
  book: "fixturebook", line: 17.5, overAmerican: -110, underAmerican: -110, capturedAt: "2026-11-01T15:30:00Z",
  ...o,
});
const TEST_AUTH = { authorizedStats: ["pts", "reb", "ast", "threePm", "pra", "ptsReb", "ptsAst"], allowTestFixture: true, now: NOW };
const spy = () => { const calls = []; const f = (input) => { calls.push(input); return evaluateMarket(input); }; f.calls = calls; return f; };

test("no price → NO_AUTHORIZED_PRICE and the evaluator is never called (every row today)", () => {
  const ev = spy();
  for (const b of Object.values(edition.boards)) for (const r of b.rows) {
    const out = boardRowEvaluation(r, fixtureSnapshot([r]), null, { now: NOW, evaluate: ev });
    assert.equal(out.state, ROW_EVALUATION_STATE.NO_AUTHORIZED_PRICE);
    assert.deepEqual(out.reasonCodes, ["NO_AUTHORIZED_PRICE"]);
    assert.equal(out.evaluation, null);
    for (const k of ["book", "line", "overAmerican", "underAmerican", "capturedAt"]) assert.equal(out[k], null);
  }
  assert.equal(ev.calls.length, 0);
  // undefined is the same as null
  assert.equal(boardRowEvaluation(rowOf(1), null, undefined, { evaluate: ev }).state, "NO_AUTHORIZED_PRICE");
});

test("the live config authorizes no NBA statistic, so even a perfect price is refused MARKET_NOT_AUTHORIZED", () => {
  assert.deepEqual(authorizedNbaStats(), [], "NBA_MARKET_CONFIG.playerFamilyByProviderKey is empty");
  assert.deepEqual(authorizedNbaStats({ playerFamilyByProviderKey: { player_points: "X", player_points_rebounds_assists: "Y" } }), ["pts", "pra"]);
  assert.equal(NBA_PROVIDER_KEY_BY_STAT.pra, "player_points_rebounds_assists");
  const r = rowOf(1); const ev = spy();
  const out = boardRowEvaluation(r, fixtureSnapshot([r]), fixturePrice(r), { now: NOW, allowTestFixture: true, evaluate: ev });
  assert.equal(out.state, ROW_EVALUATION_STATE.PRICE_REJECTED);
  assert.deepEqual(out.reasonCodes, [PRICE_REJECTION.MARKET_NOT_AUTHORIZED]);
  assert.equal(ev.calls.length, 0);
});

test("a TEST FIXTURE price is refused unless the caller opts in (pages never do)", () => {
  const r = rowOf(1);
  const out = boardRowEvaluation(r, fixtureSnapshot([r]), fixturePrice(r), { ...TEST_AUTH, allowTestFixture: false });
  assert.deepEqual(out.reasonCodes, [PRICE_REJECTION.PRICE_TEST_FIXTURE]);
});

test("verified TEST FIXTURE price → EVALUATED: the result IS evaluateMarket's, byte for byte", () => {
  const r = rowOf(1); const snap = fixtureSnapshot([r]); const ev = spy();
  const out = boardRowEvaluation(r, snap, fixturePrice(r), { ...TEST_AUTH, evaluate: ev });
  assert.equal(out.state, ROW_EVALUATION_STATE.EVALUATED);
  assert.equal(ev.calls.length, 1);
  assert.deepEqual(ev.calls[0], { snapshot: snap, playerId: "1", family: "pts", line: 17.5, book: "fixturebook", overAmerican: -110, underAmerican: -110, capturedAt: "2026-11-01T15:30:00Z", now: NOW });
  const direct = evaluateMarket({ snapshot: snap, playerId: "1", family: "pts", line: 17.5, book: "fixturebook", overAmerican: -110, underAmerican: -110, capturedAt: "2026-11-01T15:30:00Z", now: NOW });
  assert.deepEqual(out.evaluation, direct);
  assert.equal(out.evaluation.lean, "OVER", "the EVALUATOR's lean at this price");
  // private snapshot, non-product sport, unpublished family → visible but never qualified
  assert.equal(out.evaluation.eligibility.qualified, false);
  for (const k of ["PUBLICATION_PRIVATE", "SPORT_NOT_PRODUCT_ELIGIBLE", "FAMILY_NOT_PUBLISHED"]) assert.ok(out.evaluation.withheldReasons.includes(k), k);
  assert.equal(out.fixture, TEST_FIXTURE_MARK);
});

test("a projection above the line is NOT an Over: at a heavily juiced Over price the evaluator says UNDER", () => {
  const r = rowOf(1); // p50 20 > line 19.5
  assert.ok(r.projection.p50 > 19.5);
  const out = boardRowEvaluation(r, fixtureSnapshot([r]), fixturePrice(r, { line: 19.5, overAmerican: -400, underAmerican: 300 }), TEST_AUTH);
  assert.equal(out.state, "EVALUATED");
  assert.equal(out.evaluation.lean, "UNDER");
  // and at a fair price close to the model the evaluator gives no lean at all
  const near = boardRowEvaluation(r, fixtureSnapshot([r]), fixturePrice(r, { line: 19.5, overAmerican: -110, underAmerican: -110 }), TEST_AUTH);
  assert.equal(near.evaluation.lean, "NONE");
  assert.ok(near.evaluation.withheldReasons.includes("BELOW_LEAN_THRESHOLD"));
});

test("combo rows evaluate their own joint family; a snapshot without it is the evaluator's FAMILY_NOT_IN_SNAPSHOT", () => {
  const r = rowOf(1, "pra");
  const ok = boardRowEvaluation(r, fixtureSnapshot([r]), fixturePrice(r, { line: 25.5 }), TEST_AUTH);
  assert.equal(ok.state, "EVALUATED");
  assert.equal(ok.evaluation.identity.family, "pra");
  const ptsOnly = fixtureSnapshot([rowOf(1)]);
  const missing = boardRowEvaluation(r, ptsOnly, fixturePrice(r, { line: 25.5 }), TEST_AUTH);
  assert.equal(missing.state, "EVALUATED");
  assert.equal(missing.evaluation.lean, "NONE");
  assert.ok(missing.evaluation.withheldReasons.includes("FAMILY_NOT_IN_SNAPSHOT"));
});

test("R+A is NOT_MODELLED and never reaches the evaluator, price or not", () => {
  const ev = spy();
  const fake = { rowId: "x", category: "rebAst", stat: null, eventId: "fx-1", player: { providerAthleteId: "1" } };
  assert.equal(boardRowEvaluation(fake, null, null, { evaluate: ev }).state, "NOT_MODELLED");
  assert.equal(boardRowEvaluation(fake, null, { kind: VERIFIED_PRICE_KIND }, { ...TEST_AUTH, evaluate: ev }).state, "NOT_MODELLED");
  assert.equal(ev.calls.length, 0);
});

test("price verification: each defect is named, and none reaches the evaluator", () => {
  const r = rowOf(1); const snap = fixtureSnapshot([r]); const ev = spy();
  const CASES = [
    [{ verified: false }, PRICE_REJECTION.PRICE_NOT_VERIFIED],
    [{ kind: "something-else" }, PRICE_REJECTION.PRICE_MALFORMED],
    [{ provenance: { provider: "x", captureId: "y" } }, PRICE_REJECTION.PRICE_NO_PROVENANCE],
    [{ providerAthleteId: "2" }, PRICE_REJECTION.PRICE_SUBJECT_MISMATCH],
    [{ stat: "reb" }, PRICE_REJECTION.PRICE_SUBJECT_MISMATCH],
    [{ eventId: "fx-2" }, PRICE_REJECTION.PRICE_SUBJECT_MISMATCH],
    [{ line: null }, PRICE_REJECTION.PRICE_MALFORMED],
    [{ book: "" }, PRICE_REJECTION.PRICE_MALFORMED],
    [{ capturedAt: "yesterday" }, PRICE_REJECTION.PRICE_MALFORMED],
    [{ underAmerican: null }, PRICE_REJECTION.PRICE_NOT_TWO_WAY],
  ];
  for (const [over, reason] of CASES) {
    const out = boardRowEvaluation(r, snap, fixturePrice(r, over), { ...TEST_AUTH, evaluate: ev });
    assert.equal(out.state, "PRICE_REJECTED", JSON.stringify(over));
    assert.ok(out.reasonCodes.includes(reason), `${JSON.stringify(over)} → ${out.reasonCodes}`);
  }
  assert.deepEqual(boardRowEvaluation(r, snap, "not an object", TEST_AUTH).reasonCodes, ["PRICE_MALFORMED"]);
  assert.equal(ev.calls.length, 0);
});

test("one official forecast: no snapshot, another event's snapshot, or a snapshot that disagrees with the frozen row → refused", () => {
  const r = rowOf(1); const p = fixturePrice(r);
  assert.deepEqual(boardRowEvaluation(r, null, p, TEST_AUTH).reasonCodes, ["NO_SNAPSHOT"]);
  assert.ok(boardRowEvaluation(r, fixtureSnapshot([r], { eventId: "fx-2" }), p, TEST_AUTH).reasonCodes.includes("SNAPSHOT_EVENT_MISMATCH"));
  assert.deepEqual(boardRowEvaluation(r, fixtureSnapshot([r], { inputRef: "f".repeat(64) }), p, TEST_AUTH).reasonCodes, ["BOARD_SNAPSHOT_DIVERGED"]);
  const moved = { ...r, projection: { ...r.projection, p50: 21 } };
  assert.deepEqual(boardRowEvaluation(moved, fixtureSnapshot([r]), fixturePrice(moved), TEST_AUTH).reasonCodes, ["BOARD_SNAPSHOT_DIVERGED"]);
});

/* ───────────────────────────── row view model ───────────────────────────── */

test("row view: every brief field; each price cell is explicitly 'No authorized NBA price' with its reason code", () => {
  const m = boardTableModel(doc);
  assert.ok(m.rows.length > 0);
  assert.equal(m.priced, false);
  for (const v of m.rows) {
    assert.match(v.player.providerAthleteId, /^\d+$/);
    assert.ok(v.player.team?.abbr);
    assert.ok(v.game.eventId && v.game.opponent?.abbr && v.game.tipoffUtc && v.game.etDate === "2026-11-01");
    assert.ok(v.market.key && v.market.label && v.market.basis);
    assert.equal(typeof v.projection.value, "number");
    assert.equal(v.projection.role, "OFFICIAL", "v0.1 is the official player family");
    for (const f of PRICE_FIELDS) assert.deepEqual(v.price[f], { value: null, state: NO_AUTHORIZED_PRICE, reasonCode: NO_AUTHORIZED_PRICE, display: NO_PRICE_TEXT }, f);
    assert.equal(v.updated.forecastFrozenAt, NOW);
    assert.equal(v.updated.oddsCapturedAt, null);
    assert.equal(v.updated.oddsCapturedAtReason, NO_AUTHORIZED_PRICE);
    assert.match(v.priceExplanation, /decision-nba-markets-authorization/);
  }
  const pra = m.rows.find((v) => v.market.key === "pra");
  assert.equal(pra.market.basis, "JOINT_SIMULATED_SUM");
  assert.deepEqual(pra.market.components, ["pts", "reb", "ast"]);
  assert.equal(m.rows.some((v) => v.market.key === "rebAst"), false, "R+A has no rows");
  assert.equal(m.markets.find((x) => x.key === "rebAst").state, "NOT_MODELLED");
  const v1Row = boardRowView({ ...rowOf(1), family: "v1" }, { edition, doc });
  assert.equal(v1Row.projection.role, "SUPPORTING_SIMULATION");
});

test("an evaluated row's cells are copied from the evaluator only", () => {
  const r = rowOf(1);
  const evaluation = boardRowEvaluation(r, fixtureSnapshot([r]), fixturePrice(r), TEST_AUTH);
  const v = boardRowView(r, { edition, doc, evaluation });
  assert.equal(v.price.sportsbook.value, "fixturebook");
  assert.equal(v.price.line.value, 17.5);
  assert.equal(v.price.side.value, evaluation.evaluation.lean);
  assert.equal(v.price.side.qualified, false);
  assert.equal(v.price.modelProbability.value.over, evaluation.evaluation.pOver);
  assert.deepEqual(v.price.odds.value, { over: -110, under: -110 });
  assert.equal(v.price.edge.value.best, evaluation.evaluation.edge.over);
  assert.equal(v.updated.oddsCapturedAt, "2026-11-01T15:30:00Z");
  assert.equal(v.sortKeys.edge, evaluation.evaluation.edge.over);
  const rejected = boardRowView(r, { edition, doc, evaluation: boardRowEvaluation(r, null, fixturePrice(r), TEST_AUTH) });
  assert.deepEqual([rejected.price.line.value, rejected.price.line.reasonCode], [null, "NO_SNAPSHOT"]);
});

test("sorting by game, player, market, sportsbook, projection, edge is total and deterministic", () => {
  const rows = boardTableModel(doc).rows;
  const proj = sortRowViews(rows, "projection");
  for (let i = 1; i < proj.length; i += 1) assert.ok(proj[i - 1].projection.value >= proj[i].projection.value);
  const game = sortRowViews(rows, "game");
  assert.equal(game.at(-1).game.eventId, "fx-2", "later tip last");
  const player = sortRowViews(rows, "player");
  assert.deepEqual(player.slice(0, 2).map((v) => v.player.name), ["Fixture Player 1", "Fixture Player 1"]);
  const market = sortRowViews(rows, "market");
  assert.equal(market[0].market.key, "points");
  assert.equal(market.at(-1).market.key, "ptsAst");
  // null-keyed sorts (no sportsbook, no edge today) keep a deterministic rowId order
  assert.deepEqual(sortRowViews(rows, "edge").map((v) => v.rowId), [...rows].map((v) => v.rowId).sort());
  assert.deepEqual(sortRowViews([...rows].reverse(), "sportsbook").map((v) => v.rowId), sortRowViews(rows, "sportsbook").map((v) => v.rowId));
  assert.throws(() => sortRowViews(rows, "value"), /unknown key/);
});

test("filtering by game, player, market, projection; sportsbook and edge controls are disabled with the reason", () => {
  const m = boardTableModel(doc);
  assert.ok(filterRowViews(m.rows, { game: "fx-2" }).every((v) => v.game.eventId === "fx-2"));
  assert.ok(filterRowViews(m.rows, { market: "pra" }).every((v) => v.market.key === "pra"));
  assert.ok(filterRowViews(m.rows, { player: "player 3" }).every((v) => v.player.providerAthleteId === "3"));
  assert.ok(filterRowViews(m.rows, { player: "3" }).every((v) => v.player.providerAthleteId === "3"));
  assert.ok(filterRowViews(m.rows, { minProjection: 20 }).every((v) => v.projection.value >= 20));
  assert.equal(filterRowViews(m.rows, { game: "all", market: "all", player: "" }).length, m.rows.length);
  assert.equal(filterRowViews(m.rows, { minEdge: 0 }).length, 0, "no row has an edge");
  const o = filterOptions(m);
  assert.deepEqual(o.games.map((g) => g.value), ["fx-1", "fx-2"]);
  assert.equal(o.games[0].label, "NYK @ BOS", "canonical tricodes, away @ home");
  assert.equal(o.edgeEnabled, false);
  assert.match(o.edgeDisabledReason, /Disabled — No authorized NBA price \(NO_AUTHORIZED_PRICE\)/);
  assert.equal(o.sportsbookEnabled, false);
  assert.deepEqual(o.sorts.filter((s) => s.disabled).map((s) => s.key), ["sportsbook", "edge"]);
  assert.equal(o.markets.find((x) => x.value === "rebAst").disabled, true);
});

test("a committed schema @1 file renders: its four boards rank, the joint boards say NOT_IN_THIS_FREEZE, R+A NOT_MODELLED", () => {
  const f = new URL("../../../../../data/internal/research/nba/top-boards/v0.1/2026-10-20.json", import.meta.url);
  if (!fs.existsSync(f)) return;
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  const states = Object.fromEntries(marketStates(d).map((s) => [s.key, s.state]));
  assert.deepEqual(Object.keys(states), ["points", "rebounds", "assists", "threes", "pra", "ptsReb", "ptsAst", "rebAst"]);
  for (const k of ["pra", "ptsReb", "ptsAst"]) assert.equal(states[k], "NOT_IN_THIS_FREEZE");
  assert.equal(states.rebAst, "NOT_MODELLED");
  const m = boardTableModel(d);
  assert.ok(m.rows.every((v) => v.projection.metric === "MODEL_MEDIAN_P50" && v.price.odds.reasonCode === NO_AUTHORIZED_PRICE));
  assert.equal(marketStates(null)[0].state, "NO_DATA");
});

/* ───────────── against the REAL official snapshot contract (#1149) and committed artifacts ───────────── */

test("board ↔ official snapshot contract: same official family, every ranked statistic is an official family, R+A not modelled on both", () => {
  assert.equal(DEFAULT_BOARD_FAMILY, NBA_OFFICIAL_FAMILY);
  assert.equal(OFFICIAL_PLAYER_FAMILY, NBA_OFFICIAL_FAMILY);
  for (const c of CATEGORIES) assert.ok(NBA_PLAYER_FAMILIES.includes(c.stat), `${c.stat} is an official snapshot family`);
  for (const c of NOT_MODELLED_CATEGORIES) assert.ok(NBA_NOT_MODELLED.includes(c.key), `${c.key} is notModelled in the snapshot too`);
});

test("a supporting-family (v1) row is never priced: NOT_OFFICIAL_FAMILY", () => {
  const r = { ...rowOf(1), family: "v1" };
  const out = boardRowEvaluation(r, fixtureSnapshot([rowOf(1)]), fixturePrice(r), TEST_AUTH);
  assert.equal(out.state, "PRICE_REJECTED");
  assert.ok(out.reasonCodes.includes("NOT_OFFICIAL_FAMILY"));
});

const REPO = new URL("../../../../../", import.meta.url);
const readJson = (rel) => { const u = new URL(rel, REPO); return fs.existsSync(u) ? JSON.parse(fs.readFileSync(u, "utf8")) : null; };

test("REAL: the committed v0.1 frozen board agrees with nbaOfficialSnapshot on every row (same payload, same median)", () => {
  const board = readJson("data/internal/research/nba/top-boards/v0.1/2026-10-20.json");
  const fc = readJson("data/internal/research/nba/experimental-v0.1/forecasts/2026-10-20.json");
  if (!board || !fc) return;
  let checked = 0;
  for (const e of board.editions) for (const b of Object.values(e.boards)) for (const r of b.rows) {
    const snap = nbaOfficialSnapshot(r.eventId, { official: { doc: fc } });
    const out = boardRowEvaluation({ ...r, family: board.family }, snap, fixturePrice(r), TEST_AUTH);
    assert.equal(out.state, "EVALUATED", `${r.rowId}: ${out.reasonCodes}`);
    // the shared evaluator decides; for NBA it is never qualified today
    assert.equal(out.evaluation.eligibility.qualified, false);
    for (const k of ["FAMILY_NOT_PUBLISHED", "PUBLICATION_PRIVATE", "SPORT_NOT_PRODUCT_ELIGIBLE"]) assert.ok(out.evaluation.withheldReasons.includes(k), `${r.rowId} ${k}`);
    // and with no price it is NO_AUTHORIZED_PRICE without touching the evaluator
    assert.equal(boardRowEvaluation(r, snap, null).state, "NO_AUTHORIZED_PRICE");
    checked += 1;
  }
  assert.ok(checked >= 10, `positive control: ${checked} committed rows checked`);
});

test("REAL: the committed v1 board against the official (v0.1) snapshot is refused — v1 is a supporting simulation", () => {
  const board = readJson("data/internal/research/nba/top-boards/v1/2026-10-20.json");
  const fc = readJson("data/internal/research/nba/experimental-v0.1/forecasts/2026-10-20.json");
  if (!board || !fc) return;
  const r = { ...board.editions[0].boards.points.rows[0], family: board.family };
  const out = boardRowEvaluation(r, nbaOfficialSnapshot(r.eventId, { official: { doc: fc } }), fixturePrice(r), TEST_AUTH);
  assert.equal(out.state, "PRICE_REJECTED");
  assert.ok(out.reasonCodes.includes("NOT_OFFICIAL_FAMILY"));
  assert.ok(out.reasonCodes.includes("BOARD_SNAPSHOT_DIVERGED"), "different payload / median than the official record");
});
