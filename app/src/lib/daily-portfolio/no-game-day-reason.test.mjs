/**
 * SESSION 5 · D3 — a no-MLB-game day is a truthful no-card state, not "missing input".
 * On an off day no slate file is written; the day's StatsAPI season state (captured on that ET day) establishes it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { poolAvailability, emptyPoolReason, POOL_STATUS } from "./input-availability.mjs";

const rootWith = (season) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-pool-"));
  fs.mkdirSync(path.join(root, "mlb"), { recursive: true });
  if (season) fs.writeFileSync(path.join(root, "mlb", "season-state.json"), JSON.stringify(season));
  return root;
};
const D = "2026-10-02";
const NOW = "2026-10-02T16:00:00Z";
const POST_OFF = { date: D, generatedAt: "2026-10-02T11:00:00Z", state: "POSTSEASON", gamesToday: 0, remaining: 41, nextGameDate: "2026-10-03", reason: "postseason — 41 game(s) still to be played from 2026-10-02, none today" };

test("a postseason off day, established on the day, is NO_EVENTS with its own sentence", () => {
  const a = poolAvailability(rootWith(POST_OFF), D, NOW);
  assert.equal(a.status, POOL_STATUS.NO_EVENTS);
  assert.equal(emptyPoolReason(a.status, D, a.reason), "no MLB games are scheduled for 2026-10-02 — a postseason off day (41 postseason game(s) still to be played, next on 2026-10-03)");
});

test("off-season is NO_EVENTS naming the season", () => {
  const a = poolAvailability(rootWith({ ...POST_OFF, state: "OFF_SEASON", gamesToday: 0, remaining: 0, reason: "the 2026 season is over — StatsAPI lists no game left to play on or after 2026-10-02" }), D, NOW);
  assert.equal(a.status, POOL_STATUS.NO_EVENTS);
  assert.match(a.reason, /^MLB is out of season — the 2026 season is over/);
});

test("anything less stays INPUTS_MISSING — the old sentence, never a guessed off day", () => {
  for (const season of [null, { ...POST_OFF, gamesToday: 3 }, { ...POST_OFF, date: "2026-10-01" }, { ...POST_OFF, generatedAt: "2026-10-02T02:00:00Z" }, { ...POST_OFF, generatedAt: "2026-10-02T18:00:00Z" }, { ...POST_OFF, state: "UNKNOWN" }, { ...POST_OFF, state: "REGULAR_SEASON", gamesToday: null }]) {
    const a = poolAvailability(rootWith(season), D, NOW);
    assert.equal(a.status, POOL_STATUS.INPUTS_MISSING, JSON.stringify(season));
    assert.match(emptyPoolReason(a.status, D, a.reason), /missing input/);
  }
});

test("a slate file always outranks the season state", () => {
  const root = rootWith({ ...POST_OFF, state: "OFF_SEASON" });
  fs.mkdirSync(path.join(root, "mlb", "boards"), { recursive: true });
  fs.writeFileSync(path.join(root, "mlb", "boards", `${D}.json`), JSON.stringify({ games: [{ id: 1 }] }));
  assert.equal(poolAvailability(root, D, NOW).status, POOL_STATUS.PRICED);
});

test("the generator passes its clock and the reason through (accounting.ts)", () => {
  const src = fs.readFileSync("src/lib/daily-portfolio/accounting.ts", "utf8");
  assert.match(src, /poolAvailability\(root, date, nowIso\)/);
  assert.match(src, /emptyPoolReason\(availability\.status, date, availability\.reason \?\? null\)/);
  const wf = fs.readFileSync("../.github/workflows/daily-products.yml", "utf8");
  const v = wf.slice(wf.indexOf("- name: Validate the artifact before publishing"));
  assert.match(v.split("\n").slice(0, 4).join("\n"), /github\.event\.inputs\.dry_run != 'true'/, "a dry run writes no portfolio — nothing of today's to validate");
});
