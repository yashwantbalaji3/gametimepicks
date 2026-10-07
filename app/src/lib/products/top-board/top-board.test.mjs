/**
 * PROTOTYPE tests · Stage 5 prep. Pin invariants (frozen-before-start membership, max-not-quota, counted once,
 * never a loss, windows anchored on the reader's ET day) and prove the receipt fits the one real frozen board.
 * They pin a committed fixture, never a live total.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateBoardReceipt, windowBounds, inWindow, etDayOf, familyAndBoardPerformance, WINDOW, OUTCOME, TOP_BOARD_SCHEMA, METRIC_KIND, SELECTOR_STATUS } from "./top-board.mjs";
import { receiptsFromNflFrozenDay } from "./from-nfl-frozen-day.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const day = JSON.parse(fs.readFileSync(path.join(HERE, "__fixtures__/nfl-top-boards-2026-10-05.json"), "utf8"));
const id = (n) => `fl1-${n.toString(16).padStart(16, "0")}`;

const receipt = (over = {}, rows = 5) => ({
  schema: TOP_BOARD_SCHEMA, boardId: "nfl:player_rush_yds:2026-10-11:TOP_10", sport: "nfl", family: "player_rush_yds",
  boardType: "TOP_10", scopeDate: "2026-10-11", frozenAt: "2026-10-11T16:00:00Z",
  rankingRule: { id: "r", metricKind: METRIC_KIND.MODEL_MEDIAN, tiebreak: "mean" }, selectorStatus: SELECTOR_STATUS.PUBLIC_RANKED_FORECAST,
  modelId: "m", modelVersion: null, generation: null, maturityAtFreeze: "EXPERIMENTAL", eligibilityVersion: "x",
  rows: Array.from({ length: rows }, (_, i) => ({ rank: i + 1, ledgerForecastId: id(i + 1), claimKey: null, eventId: "e1", eventStartUtc: "2026-10-11T17:00:00Z", subjectType: "PLAYER", subjectId: `p${i}`, metricValue: 90 - i, line: null, frozenSide: null })),
  ineligibleCount: 0, ...over,
});

test("the one real frozen board (NFL Top-5, 2026-10-05) maps onto the receipt with no invented field", () => {
  const rs = receiptsFromNflFrozenDay(day);
  assert.equal(rs.length, day.boards.length);
  for (const r of rs) assert.deepEqual(validateBoardReceipt(r), [], r.boardId);
  const td = rs.find((r) => r.family === "anytime_td");
  assert.equal(td.rankingRule.metricKind, METRIC_KIND.MODEL_PROBABILITY);
  assert.equal(td.modelVersion, null, "null stays null");
  assert.match(td.rows[0].ledgerForecastId, /^fl1-[0-9a-f]{16}$/);
});

test("membership frozen at or after a member's start is invalid; Top-N is a maximum, ranks contiguous and unique", () => {
  assert.deepEqual(validateBoardReceipt(receipt()), []);
  assert.ok(validateBoardReceipt(receipt({ frozenAt: "2026-10-11T17:00:00Z" })).some((m) => m.includes("frozen at/after")));
  assert.deepEqual(validateBoardReceipt(receipt({}, 3)), [], "fewer than N is fine");
  assert.ok(validateBoardReceipt(receipt({ boardType: "TOP_5" }, 6)).some((m) => m.includes("more rows")));
  const r = receipt(); r.rows[2].rank = 4;
  assert.ok(validateBoardReceipt(r).some((m) => m.includes("contiguous")));
  const d = receipt(); d.rows[1].ledgerForecastId = d.rows[0].ledgerForecastId;
  assert.ok(validateBoardReceipt(d).some((m) => m.includes("duplicate")));
});

test("ADOPTED needs a founder reference; a sportsbook-price ranking is never a ranked GTP forecast", () => {
  assert.ok(validateBoardReceipt(receipt({ selectorStatus: SELECTOR_STATUS.ADOPTED })).length > 0);
  assert.deepEqual(validateBoardReceipt(receipt({ selectorStatus: SELECTOR_STATUS.ADOPTED, adoptionRef: "founder:2026-10-07" })), []);
  assert.ok(validateBoardReceipt(receipt({ rankingRule: { id: "m", metricKind: METRIC_KIND.MARKET_IMPLIED } })).length > 0);
  assert.deepEqual(validateBoardReceipt(receipt({ rankingRule: { id: "m", metricKind: METRIC_KIND.MARKET_IMPLIED }, selectorStatus: SELECTOR_STATUS.SHADOW })), []);
});

test("windows end yesterday on the reader's ET day; the basis is the ET day of the event start", () => {
  assert.deepEqual(windowBounds(WINDOW.YESTERDAY, { readerEtDay: "2026-10-07" }), { from: "2026-10-06", to: "2026-10-06" });
  assert.deepEqual(windowBounds(WINDOW.D3, { readerEtDay: "2026-10-07" }), { from: "2026-10-04", to: "2026-10-06" });
  assert.deepEqual(windowBounds(WINDOW.D10, { readerEtDay: "2026-10-07" }), { from: "2026-09-27", to: "2026-10-06" });
  assert.deepEqual(windowBounds(WINDOW.ALL_TIME, { readerEtDay: "2026-10-07" }), { from: null, to: "2026-10-06" });
  assert.throws(() => windowBounds(WINDOW.SEASON, { readerEtDay: "2026-10-07" }), /seasonStart/);
  assert.equal(etDayOf("2026-10-06T00:15Z"), "2026-10-05", "MNF kicking off 00:15Z is the Monday ET game");
  assert.equal(inWindow(null, { from: null, to: "2026-10-06" }), false, "unknown start is never in a window");
});

test("family vs Top-10 vs Top-5: counted once, never a loss, unjoined and non-directional disclosed, nothing decided is null", () => {
  const bounds = { from: null, to: "2026-10-12" };
  const ofRecord = [
    { ledgerForecastId: id(1), eventStartUtc: "2026-10-11T17:00:00Z", outcome: OUTCOME.WIN, directional: true },
    { ledgerForecastId: id(2), eventStartUtc: "2026-10-11T17:00:00Z", outcome: OUTCOME.LOSS, directional: true },
    { ledgerForecastId: id(3), eventStartUtc: "2026-10-11T17:00:00Z", outcome: OUTCOME.VOID, directional: true },
    { ledgerForecastId: id(4), eventStartUtc: "2026-10-11T17:00:00Z", outcome: OUTCOME.PENDING, directional: true },
    { ledgerForecastId: id(6), eventStartUtc: "2026-10-11T17:00:00Z", outcome: OUTCOME.WIN, directional: true },
    { ledgerForecastId: id(7), eventStartUtc: "2026-10-11T17:00:00Z", outcome: null, directional: false },
    { ledgerForecastId: id(99), eventStartUtc: "2026-10-11T17:00:00Z", outcome: OUTCOME.LOSS, directional: true },
  ];
  const top10 = receipt({}, 7); // ranks 1..7 → ids 1..7; id 5 has no row of record
  const top5 = receipt({ boardId: "b5", boardType: "TOP_5" }, 5);
  const p = familyAndBoardPerformance({ ofRecord, receipts: [top10, top5, top10], bounds });
  assert.equal(p.family.WIN, 2); assert.equal(p.family.LOSS, 2); assert.equal(p.family.notDirectional, 1);
  assert.equal(p.top10.WIN, 2, "the duplicate receipt does not double count");
  assert.equal(p.top10.LOSS, 1); assert.equal(p.top10.VOID, 1); assert.equal(p.top10.PENDING, 1);
  assert.equal(p.top10.unjoined, 2, "id 5 on two copies of the Top-10 board: disclosed, never a loss");
  assert.equal(p.top10.notDirectional, 1);
  assert.equal(p.top5.WIN, 1); assert.equal(p.top5.LOSS, 1); assert.equal(p.top5.hitRate, 0.5);
  const empty = familyAndBoardPerformance({ ofRecord: [], receipts: [], bounds });
  assert.equal(empty.top5.hitRate, null, "no record, never 0–0");
  const late = receipt({ frozenAt: "2026-10-11T18:00:00Z" });
  assert.equal(familyAndBoardPerformance({ ofRecord, receipts: [late], bounds }).top10.invalidReceipts, 1);
  assert.equal(familyAndBoardPerformance({ ofRecord, receipts: [late], bounds }).top10.decided, 0, "a late board never counts");
});
