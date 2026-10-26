/**
 * The NFL player board ↔ forecast-of-record link (Release J, 2026-10-26). After Release J an unchanged forecast no
 * longer writes a revision every event window, so the receipt keeps its generatedAt while each window refreshes the
 * board. The audit compared the two TIMES and failed main on 401873009 and 401873022 the first windows after release.
 * The board now names the record it was published beside (forecastInputHash); older boards are held to "not older".
 * Run: npx tsx --test src/lib/consistency/board-record-link.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { boardInputRefs } from "./official-snapshot.mjs";

const same = ({ inputRef, expectedInputRef }) => inputRef === expectedInputRef;
const record = { generatedAt: "2026-10-25T22:36:17Z", model: { inputHash: "b7a401e2db3709d1" } };

test("a board naming the record's inputHash agrees, however much later it was refreshed", () => {
  assert.ok(same(boardInputRefs({ sourceGeneratedAt: "2026-10-25T23:53:49Z", forecastInputHash: "b7a401e2db3709d1" }, record)));
});

test("…and a board left behind by a REAL revision still fails, whatever its times say", () => {
  const revised = { generatedAt: "2026-10-25T22:36:17Z", model: { inputHash: "ffff000011112222" } };
  assert.ok(!same(boardInputRefs({ sourceGeneratedAt: "2026-10-25T23:53:49Z", forecastInputHash: "b7a401e2db3709d1" }, revised)));
  assert.ok(!same(boardInputRefs({ sourceGeneratedAt: "2026-10-25T23:53:49Z", forecastInputHash: null }, record)), "a board published with no forecast is not a match");
});

test("a board from before the link: refreshed after the record agrees; built BEFORE the record's last change fails", () => {
  assert.ok(same(boardInputRefs({ sourceGeneratedAt: "2026-10-25T23:53:49Z" }, record)), "newer source, unchanged record");
  assert.ok(same(boardInputRefs({ sourceGeneratedAt: "2026-10-25T22:36:17Z" }, record)), "same window");
  assert.ok(!same(boardInputRefs({ sourceGeneratedAt: "2026-10-25T22:36:11Z" }, record)), "six seconds older than the record: stale (the 401873011 shape)");
  assert.ok(!same(boardInputRefs({}, record)), "no source time is never a match");
});

test("the board builder writes the link from this window's published forecasts", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/build-nfl-player-board.mjs"), "utf8");
  assert.match(src, /public\/data\/nfl\/forecasts\/latest\.json/);
  assert.match(src, /forecastInputHash: forecastHashOf\.get\(/);
  /* …and runs AFTER the forecasts in the event window, so "this window's" is true. */
  const wf = fs.readFileSync(path.join(process.cwd(), "..", ".github/workflows/nfl-event-window.yml"), "utf8");
  assert.ok(wf.indexOf("build-nfl-public-forecasts.mjs") < wf.indexOf("build-nfl-player-board.mjs"), "forecasts are built before boards");
});
