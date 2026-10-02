/**
 * Session 5 · B10 — the Suggested Parlays ladder never publishes a leg whose game has started.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { legHasNotStarted, slipHasNotStarted } from "./started-guard.mjs";

const starts = new Map([["g1", Date.parse("2026-09-27T17:05:00Z")], ["g2", Date.parse("2026-09-27T23:10:00Z")]]);

test("a leg is offered only while its game is still ahead; an unknown start fails closed", () => {
  const morning = Date.parse("2026-09-27T10:46:00Z");
  const afternoon = Date.parse("2026-09-27T19:00:00Z");
  assert.equal(legHasNotStarted({ gameId: "g1" }, starts, morning), true);
  assert.equal(legHasNotStarted({ gameId: "g1" }, starts, afternoon), false, "a 1:05 PM ET game has started by 3 PM ET");
  assert.equal(legHasNotStarted({ gameId: "g1" }, starts, Date.parse("2026-09-27T17:05:00Z")), false, "first pitch itself is started");
  assert.equal(legHasNotStarted({ gameId: "nope" }, starts, morning), false, "no known start ⇒ not offered");
  assert.equal(slipHasNotStarted({ legs: [{ gameId: "g1" }, { gameId: "g2" }] }, starts, afternoon), false, "one started leg sinks the card");
  assert.equal(slipHasNotStarted({ legs: [{ gameId: "g2" }] }, starts, afternoon), true);
  assert.equal(slipHasNotStarted({ legs: [] }, starts, morning), false);
});

test("WIRED: the ladder filters its pool by the guard before scoring, with starts from the board", () => {
  const src = fs.readFileSync("scripts/parlays/build-risk-ladder.mjs", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(src, /startByGameId\.set\(String\(r\.gameId\), start\)/);
  assert.match(src, /const notStarted = \(s\) => slipHasNotStarted\(s, startByGameId, nowMs\);/);
  const pool = src.indexOf("const pool = poolByTier[tier]");
  assert.ok(pool > 0 && src.indexOf(".filter(notStarted)", pool) > pool && src.indexOf(".filter(notStarted)", pool) < src.indexOf("if (!pool.length)", pool), "the guard is part of the pool filter");
});
