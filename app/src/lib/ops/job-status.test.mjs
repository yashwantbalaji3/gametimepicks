/**
 * A JOB'S COMPLETION IS A RECEIPT, NOT A STRING IN ITS LOG — Program 235 · Release B.
 *
 * Run: npx tsx --test src/lib/ops/job-status.test.mjs
 *
 * Program 234's leaked watcher is the specification here. It waited on a marker that was echoed to
 * the command's stdout and never reached the file it grepped; the job had already finished; and the
 * harness's foreground timeout stopped applying once the loop was backgrounded. Every assertion
 * below is one of those three failures made impossible.
 *
 * The classifier is pure and the poll bound takes an injected clock, so the timeout cases are proven
 * in microseconds. Nothing here waits out a real deadline — the shell wrapper's integration test
 * does that once, with a two-second bound.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

import { classifyJob, readReceipt, shouldKeepWaiting, JOB_STATUS, STATUS_EXIT, TIMEOUT_EXIT_CODE } from "./job-status.mjs";

const APP = process.cwd();
const RUNNER = path.join(APP, "scripts/ops/run-job.sh");

/* ── the classifier ────────────────────────────────────────────────────────────────────────── */

test("a fast success is SUCCESS", () => {
  const r = classifyJob({ exitCode: 0, startedMs: 1000, endedMs: 3000 });
  assert.equal(r.status, JOB_STATUS.SUCCESS);
  assert.equal(r.elapsedSecs, 2);
});

test("an immediate failure is FAILURE and carries the real code", () => {
  const r = classifyJob({ exitCode: 3 });
  assert.equal(r.status, JOB_STATUS.FAILURE);
  assert.match(r.reason, /exited 3/);
});

test("A LOST CHILD IS UNKNOWN, NEVER SUCCESS", () => {
  /* spawnSync returns a null status when the process could not be run or its result could not be
     collected. Defaulting that to 0 is how a job that never executed reports as passing. */
  for (const exitCode of [null, undefined]) {
    const r = classifyJob({ exitCode });
    assert.equal(r.status, JOB_STATUS.UNKNOWN, `exitCode=${exitCode} was not UNKNOWN`);
    assert.notEqual(r.status, JOB_STATUS.SUCCESS);
  }
});

test("a timeout is TIMEOUT and says the process was killed rather than left running", () => {
  const r = classifyJob({ exitCode: TIMEOUT_EXIT_CODE, deadlineSecs: 1800 });
  assert.equal(r.status, JOB_STATUS.TIMEOUT);
  assert.match(r.reason, /1800s deadline/);
  assert.match(r.reason, /killed, not left running/);
});

test("AN INTERRUPTED PARENT IS CANCELLED, not a failure of the thing under test", () => {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    assert.equal(classifyJob({ exitCode: 130, signal }).status, JOB_STATUS.CANCELLED);
  }
});

test("every status has a distinct exit code, and only success is zero", () => {
  const codes = Object.values(STATUS_EXIT);
  assert.equal(new Set(codes).size, codes.length, "two statuses share an exit code");
  assert.equal(STATUS_EXIT.SUCCESS, 0);
  for (const [k, v] of Object.entries(STATUS_EXIT)) if (k !== "SUCCESS") assert.notEqual(v, 0, `${k} exits 0`);
});

/* ── the receipt ───────────────────────────────────────────────────────────────────────────── */

test("NO RECEIPT MEANS NOT FINISHED — the P234 wait had nothing to read and waited forever", () => {
  const r = readReceipt(null);
  assert.equal(r.finished, false);
  assert.equal(r.status, JOB_STATUS.UNKNOWN);
});

test("A MALFORMED STATUS IS NOT A FINISHED JOB", () => {
  for (const bad of [{ status: "DONE" }, { status: "" }, { status: 7 }, {}]) {
    const r = readReceipt(bad);
    assert.equal(r.finished, false, `${JSON.stringify(bad)} was treated as terminal`);
  }
});

test("a well-formed receipt is finished and carries its status", () => {
  const r = readReceipt({ status: "FAILURE", reason: "exited 2" });
  assert.equal(r.finished, true);
  assert.equal(r.status, JOB_STATUS.FAILURE);
});

test("A TERMINAL RUN THAT FINISHED BEFORE MONITORING BEGAN IS SEEN IMMEDIATELY", () => {
  /* The other half of P234's failure: the job was already done. A poller that reads a receipt
     rather than tailing a log finds it on its first look. */
  const r = readReceipt({ status: "SUCCESS", reason: "exited 0" });
  assert.equal(r.finished, true);
  assert.equal(r.status, JOB_STATUS.SUCCESS);
});

/* ── the bound ─────────────────────────────────────────────────────────────────────────────── */

