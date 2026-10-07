/**
 * PREP · Stage 12 (NBA V1). Pins the rules, not today's numbers: the fixture is the real Oct 5 2026 preseason slate
 * (5 frozen receipts, 5 write-once finals, 5 captured box scores), rebuilt by __fixtures__/build-oct5-fixture.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRow } from "../../../forecast-ledger/contract.mjs";
import { composeLedger } from "../../../forecast-ledger/compose.mjs";
import { validateBoardReceipt } from "../../../products/top-board/top-board.mjs";
import { finalFor } from "../finals-record.mjs";
import { nbaReceiptGameRows, assertOneChampion, competitionOf, nbaSeasonOf } from "./ledger-rows.mjs";
import { nbaDayBoard, earliestHonestFreeze, NBA_BOARD_POOL } from "./top-boards.mjs";
import { frozenWinnerSide, headDisagreement, TOO_CLOSE } from "./winner-side.mjs";
import { NBA_V1_FAMILIES, producedFamilies } from "./families.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(fs.readFileSync(path.join(here, "__fixtures__", "oct5-day.json"), "utf8"));
const FILE = FX.source.forecasts;

const rowsFor = (g, opts = {}) => {
  const fin = finalFor(FX.finals, g.providerEventId);
  const canon = FX.finals.finals.find((f) => f.providerEventId === g.providerEventId)?.canonicalEventId ?? null;
  return nbaReceiptGameRows({ game: g, file: FILE, final: fin, canonicalEventId: canon, boxscore: FX.boxscores[g.providerEventId], winnerHead: "sim", ...opts });
};
const allRows = (opts) => FX.games.flatMap((g) => rowsFor(g, opts).rows);

test("every row is the ledger's own shape and passes the contract once marked PUBLISHED (fit proof)", () => {
  const rows = allRows({ publicationStatus: "PUBLISHED" });
  assert.ok(rows.length > 100);
  for (const r of rows) assert.deepEqual(validateRow(r), [], `${r.family} ${r.subjectId}`);
  // one row per (event, subject, family): the ledger never double counts
  assert.equal(new Set(rows.map((r) => r.forecastId)).size, rows.length);
});

test("SHADOW by default: the public ledger refuses NBA shadow rows instead of ingesting them", () => {
  const rows = allRows();
  assert.ok(rows.every((r) => r.publicationStatus === "SHADOW" && r.modelStatusAtPublish === "SHADOW"));
  assert.throws(() => composeLedger([{ source: "nba", rows }]), /not a public-ledger state/);
});

test("numbers are the receipt's frozen values; nothing is re-predicted", () => {
  const g = FX.games[0];
  const { rows } = rowsFor(g);
  const win = rows.find((r) => r.family === "nba_game_winner");
  assert.equal(win.probability, g.forecast.sim.pHome);
  assert.equal(win.publishedAt, g.receipt.generatedAt);
  assert.ok(win.receiptId.endsWith(g.receipt.payloadSha256));
  const p = g.forecast.players.home.find((x) => x.pts?.p50 != null);
  const pr = rows.find((r) => r.family === "nba_player_points" && r.subjectId === String(p.providerAthleteId));
  assert.deepEqual([pr.projection, pr.rangeLow, pr.rangeHigh, pr.rangeCoverage], [p.pts.p50, p.pts.p10, p.pts.p90, 0.8]);
});

test("a v0 receipt froze no side: winner rows get Brier/log loss, never a W/L and never an inferred side", () => {
  for (const r of allRows().filter((x) => x.family === "nba_game_winner")) {
    assert.equal(r.categoryPrediction, null);
    assert.equal(r.measurement.directionalResult, null);
    assert.equal(r.settlement.state, "SETTLED");
    assert.ok(typeof r.measurement.brier === "number");
  }
});

test("a receipt that froze a side is graded on that side only", () => {
  const g = structuredClone(FX.games[0]); // MEM @ ATL, ATL lost 123–132
  g.forecast.publishedSide = "HOME";
  const win = rowsFor(g).rows.find((r) => r.family === "nba_game_winner");
  assert.equal(win.categoryPrediction, "HOME");
  assert.equal(win.measurement.directionalResult, "LOSS");
  g.forecast.publishedSide = TOO_CLOSE;
  const tc = rowsFor(g).rows.find((r) => r.family === "nba_game_winner");
  assert.equal(tc.categoryPrediction, TOO_CLOSE);
  assert.equal(tc.measurement.directionalResult, null);
});

test("player outcome words: DNP and not-in-box-score are VOID, missing box score is PENDING, never zero or a loss", () => {
  const g = FX.games[0];
  const rows = rowsFor(g).rows.filter((r) => r.subjectType === "PLAYER");
  const states = new Set(rows.map((r) => r.settlement.state));
  assert.ok(states.has("SETTLED"));
  for (const r of rows.filter((x) => x.settlement.state === "VOID")) {
    assert.ok(["DNP", "NOT_IN_BOXSCORE"].includes(r.settlement.reason));
    assert.equal(r.settlement.finalValue, null);
    assert.equal(r.measurement.absoluteError, null);
  }
  const noBox = nbaReceiptGameRows({ game: g, file: FILE, final: finalFor(FX.finals, g.providerEventId), boxscore: null, winnerHead: "sim" });
  for (const r of noBox.rows.filter((x) => x.subjectType === "PLAYER")) {
    assert.equal(r.settlement.state, "PENDING");
    assert.equal(r.settlement.reason, "BOXSCORE_NOT_CAPTURED");
  }
});

test("a game the finals record does not hold is PENDING for every family", () => {
  const g = FX.games[0];
  const { rows } = nbaReceiptGameRows({ game: g, file: FILE, final: finalFor({ finals: [] }, g.providerEventId), boxscore: FX.boxscores[g.providerEventId], winnerHead: "sim" });
  assert.ok(rows.every((r) => r.settlement.state === "PENDING" && r.measurement.directionalResult == null && r.measurement.absoluteError == null && r.measurement.brier == null));
});

test("preseason is its own competition; the season label follows the tip", () => {
  assert.equal(competitionOf(1), "NBA_PRESEASON");
  assert.equal(competitionOf(2), "NBA");
  assert.equal(nbaSeasonOf("2026-10-20T23:00Z"), "2026-27");
  assert.equal(nbaSeasonOf("2027-06-10T00:30Z"), "2026-27");
  assert.ok(allRows().every((r) => r.competition === "NBA_PRESEASON"));
});

test("a receipt written at or after tip is refused, never ledgered", () => {
  const g = structuredClone(FX.games[0]);
  g.receipt.generatedAt = g.dateUtc.replace("Z", ":00Z");
  assert.throws(() => rowsFor(g), /not before tip/);
});

test("one champion per question: two model families for the same game are refused", () => {
  const a = FX.games[0];
  const b = structuredClone(a);
  b.receipt.family = "v0.1";
  assert.throws(() => assertOneChampion([a, b]), /two model families/);
  assert.doesNotThrow(() => assertOneChampion(FX.games));
});

test("combination families are declared but never produced from marginal medians", () => {
  const combos = NBA_V1_FAMILIES.filter((f) => Array.isArray(f.stat));
  assert.equal(combos.length, 3);
  assert.ok(combos.every((f) => f.source === null));
  assert.ok(!allRows().some((r) => combos.some((c) => c.family === r.family)));
  const { receipt, refused } = nbaDayBoard({ games: FX.games, scopeDate: "2026-10-05", frozenAt: "2026-10-05T16:00:00Z", family: "nba_player_pra", boardType: "TOP_10" });
  assert.equal(receipt, null);
  assert.match(refused, /joint/);
  assert.equal(producedFamilies().length, 8);
});

test("the day board is a valid Stage 5 receipt and every member joins a ledger row", () => {
  const frozenAt = "2026-10-05T16:00:00Z"; // after both receipt runs (15:31Z, 15:48Z), before the first tip (23:00Z)
  const ledgerIds = new Set(allRows().map((r) => r.forecastId));
  for (const family of ["nba_player_points", "nba_player_rebounds", "nba_player_assists", "nba_player_threes"]) {
    for (const boardType of ["TOP_10", "TOP_5"]) {
      const { receipt, notOnBoard } = nbaDayBoard({ games: FX.games, scopeDate: "2026-10-05", frozenAt, family, boardType });
      assert.deepEqual(validateBoardReceipt(receipt), [], `${family} ${boardType}`);
      assert.equal(notOnBoard.length, 0);
      assert.equal(receipt.selectorStatus, "SHADOW");
      assert.ok(receipt.rows.length <= (boardType === "TOP_10" ? 10 : 5));
      for (const m of receipt.rows) assert.ok(ledgerIds.has(m.ledgerForecastId), `${family} member ${m.subjectId} joins the ledger`);
      const values = receipt.rows.map((m) => m.metricValue);
      assert.deepEqual(values, [...values].sort((a, b) => b - a));
    }
  }
});

test("board membership is frozen: late receipts and started games stay off and are disclosed", () => {
  const early = nbaDayBoard({ games: FX.games, scopeDate: "2026-10-05", frozenAt: "2026-10-05T15:40:00Z", family: "nba_player_points", boardType: "TOP_10" });
  assert.deepEqual(early.notOnBoard.map((n) => n.reason).sort(), ["RECEIPT_AFTER_FREEZE", "RECEIPT_AFTER_FREEZE"]);
  assert.ok(early.receipt.rows.every((m) => !["401914102", "401898716"].includes(m.eventId)));
  const late = nbaDayBoard({ games: FX.games, scopeDate: "2026-10-05", frozenAt: "2026-10-05T23:30:00Z", family: "nba_player_points", boardType: "TOP_10" });
  assert.equal(late.notOnBoard.filter((n) => n.reason === "STARTED_BEFORE_FREEZE").length, 3);
  assert.deepEqual(validateBoardReceipt(late.receipt), []);
});

test("the pool excludes ruled-out and low-minute players and counts them", () => {
  const { receipt } = nbaDayBoard({ games: FX.games, scopeDate: "2026-10-05", frozenAt: "2026-10-05T16:00:00Z", family: "nba_player_points", boardType: "TOP_10" });
  assert.ok(receipt.ineligibleCount > 0);
  const byId = new Map(FX.games.flatMap((g) => [...g.forecast.players.home, ...g.forecast.players.away]).map((p) => [String(p.providerAthleteId), p]));
  for (const m of receipt.rows) {
    const p = byId.get(m.subjectId);
    assert.ok(p.expectedMinutes >= NBA_BOARD_POOL.minExpectedMinutes && p.availability !== "out");
  }
});

test("one model per board", () => {
  const mixed = structuredClone(FX.games);
  mixed[1].receipt.family = "v0.1";
  const { receipt, refused } = nbaDayBoard({ games: mixed, scopeDate: "2026-10-05", frozenAt: "2026-10-05T16:00:00Z", family: "nba_player_points", boardType: "TOP_5" });
  assert.equal(receipt, null);
  assert.match(refused, /one model/);
});

test("the earliest honest freeze is when every evening game is owed, and only if that is before the first tip", () => {
  assert.equal(earliestHonestFreeze(FX.games), "2026-10-05T18:00:00.000Z"); // last tip 02:00Z − 8 h, before 23:00Z
  assert.equal(earliestHonestFreeze([{ dateUtc: "2026-10-05T16:00Z" }, { dateUtc: "2026-10-06T03:00Z" }]), null);
  assert.equal(earliestHonestFreeze([{ dateUtc: "2026-10-09T12:00Z" }]), null); // overnight tips are a separate scope
});

test("winner side: the head is a required decision, the threshold is never invented", () => {
  assert.throws(() => frozenWinnerSide({ sim: { pHome: 0.6 } }, {}), /founder decision/);
  assert.equal(frozenWinnerSide({ sim: { pHome: 0.6 } }, { head: "sim" }).publishedSide, "HOME");
  assert.equal(frozenWinnerSide({ elo: { pHome: 0.4 } }, { head: "elo" }).publishedSide, "AWAY");
  assert.equal(frozenWinnerSide({ sim: { pHome: 0.5 } }, { head: "sim" }).publishedSide, TOO_CLOSE);
  assert.equal(frozenWinnerSide({ sim: { pHome: 0.49 } }, { head: "sim" }).publishedSide, "AWAY"); // no 50% rule
  assert.equal(frozenWinnerSide({ sim: {} }, { head: "sim" }).publishedSide, null);
});

test("the two frozen heads disagree on real receipts (evidence for the head decision)", () => {
  const d = headDisagreement(FX.games);
  assert.equal(d.compared, 5);
  assert.ok(d.disagree >= 1);
});

test("the roster-gated v0.1 receipts fit the same adapter, and miss far fewer players than v0 (champion evidence)", () => {
  const missRate = (games) => {
    let n = 0, miss = 0;
    for (const g of games) {
      const rows = nbaReceiptGameRows({ game: g, file: "fixture", final: finalFor(FX.finals, g.providerEventId), boxscore: FX.boxscores[g.providerEventId], winnerHead: "elo", publicationStatus: "PUBLISHED" })
        .rows.filter((r) => r.family === "nba_player_points");
      for (const r of rows) { assert.deepEqual(validateRow(r), []); n += 1; if (r.settlement.state === "VOID") miss += 1; }
    }
    return miss / n;
  };
  assert.ok(FX.gamesV01.every((g) => g.receipt.family === "v0.1"));
  const v0 = missRate(FX.games), v01 = missRate(FX.gamesV01);
  assert.ok(v01 < v0 / 2, `v0.1 availability misses ${v01} vs v0 ${v0}`);
});
