/**
 * Checks 7 / 14: the V2 card's delayed/stale line uses the production freshness bands (lib/live/freshness.mjs) and
 * appears only for in-play events; it is never an aria-live announcement.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { freshnessLine, LIVE_V2_STATUS } from "./event-view.mjs";
import { FRESH_MAX_MS, DELAYED_MAX_MS } from "../freshness.mjs";
import { eventFromNflRoster } from "./from-envelope.mjs";

const T = "2026-10-16T01:00:00Z", t0 = Date.parse(T);
const ev = (status, fetchedAt = T) => ({ status, fetchedAt });

test("bands at their edges: fresh says nothing; delayed from 45 s; stale from 120 s", () => {
  assert.equal(freshnessLine(ev(LIVE_V2_STATUS.LIVE), t0 + FRESH_MAX_MS - 100), null);
  assert.equal(freshnessLine(ev(LIVE_V2_STATUS.LIVE), t0 + FRESH_MAX_MS).level, "DELAYED");
  assert.match(freshnessLine(ev(LIVE_V2_STATUS.LIVE), t0 + 60_000).text, /^Delayed · last confirmed \d{1,2}:\d{2}:\d{2} (AM|PM) ET$/);
  assert.equal(freshnessLine(ev(LIVE_V2_STATUS.DELAYED), t0 + DELAYED_MAX_MS).level, "STALE");
  assert.match(freshnessLine(ev(LIVE_V2_STATUS.LIVE), t0 + 600_000).text, /^Feed stale · showing last known state from /);
});

test("only in-play events: pregame and finals are never 'stale'; an unparseable fetch time is the worst case", () => {
  assert.equal(freshnessLine(ev(LIVE_V2_STATUS.PREGAME), t0 + 3_600_000), null);
  assert.equal(freshnessLine(ev(LIVE_V2_STATUS.FINAL_PROVISIONAL), t0 + 3_600_000), null);
  assert.equal(freshnessLine(ev(LIVE_V2_STATUS.LIVE, "not a time"), t0).level, "STALE");
});

test("the envelope's fetchedAt travels on the V2 event, and the board renders the line without aria-live", () => {
  const e = eventFromNflRoster({ providerEventId: "1", awayAbbr: "SEA", homeAbbr: "DEN" }, { state: "LIVE", fetchedAt: T, competitors: {} });
  assert.equal(e.fetchedAt, T);
  const board = fs.readFileSync(path.join(process.cwd(), "src/components/live/v2/live-v2-board.tsx"), "utf8");
  assert.match(board, /freshnessLine\(\{ status, fetchedAt: e\.fetchedAt \}, Date\.now\(\)\)/);
  assert.doesNotMatch(board, /aria-live/, "no per-poll announcement (check 15)");
});
