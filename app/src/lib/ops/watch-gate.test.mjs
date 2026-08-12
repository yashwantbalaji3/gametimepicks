/**
 * Bounded gate-watcher guards (Program 163 · Release A).
 *
 * The script is exercised against a STUB `gh` (PATH-prepended test double) so every lifecycle
 * exit is proven without touching the network: terminal success, supersession, deadline,
 * duplicate refusal, and the UNKNOWN_RETRYABLE tolerance. The invariant that killed Program
 * 162's watchers — an unfulfillable newest-run predicate — is structurally impossible here
 * because the run id is resolved once and polled by id, and the source assertion pins that.
 *
 * Run: npx tsx --test src/lib/ops/watch-gate.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const APP = process.cwd();
const SCRIPT = path.join(APP, "scripts", "ops", "watch-gate.sh");

/** Build a stub-gh dir whose behavior is driven by a state file of newline-separated replies. */
function stubGh(replies) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-stub-gh-"));
  const state = path.join(dir, "state");
  fs.writeFileSync(state, replies.join("\n") + "\n");
  fs.writeFileSync(path.join(dir, "gh"), `#!/usr/bin/env bash
STATE="${state}"
LINE="$(head -1 "$STATE")"
tail -n +2 "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
if [[ "$LINE" == "ERR" ]]; then exit 1; fi
echo "$LINE"
`, { mode: 0o755 });
  return dir;
}

const run = (args, stubDir, extraEnv = {}) =>
  spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}`, TMPDIR: stubDir, ...extraEnv },
  });

test("terminal success exits 0 with the run id and elapsed time in the receipt", () => {
  const stub = stubGh(["", "success"]); // one in-progress poll, then terminal
  const out = run(["12345", "60", "0"], stub);
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(out.stdout, /TERMINAL run=12345 conclusion=success/);
});

test("a cancelled conclusion exits 3 as SUPERSEDED and says what to check instead", () => {
  const stub = stubGh(["cancelled"]);
  const out = run(["12345", "60", "0"], stub);
  assert.equal(out.status, 3);
  assert.match(out.stdout, /SUPERSEDED .* check the covering tip/);
});

test("API hiccups are UNKNOWN_RETRYABLE inside the bound — then the hard deadline ALWAYS exits (code 4)", () => {
  const stub = stubGh(["ERR", "ERR", "ERR", "ERR", "ERR", "ERR", "ERR", "ERR"]);
  const out = run(["12345", "1", "0"], stub); // 1s deadline, zero interval
  assert.equal(out.status, 4, out.stdout);
  assert.match(out.stdout, /DEADLINE run=12345 .* not lingering/);
});

test("one watcher per target: a live lock refuses a duplicate (code 5); a stale lock self-clears", () => {
  const stub = stubGh(["success"]);
  const lock = path.join(stub, "gtp-watch-gate-777.pid");
  fs.writeFileSync(lock, String(process.pid)); // a LIVE pid (this test) holds the lock
  const dup = run(["777", "60", "0"], stub);
  assert.equal(dup.status, 5);
  assert.match(dup.stdout, /DUPLICATE_WATCHER/);
  fs.writeFileSync(lock, "999999999"); // a dead pid — stale lock must not block
  const ok = run(["777", "60", "0"], stub);
  assert.equal(ok.status, 0, ok.stdout);
});

test("an unresolvable sha exits 6 instead of polling forever", () => {
  const stub = stubGh(["", ""]); // run-list resolution returns nothing
  const out = run(["deadbeef", "60", "0"], stub);
  assert.equal(out.status, 6);
  assert.match(out.stdout, /TARGET_NOT_FOUND/);
});

test("STRUCTURE · the run id is resolved once and polled BY ID — the P162 unfulfillable predicate cannot recur", () => {
  const src = fs.readFileSync(SCRIPT, "utf8");
  assert.match(src, /gh run view "\$RUN_ID"/, "polling is by run id");
  const pollLoop = src.slice(src.indexOf("while true"));
  assert.ok(!/run list/.test(pollLoop), "the poll loop never consults the newest-run list");
  assert.match(src, /trap 'rm -f "\$LOCK"' EXIT INT TERM/, "the lock clears on every exit path");
});
