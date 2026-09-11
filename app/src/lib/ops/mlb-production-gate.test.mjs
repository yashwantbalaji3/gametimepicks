/**
 * MLB daily production buys odds at most once per ET day, and its tolerated failures are named (P258).
 *
 * 39 runs in 14 days (chain, backstop cron, recoveries) each bought team markets and player props again.
 * The heartbeat said "pass" whenever the build passed — even with simulations or predictions missing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WF = fs.readFileSync(path.join(process.cwd(), "..", ".github/workflows/mlb-daily-production.yml"), "utf8");
const step = (name) => { const i = WF.indexOf(`- name: ${name}`); assert.ok(i > 0, name); return WF.slice(i, WF.indexOf("\n      - name:", i + 10)); };

test("both paid ingests sit behind the once-a-day gate, judged on runs only", () => {
  const gate = step("Paid-run gate (once per ET day)");
  assert.match(gate, /paid-run-gate\.mjs --workflow mlb-daily-production\.yml --runs-only/, "a board always exists here, so the board signal must be ignored");
  assert.ok(WF.indexOf("Paid-run gate (once per ET day)") < WF.indexOf("3) Team markets ingest"), "the gate runs before the first paid call");
  for (const n of ["3) Team markets ingest", "4) Player props ingest"]) assert.match(step(n), /steps\.gate\.outputs\.run == 'true'/, `${n} is gated`);
});

test("the free completion steps still run every time", () => {
  for (const n of ["5) Game simulations", "5b) Full-game simulations", "5c) Predictions"]) assert.ok(!/steps\.gate/.test(step(n)), `${n} never waits on the paid gate`);
});

test("the heartbeat names every tolerated failure instead of saying pass", () => {
  const hb = step("7c) Ops heartbeat");
  for (const id of ["odds_team", "odds_props", "sims", "fullsims", "preds"]) assert.match(hb, new RegExp(`steps\\.${id}\\.outcome`), `${id} is inspected`);
  assert.match(hb, /ST=partial; MSG="slate built, but these steps failed:/);
});

test("the gate runner's --runs-only mode drops the board signal", () => {
  const runner = fs.readFileSync(path.join(process.cwd(), "scripts/ops/paid-run-gate.mjs"), "utf8");
  assert.match(runner, /newestBoardDate: runsOnly \? null : newestBoardDate\(\)/);
});