test("THE DEADLINE IS PROVEN WITH AN INJECTED CLOCK, not by waiting", () => {
  const startedMs = 1_000_000;
  assert.equal(shouldKeepWaiting({ startedMs, nowMs: startedMs + 10_000, deadlineSecs: 60 }), true);
  assert.equal(shouldKeepWaiting({ startedMs, nowMs: startedMs + 60_000, deadlineSecs: 60 }), false, "the bound must close AT the deadline");
  assert.equal(shouldKeepWaiting({ startedMs, nowMs: startedMs + 600_000, deadlineSecs: 60 }), false);
});

test("an absent or nonsensical deadline does not mean wait forever", () => {
  const startedMs = 1_000_000;
  for (const deadlineSecs of [undefined, null, 0, -5, NaN]) {
    assert.equal(
      shouldKeepWaiting({ startedMs, nowMs: startedMs + 1000, deadlineSecs }),
      false,
      `deadlineSecs=${deadlineSecs} kept the poller waiting — the P234 loop had no bound at all`,
    );
  }
});

/* ── the wrapper, exercised for real on short commands ─────────────────────────────────────── */

const runJob = (name, args, extra = []) =>
  spawnSync("bash", [RUNNER, name, "--deadline", "10", ...extra, "--", ...args], { cwd: APP, encoding: "utf8" });

const receiptFor = (name) => {
  const p = path.join(os.tmpdir(), "gtp-jobs", `${name}.json`);
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
};

test("LIVE · the wrapper captures a real exit code and writes a receipt for it", () => {
  const r = runJob("t-success", ["bash", "-c", "echo ok; exit 0"]);
  assert.equal(r.status, STATUS_EXIT.SUCCESS, r.stderr);
  const rec = receiptFor("t-success");
  assert.ok(rec, "no receipt was written");
  assert.equal(rec.status, "SUCCESS");
  assert.equal(rec.exitCode, 0);
  assert.equal(readReceipt(rec).finished, true);
});

test("LIVE · a failing command's real code reaches the receipt", () => {
  const r = runJob("t-fail", ["bash", "-c", "exit 42"]);
  assert.equal(r.status, STATUS_EXIT.FAILURE);
  const rec = receiptFor("t-fail");
  assert.equal(rec.exitCode, 42, "the wrapper reported a code the command did not return");
  assert.equal(rec.status, "FAILURE");
});

test("LIVE · A LOG SAYING 'success' CANNOT INVENT ONE", () => {
  /* The precise inversion of the P234 design: the completion signal is the receipt, so a log full
     of the word success beneath a non-zero exit is still a failure. */
  const r = runJob("t-liar", ["bash", "-c", "echo 'SUCCESS! everything passed'; exit 1"]);
  assert.equal(r.status, STATUS_EXIT.FAILURE);
  const rec = receiptFor("t-liar");
  assert.equal(rec.status, "FAILURE");
  assert.match(fs.readFileSync(rec.log, "utf8"), /SUCCESS/, "the log does contain the word");
});

test("LIVE · A MISSING LOG DOES NOT HIDE A TERMINAL STATUS", () => {
  runJob("t-nolog", ["bash", "-c", "echo hi; exit 0"]);
  const rec = receiptFor("t-nolog");
  fs.rmSync(rec.log, { force: true });
  const reread = receiptFor("t-nolog");
  assert.equal(readReceipt(reread).finished, true, "deleting the log made the job look unfinished");
  assert.equal(reread.status, "SUCCESS");
});

test("LIVE · THE DEADLINE IS ENFORCED BY THE WRAPPER, so backgrounding cannot defeat it", () => {
  /* Two seconds, not thirty minutes: the bound is a property of the mechanism, not of its size. */
  const r = spawnSync("bash", [RUNNER, "t-timeout", "--deadline", "2", "--", "bash", "-c", "sleep 30"], { cwd: APP, encoding: "utf8" });
  assert.equal(r.status, STATUS_EXIT.TIMEOUT, `expected TIMEOUT, got ${r.status}: ${r.stdout} ${r.stderr}`);
  const rec = receiptFor("t-timeout");
  assert.equal(rec.status, "TIMEOUT");
  assert.equal(rec.deadlineEnforced, true, "the deadline was not enforced — the receipt says so honestly");
  assert.ok(rec.elapsedSecs <= 8, `the job ran ${rec.elapsedSecs}s against a 2s deadline`);
});

test("LIVE · a stale receipt is cleared before the run, so it cannot be read as this run's result", () => {
  runJob("t-stale", ["bash", "-c", "exit 0"]);
  assert.equal(receiptFor("t-stale").status, "SUCCESS");
  runJob("t-stale", ["bash", "-c", "exit 5"]);
  assert.equal(receiptFor("t-stale").status, "FAILURE", "the previous run's receipt survived into this one");
});

test("LIVE · the wrapper refuses a command it was not given", () => {
  const r = spawnSync("bash", [RUNNER, "t-usage", "--deadline", "5"], { cwd: APP, encoding: "utf8" });
  assert.equal(r.status, 64, "a missing command must be a usage error, not a silent success");
});
