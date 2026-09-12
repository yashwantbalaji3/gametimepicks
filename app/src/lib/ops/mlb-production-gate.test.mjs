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

/**
 * P264 · A TOLERATED STEP MUST STILL REPORT WHAT HAPPENED.
 *
 * The heartbeat names a tolerated failure by reading `steps.<id>.outcome`. That only works if the
 * step's own shell exits non-zero when the work fails. Both PAID ingests had `continue-on-error: true`
 * AND a trailing `|| echo`, so their shell exited 0, their outcome was always "success", and the
 * report added the day before could never have named them — a guard that reads a value nothing can
 * set. `continue-on-error` is what makes the step non-blocking; the exit status is what makes it true.
 */
test("no step the heartbeat inspects swallows its own failure", () => {
  for (const id of ["odds_team", "odds_props", "sims", "fullsims", "preds"]) {
    const at = WF.indexOf(`id: ${id}`);
    assert.ok(at > 0, `step ${id} exists`);
    const body = WF.slice(at, WF.indexOf("\n      - name:", at + 10));
    const swallow = body.split("\n").filter((l) => /\.mjs/.test(l) && /\|\|\s*(true|echo\b)/.test(l));
    assert.deepEqual(swallow, [], `${id}: its outcome cannot be true while it swallows — ${swallow.join(" / ")}`);
  }
});

test("the paid ingests stay non-blocking, and say why they failed", () => {
  for (const id of ["odds_team", "odds_props"]) {
    const at = WF.indexOf(`id: ${id}`);
    const body = WF.slice(at, WF.indexOf("\n      - name:", at + 10));
    assert.match(body, /continue-on-error: true/, `${id} must not block the slate`);
    assert.match(body, /::warning::/, `${id} must explain a failure`);
    assert.match(body, /exit 1/, `${id} must still fail its own step`);
    assert.match(body, /ODDS_API_KEY/, `${id} keeps its honest no-op when the key is absent`);
  }
});
