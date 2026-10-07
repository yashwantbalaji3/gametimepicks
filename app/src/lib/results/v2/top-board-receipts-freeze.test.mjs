/**
 * Stage 7.0 — the daily freezer also writes Product Engine `top-board-receipt@0` receipts (TOP_10 + TOP_5 per
 * eligible family) from the SAME ranked pool, at the SAME instant, as the public Top-5 file. Fixtures only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { validateBoardReceipt, familyAndBoardPerformance, OUTCOME } from "../../products/top-board/top-board.mjs";
import { receiptsFromNflFrozenDay } from "../../products/top-board/from-nfl-frozen-day.mjs";

const SCRIPT = path.join(process.cwd(), "scripts/results/freeze-daily-top-boards.mjs");
const { freezeDay, freezeReceipts } = await import(SCRIPT);

const fam = (state) => ({ label: "L", state, ...(state === "PUBLISHED" ? { basis: "b" } : { reason: "why" }), model: "m-v1" });
const KO = "2031-10-05T17:00Z";
const FROZEN = "2031-10-05T12:00:00Z";
const availability = { injuriesCapturedAt: "2031-10-05T11:00:00Z", injuries: "FRESH", rosters: "FRESH" };
const player = (i, participation = "AVAILABLE_ROLE_UNCERTAIN") => ({
  playerId: `nfl-athlete-${i}`, name: `P${i}`, team: "AAA", participation,
  markets: { player_receptions: { median: 20 - i, mean: 20 - i, p10: 1, p90: 30 }, anytime_td: { probability: 0.9 - i / 50 } },
});
const board = (players, families = { player_receptions: fam("PUBLISHED"), anytime_td: fam("PUBLISHED"), player_pass_yds: fam("ESTIMATE") }) =>
  ({ providerEventId: "77", matchup: "AAA @ BBB", kickoffUtc: KO, generatedAt: "2031-10-05T10:00:00Z", availability, families, players });
const noPrices = { slotFor: () => ({ pricingState: "NOT_PROBED" }) };
const day = "2031-10-05";

test("one TOP_10 and one TOP_5 receipt per eligible family; every receipt validates against the 5A schema", () => {
  const rs = freezeReceipts(day, [board(Array.from({ length: 14 }, (_, i) => player(i)))], FROZEN);
  assert.deepEqual(rs.map((r) => r.boardId).sort(), [
    "nfl:anytime_td:2031-10-05:TOP_10", "nfl:anytime_td:2031-10-05:TOP_5",
    "nfl:player_receptions:2031-10-05:TOP_10", "nfl:player_receptions:2031-10-05:TOP_5",
  ]);
  for (const r of rs) assert.deepEqual(validateBoardReceipt(r), [], r.boardId);
  const top10 = rs.find((r) => r.boardId.endsWith("player_receptions:2031-10-05:TOP_10"));
  assert.equal(top10.rows.length, 10);
  // Founder Q9 DISPLAY: every board is a ranked display, never ADOPTED (no product grant).
  assert.ok(rs.every((r) => r.selectorStatus === "PUBLIC_RANKED_FORECAST" && !("adoptionRef" in r)));
  assert.ok(rs.every((r) => r.modelVersion === null && r.generation === null && r.rows.every((x) => x.frozenSide === null)));
});

test("ESTIMATE families get no receipt (never ranked), same as the public Top-5", () => {
  const rs = freezeReceipts(day, [board([player(1)])], FROZEN);
  assert.equal(rs.some((r) => r.family === "player_pass_yds"), false);
});

test("the TOP_5 receipt is exactly the public Top-5 file, and TOP_10's first five are the same players", () => {
  const boards = [board(Array.from({ length: 12 }, (_, i) => player(i, i === 2 ? "INACTIVE" : "AVAILABLE_ROLE_UNCERTAIN")))];
  const pub = freezeDay(day, boards, FROZEN, noPrices);
  const viaAdapter = receiptsFromNflFrozenDay(pub);
  const rs = freezeReceipts(day, boards, FROZEN);
  for (const family of ["player_receptions", "anytime_td"]) {
    const top5 = rs.find((r) => r.family === family && r.boardType === "TOP_5");
    const top10 = rs.find((r) => r.family === family && r.boardType === "TOP_10");
    const adapted = viaAdapter.find((r) => r.family === family);
    assert.deepEqual(top5.rows.map((r) => r.ledgerForecastId), adapted.rows.map((r) => r.ledgerForecastId), family);
    assert.deepEqual(top10.rows.slice(0, 5).map((r) => r.ledgerForecastId), top5.rows.map((r) => r.ledgerForecastId), family);
    assert.equal(top10.rows.some((r) => r.subjectId === "nfl-athlete-2"), false, "an inactive player never ranks");
  }
});

test("a maximum, not a quota: three eligible players freeze three rows on both receipts", () => {
  const rs = freezeReceipts(day, [board([player(1), player(2), player(3)])], FROZEN);
  for (const r of rs) assert.equal(r.rows.length, 3, r.boardId);
});

test("a freeze at or after kickoff is refused, never written", () => {
  assert.throws(() => freezeReceipts(day, [board([player(1)])], KO.replace("Z", ":00Z")), /REFUSED/);
});

test("Top-10 and Top-5 records from the receipts: a Top-5 receipt never stands in for ranks 6-10", () => {
  const rs = freezeReceipts(day, [board(Array.from({ length: 12 }, (_, i) => player(i)))], FROZEN).filter((r) => r.family === "player_receptions");
  const ofRecord = rs.find((r) => r.boardType === "TOP_10").rows.map((r, i) => ({ ledgerForecastId: r.ledgerForecastId, eventStartUtc: KO, outcome: i % 2 ? OUTCOME.LOSS : OUTCOME.WIN, directional: true }));
  const bounds = { from: null, to: "2031-10-06" };
  const both = familyAndBoardPerformance({ ofRecord, receipts: rs, bounds });
  assert.equal(both.top10.decided, 10);
  assert.equal(both.top5.decided, 5);
  const onlyTop5 = familyAndBoardPerformance({ ofRecord, receipts: rs.filter((r) => r.boardType === "TOP_5"), bounds });
  assert.equal(onlyTop5.top10.decided, 0);
  assert.equal(onlyTop5.top10.hitRate, null);
});

test("write-once on disk: a second run leaves an existing receipt file byte-identical", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "receipts-"));
  const appDir = path.join(dir, "app");
  fs.mkdirSync(path.join(appDir, "public/data/nfl/player-board"), { recursive: true });
  const ko = new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 16) + "Z";
  const b = { ...board([player(1), player(2)]), kickoffUtc: ko, availability: { injuriesCapturedAt: new Date().toISOString(), injuries: "FRESH", rosters: "FRESH" } };
  fs.writeFileSync(path.join(appDir, "public/data/nfl/player-board/77.json"), JSON.stringify(b));
  const run = () => execFileSync(process.execPath, [SCRIPT, "--now", new Date().toISOString()], { cwd: appDir }).toString();
  run();
  const rdir = path.join(dir, "data/internal/results/top-board-receipts");
  const [file] = fs.readdirSync(rdir);
  const before = fs.readFileSync(path.join(rdir, file), "utf8");
  assert.match(run(), /already frozen/);
  assert.equal(fs.readFileSync(path.join(rdir, file), "utf8"), before);
  const doc = JSON.parse(before);
  assert.equal(doc.dataClass, "PRIVATE");
  assert.equal(doc.receipts.length, 4);
});
