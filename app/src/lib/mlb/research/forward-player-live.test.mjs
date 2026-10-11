/**
 * Option A · live pregame capture of research forecasts (app/scripts/mlb/capture-mlb-forward-player-live.mjs).
 * Runs the real script on the committed 2026-10-07 slate (three games with posted lineups), with the clock fixed:
 *   - only games not yet started get a receipt; at or after the scheduled start the game is refused;
 *   - only captures that existed at the clock are used, and each input's sha256 matches the file;
 *   - receipts are write-once: a second run skips the game and leaves the bytes unchanged;
 *   - a fixed clock may write only into a test directory (a live receipt always uses the real clock).
 * Research only; nothing public reads these receipts.
 *
 * Run: npx tsx --test src/lib/mlb/research/forward-player-live.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const REPO = path.resolve(APP, "..");
const SCRIPT = "scripts/mlb/capture-mlb-forward-player-live.mjs";
const run = (args, env = {}) => spawnSync(process.execPath, [...process.execArgv.filter((a) => !a.startsWith("--test")), SCRIPT, ...args], { cwd: APP, env: { ...process.env, ...env }, encoding: "utf8", timeout: 240_000 });
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(path.join(REPO, f))).digest("hex");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fwd-live-"));
const DATE = "2026-10-07";
const BEFORE_FIRST = "2026-10-07T19:59:59Z"; // 849833 starts 20:00Z

let first = null;
test("before first pitch: receipts carry frozen models, hashed pregame inputs, lines, and are written once", () => {
  const r = run(["--date", DATE, "--write", "--now", BEFORE_FIRST, "--dump"], { GTP_FORWARD_LIVE_TEST_OUT_DIR: tmp });
  assert.equal(r.status, 0, r.stderr);
  const receipts = JSON.parse(r.stdout.trim().split("\n").pop());
  first = receipts;
  const g = receipts.find((x) => x.gamePk === 849833);
  assert.ok(g, "the 20:00Z game has a receipt one second before its start");
  assert.equal(g.evidenceClass, "LIVE_PREGAME_CAPTURE");
  assert.equal(g.generatedAt, "2026-10-07T19:59:59.000Z");
  for (const x of receipts) {
    assert.ok(Date.parse(x.generatedAt) < Date.parse(x.scheduledStart), "generated before the scheduled start");
    for (const k of ["lineup", "matchup"]) {
      assert.ok(Date.parse(x.inputs[k].capturedAt) <= Date.parse(x.generatedAt), `${k} captured by the clock`);
      assert.equal(x.inputs[k].sha256, sha(x.inputs[k].file), `${k} content hash`);
    }
    assert.equal(x.inputs.board.sha256, sha(x.inputs.board.file));
    assert.ok(x.inputs.boxScores.through < DATE, "state only from earlier dates");
    assert.equal(x.predictions.batters.length, 18);
    assert.equal(x.predictions.starters.length, 2);
    for (const b of x.predictions.batters) for (const m of ["engineSub", "engineB2"]) for (const pmf of Object.values(b[m])) assert.ok(Math.abs(pmf.reduce((a, v) => a + v, 0) - 1) < 1e-4);
    assert.equal(x.audit.invariantViolations, 0);
    const ids = new Set([...x.identities.lineups.away, ...x.identities.lineups.home].map((y) => y.playerId).concat([x.identities.starters.away, x.identities.starters.home]));
    assert.ok(x.postedLines.every((l) => ids.has(l.playerId)));
    const { receiptSha256, ...body } = x;
    assert.equal(receiptSha256, crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex"));
    assert.ok(fs.existsSync(path.join(tmp, DATE, `${x.gamePk}.json`)));
  }
});

test("write-once: a second run skips every captured game and leaves the bytes unchanged", () => {
  const before = Object.fromEntries(fs.readdirSync(path.join(tmp, DATE)).map((f) => [f, fs.readFileSync(path.join(tmp, DATE, f), "utf8")]));
  const r = run(["--date", DATE, "--write", "--now", BEFORE_FIRST], { GTP_FORWARD_LIVE_TEST_OUT_DIR: tmp });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`0 receipt\\(s\\) written; ${first.length} already captured`));
  for (const [f, s] of Object.entries(before)) assert.equal(fs.readFileSync(path.join(tmp, DATE, f), "utf8"), s);
});

test("at or after the scheduled start: refused, never backfilled", () => {
  const r = run(["--date", DATE, "--now", "2026-10-07T20:00:00Z", "--dump"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /849833:STARTED_OR_AT_START/);
  assert.ok(!JSON.parse(r.stdout.trim().split("\n").pop()).some((x) => x.gamePk === 849833));
});

test("a fixed clock can never write a real receipt", () => {
  const r = run(["--date", DATE, "--write", "--now", BEFORE_FIRST]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /REFUSED/);
});
