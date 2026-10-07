/**
 * Stage 12-S2 — NBA daily SHADOW Top Boards: frozen before the first tip from the champion's receipts, write-once,
 * Product Engine `top-board-receipt@0`. Synthetic fixtures only.
 *
 * Run: node --test src/lib/sports/nba/top-boards.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { boardFreezeDecision, nbaDayBoards, owedBoardDays, NBA_BOARD_FAMILIES, NBA_BOARD_POOL } from "./top-boards.mjs";
import { validateBoardReceipt, SELECTOR_STATUS } from "../../products/top-board/top-board.mjs";
import { forecastIdFor } from "../../forecast-ledger/identity.mjs";
import { FORECAST_KIND } from "../../forecast-ledger/contract.mjs";
import { etDateOf } from "./experimental-forecast.mjs";

const q = (p50) => ({ mean: p50 + 0.1, sd: 2, p10: p50 - 3, p50, p90: p50 + 3 });
const player = (id, pts, over = {}) => ({ providerAthleteId: id, name: `P${id}`, expectedMinutes: 30, availability: "active", pts: q(pts), reb: q(pts / 3), ast: q(pts / 4), threePm: q(pts / 10), pra: q(pts * 1.6), ptsAst: q(pts * 1.25), ptsReb: q(pts * 1.33), ...over });
const game = (id, dateUtc, generatedAt, players, over = {}) => ({
  providerEventId: id, dateUtc,
  forecast: { players: { home: players.slice(0, Math.ceil(players.length / 2)), away: players.slice(Math.ceil(players.length / 2)) } },
  receipt: { schema: "nba-forecast-receipt@1", family: "v0.1", modelVersion: "nba-preseason-experimental-v0.1", generatedAt, payloadSha256: `sha-${id}` },
  ...over,
});
const roster = (prefix, n, base) => Array.from({ length: n }, (_, i) => player(`${prefix}${i}`, base - i));
const DAY = "2026-10-20";
const G1 = game("e1", "2026-10-20T23:00Z", "2026-10-20T15:00:00Z", roster("a", 8, 30));
const G2 = game("e2", "2026-10-21T01:30Z", "2026-10-20T17:40:00Z", roster("b", 8, 28));
const ART = { modelVersion: "nba-preseason-experimental-v0.1", games: [G1, G2] };

test("WHEN — freeze once every game has a champion receipt, or once every game is inside the window; never after the first tip", () => {
  const rows = [{ providerEventId: "e1", dateUtc: "2026-10-20T23:00Z" }, { providerEventId: "e2", dateUtc: "2026-10-21T01:30Z" }, { providerEventId: "intl", dateUtc: "2026-10-20T10:00Z" }];
  const d = (now, ids, hasBoard = false) => boardFreezeDecision({ rows, championIds: new Set(ids), now, hasBoard });
  assert.equal(d("2026-10-20T15:30:00Z", ["e1"]).state, "WAIT");
  assert.equal(d("2026-10-20T15:30:00Z", ["e1"]).latestOwedUtc, "2026-10-20T17:30:00.000Z");
  assert.equal(d("2026-10-20T17:30:00Z", ["e1"]).state, "FREEZE", "last tip − 8 h: every game is owed, freeze with what exists");
  assert.equal(d("2026-10-20T16:00:00Z", ["e1", "e2"]).state, "FREEZE", "all frozen early: freeze early");
  assert.equal(d("2026-10-20T23:00:00Z", ["e1", "e2"]).state, "MISSED", "at the first tip it is too late — never back-filled");
  assert.equal(d("2026-10-20T16:00:00Z", ["e1", "e2"], true).state, "FROZEN", "write-once");
  assert.equal(boardFreezeDecision({ rows: [rows[2]], championIds: new Set(), now: "2026-10-20T01:00:00Z", hasBoard: false }).state, "NO_BOARD_SCOPE", "an overnight-only day has no board");
});

test("BOARDS — valid top-board-receipt@0, SHADOW, separate TOP_10 and TOP_5 per family, members join the ledger id", () => {
  const { receipts, notOnBoard, refused } = nbaDayBoards({ artifact: ART, scopeDate: DAY, frozenAt: "2026-10-20T18:00:00Z" });
  assert.deepEqual(refused, []);
  assert.deepEqual(notOnBoard, []);
  assert.equal(receipts.length, NBA_BOARD_FAMILIES.length * 2);
  for (const r of receipts) {
    assert.deepEqual(validateBoardReceipt(r), [], r.boardId);
    assert.equal(r.selectorStatus, SELECTOR_STATUS.SHADOW);
    assert.equal(r.maturityAtFreeze, "OWNER:SHADOW");
    assert.equal(r.modelVersion, "nba-preseason-experimental-v0.1");
  }
  const top10 = receipts.find((r) => r.family === "nba_player_points" && r.boardType === "TOP_10");
  const top5 = receipts.find((r) => r.family === "nba_player_points" && r.boardType === "TOP_5");
  assert.deepEqual(top10.rows.map((x) => x.subjectId), ["a0", "a1", "a2", "b0", "a3", "b1", "a4", "b2", "a5", "b3"]); // ties (28, 27, …) break on athlete id
  assert.deepEqual(top5.rows.map((x) => x.subjectId), top10.rows.slice(0, 5).map((x) => x.subjectId), "same pool, same order");
  assert.equal(top10.rows[0].ledgerForecastId, forecastIdFor({ sport: "NBA", eventId: "e1", subjectType: "PLAYER", subjectId: "a0", family: "nba_player_points", forecastKind: FORECAST_KIND.CONTINUOUS }));
  assert.ok(top10.rows.every((x) => x.line === null && x.frozenSide === null), "no invented line, no direction");
});

test("MEMBERSHIP is frozen: a receipt written after the freeze, or a game already started, is listed and never added", () => {
  const { receipts, notOnBoard } = nbaDayBoards({ artifact: { games: [G1, G2, game("e3", "2026-10-20T19:00Z", "2026-10-20T12:00:00Z", roster("c", 8, 40))] }, scheduleRows: [{ providerEventId: "e4", dateUtc: "2026-10-20T23:30Z" }], scopeDate: DAY, frozenAt: "2026-10-20T17:35:00Z" });
  assert.deepEqual(notOnBoard.map((x) => [x.eventId, x.reason]), [["e2", "RECEIPT_AFTER_FREEZE"], ["e4", "NO_FROZEN_RECEIPT"]]);
  const pts = receipts.find((r) => r.family === "nba_player_points" && r.boardType === "TOP_10");
  assert.ok(pts.rows.every((x) => x.eventId !== "e2"));
  const late = nbaDayBoards({ artifact: { games: [G1, game("e3", "2026-10-20T19:00Z", "2026-10-20T12:00:00Z", roster("c", 8, 40))] }, scopeDate: DAY, frozenAt: "2026-10-20T19:30:00Z" });
  assert.deepEqual(late.notOnBoard.map((x) => [x.eventId, x.reason]), [["e3", "STARTED_BEFORE_FREEZE"]]);
});

test("POOL — Out players and players under 20 expected minutes are counted, never ranked; a board is a maximum, not a quota", () => {
  const players = [player("x0", 50, { availability: "out" }), player("x1", 45, { expectedMinutes: 12 }), player("x2", 20), player("x3", 18)];
  const { receipts } = nbaDayBoards({ artifact: { games: [game("e9", "2026-10-20T23:00Z", "2026-10-20T15:00:00Z", players)] }, scopeDate: DAY, frozenAt: "2026-10-20T16:00:00Z" });
  const r = receipts.find((x) => x.family === "nba_player_points" && x.boardType === "TOP_10");
  assert.deepEqual(r.rows.map((x) => x.subjectId), ["x2", "x3"]);
  assert.equal(r.ineligibleCount, 2);
  assert.equal(NBA_BOARD_POOL.minExpectedMinutes, 20);
});

test("COMBINATIONS are boarded only from frozen joint quantiles — never by summing medians", () => {
  const old = roster("o", 6, 25).map((p) => { const c = { ...p }; delete c.pra; delete c.ptsAst; delete c.ptsReb; return c; });
  const { receipts, refused } = nbaDayBoards({ artifact: { games: [game("e5", "2026-10-20T23:00Z", "2026-10-20T15:00:00Z", old)] }, scopeDate: DAY, frozenAt: "2026-10-20T16:00:00Z" });
  assert.deepEqual(refused.map((x) => x.family), ["nba_player_pra", "nba_player_points_assists", "nba_player_points_rebounds"]);
  assert.ok(!receipts.some((r) => r.family === "nba_player_pra"));
  const pra = nbaDayBoards({ artifact: ART, scopeDate: DAY, frozenAt: "2026-10-20T18:00:00Z" }).receipts.find((r) => r.family === "nba_player_pra" && r.boardType === "TOP_5");
  assert.equal(pra.rows[0].metricValue, G1.forecast.players.home[0].pra.p50);
});

test("ONE MODEL — only the champion's receipts are boarded, and two model versions refuse the day", () => {
  const challenger = game("e6", "2026-10-20T23:00Z", "2026-10-20T15:00:00Z", roster("v", 6, 35), {});
  challenger.receipt = { ...challenger.receipt, family: "v0.2", modelVersion: "nba-experimental-v0.2-season-2026-27" };
  const { notOnBoard } = nbaDayBoards({ artifact: { games: [G1, challenger] }, scopeDate: DAY, frozenAt: "2026-10-20T16:00:00Z" });
  assert.deepEqual(notOnBoard.map((x) => x.reason), ["NOT_CHAMPION (v0.2)"]);
  const mixed = game("e7", "2026-10-20T23:00Z", "2026-10-20T15:00:00Z", roster("m", 6, 35));
  mixed.receipt = { ...mixed.receipt, modelVersion: "nba-preseason-experimental-v0.1-other" };
  assert.throws(() => nbaDayBoards({ artifact: { games: [G1, mixed] }, scopeDate: DAY, frozenAt: "2026-10-20T16:00:00Z" }), /one board, one model/);
  assert.deepEqual(nbaDayBoards({ artifact: { games: [] }, scopeDate: DAY, frozenAt: "2026-10-20T16:00:00Z" }).receipts, [], "no receipt, no board");
});

test("WINDOW — a due board makes the forecast window run even when every forecast is already frozen", () => {
  const rows = [{ providerEventId: "e1", dateUtc: "2026-10-20T23:00Z" }, { providerEventId: "e2", dateUtc: "2026-10-21T01:30Z" }];
  const args = { rows, now: "2026-10-20T16:00:00Z", etDateOf, championIdsByDate: () => new Set(["e1", "e2"]) };
  assert.deepEqual(owedBoardDays({ ...args, hasBoardFor: () => false }), [DAY]);
  assert.deepEqual(owedBoardDays({ ...args, hasBoardFor: () => true }), []);
});

test("WORKFLOW — the window freezes boards after the builds, commits them add-only, and a refusal never fails a forecast", () => {
  const yaml = fs.readFileSync(path.resolve(process.cwd(), "..", ".github", "workflows", "nba-forecast-window.yml"), "utf8");
  const freeze = yaml.indexOf("freeze-nba-top-boards.mjs --now \"$NOW\" --write");
  assert.ok(freeze > yaml.indexOf("--family v0.2 --horizon-hours 8"), "boards freeze after every family has built");
  assert.ok(freeze < yaml.indexOf("git add ../data/internal/research/nba/experimental/"), "and before the commit");
  assert.match(yaml, /freeze-nba-top-boards\.mjs --now "\$NOW" --write \\\n[^\n]*\|\| echo "::warning::/, "a board refusal warns");
  assert.match(yaml, /git add [^\n]*top-board-receipts\//);
  assert.match(yaml, /--diff-filter=MDR HEAD -- \.\.\/data\/internal\/research\/nba\/top-board-receipts\//, "boards are add-only");
});
