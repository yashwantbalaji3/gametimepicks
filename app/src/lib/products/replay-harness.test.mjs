/**
 * REPLAY HARNESS CHILD BOUNDS (v1.1.4.2) — real child processes, not source scans.
 *
 * Every case launches an actual node child through `runReplayChild`. The timeout cases use a tiny injected limit so the
 * suite never waits for the 60 s production value; wall-clock bounds are generous so a slow runner does not flake,
 * while a minutes-long hang still fails.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { REPLAY_CHILD_TIMEOUT_MS, cleanup, makeStore, runReplayChild, tsxNodeFlags } from "./replay-harness.mjs";

const APP = process.cwd();

/** A scratch dir holding one fixture script; removed by the caller. */
function fixture(name, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-harness-test-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, body);
  return { dir, file };
}

// Stalls far past every injected limit, writes a marker at 3 s if still alive, and exits by itself at 15 s — so a harness
// that lost its timeout fails RH3's wall-clock bound instead of hanging this suite (the first probe run did hang).
const sleepUntilKilled = `
import fs from "node:fs";
const marker = process.argv[2];
setTimeout(() => { fs.writeFileSync(marker, "survived"); }, 3000);
setTimeout(() => process.exit(0), 15000);
setInterval(() => {}, 1000);
`;

test("RH1 · normal success: exit 0, stdout returned, no false timeout — and TypeScript runs, so the tsx loader is live", () => {
  const { dir, file } = fixture("ok.ts", `const n: number = 41 + 1;\nconsole.log(JSON.stringify({ ok: true, n, argv: process.argv.slice(2) }));\n`);
  try {
    const r = runReplayChild([file, "--now", "2026-09-17T00:00:00Z"], { cwd: dir, label: "ok fixture" });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout.trim()), { ok: true, n: 42, argv: ["--now", "2026-09-17T00:00:00Z"] });
    assert.ok(r.durationMs < REPLAY_CHILD_TIMEOUT_MS);
  } finally { cleanup(dir); }
});

test("RH2 · normal failure keeps the harness contract: a nonzero status is RETURNED with its stderr, not thrown", () => {
  const { dir, file } = fixture("fail.mjs", `console.error("settler refused: no receipts"); process.exit(3);\n`);
  try {
    const r = runReplayChild([file], { cwd: dir, label: "failing fixture" });
    assert.equal(r.status, 3);
    assert.match(r.stderr, /settler refused: no receipts/);
  } finally { cleanup(dir); }
});

test("RH3 · ⚠ a stalled child is KILLED within a bounded time and fails with one actionable message", () => {
  const { dir, file } = fixture("stall.mjs", sleepUntilKilled);
  const marker = path.join(dir, "marker");
  try {
    const t = Date.now();
    assert.throws(
      () => runReplayChild([file, marker], { cwd: dir, label: "stall fixture", timeoutMs: 1000 }),
      (err) => {
        assert.match(err.message, /^Replay subprocess timed out after 1s \(stall fixture\), killed with SIGKILL:/);
        assert.match(err.message, /tsx stall\.mjs /, "names the command");
        assert.ok(err.message.length < 2000, "concise");
        return true;
      },
    );
    const elapsed = Date.now() - t;
    assert.ok(elapsed < 8000, `returned in ${elapsed} ms, not after the child's own timers`);
  } finally {
    // The child would write its marker at 3 s. Wait past that: a survivor would have written it.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 4000);
    assert.equal(fs.existsSync(marker), false, "the child did not survive the timeout");
    cleanup(dir);
  }
});

test("RH4 · a timeout does not poison the next invocation: a normal child succeeds right after", () => {
  const stall = fixture("stall.mjs", sleepUntilKilled);
  const ok = fixture("ok.mjs", `console.log("after");\n`);
  try {
    assert.throws(() => runReplayChild([stall.file, path.join(stall.dir, "m")], { cwd: stall.dir, label: "stall", timeoutMs: 700 }), /timed out after/);
    const r = runReplayChild([ok.file], { cwd: ok.dir, label: "after the timeout" });
    assert.deepEqual([r.status, r.stdout.trim()], [0, "after"]);
  } finally { cleanup(stall.dir); cleanup(ok.dir); }
});

test("RH5 · cleanup policy holds on the timeout path: a store torn down in `finally` is gone after a timed-out child", () => {
  const store = makeStore("gtp-replay-timeout-", APP);
  const script = path.join(store, "stall.mjs");
  fs.writeFileSync(script, sleepUntilKilled);
  try {
    assert.throws(() => runReplayChild([script, path.join(store, "m")], { cwd: store, label: "store stall", timeoutMs: 700 }), /timed out after/);
  } finally {
    cleanup(store);
  }
  assert.equal(fs.existsSync(store), false, "the replay store is removed");
});

test("RH6 · ⚠ no npx and no package resolution: the child runs with an EMPTY PATH, and without a tsx loader it refuses clearly", () => {
  const { dir, file } = fixture("ok.mjs", `console.log("no path needed");\n`);
  try {
    const r = runReplayChild([file], { cwd: dir, label: "empty PATH", env: { ...process.env, PATH: "" } });
    assert.deepEqual([r.status, r.stdout.trim()], [0, "no path needed"], "launched by absolute node path, not via PATH lookup of npx/tsx");
    assert.throws(
      () => runReplayChild([file], { cwd: dir, label: "not under tsx", execArgv: [] }),
      /could not start \(not under tsx\): this test process was not started by tsx.*never falls back to npx/s,
    );
  } finally { cleanup(dir); }
});

test("RH7 · the tsx flags are read from the running process, exactly (both --flag value and --flag=value forms)", () => {
  const pre = "/cache/node_modules/tsx/dist/preflight.cjs", loader = "file:///cache/node_modules/tsx/dist/loader.mjs";
  assert.deepEqual(tsxNodeFlags(["--require", pre, "--loader", loader, "--enable-source-maps"]), ["--require", pre, "--loader", loader, "--enable-source-maps"]);
  assert.deepEqual(tsxNodeFlags([`--require=${pre}`, `--import=${loader}`]), ["--require", pre, "--import", loader]);
  assert.equal(tsxNodeFlags(["--require", pre]), null, "a preflight without the loader cannot run TypeScript");
  assert.equal(tsxNodeFlags(["--loader", "file:///elsewhere/other-loader.mjs"]), null, "a foreign loader is not tsx");
  assert.ok(tsxNodeFlags(process.execArgv), "this suite itself runs under tsx");
});

test("RH8 · the production limit is the measured one: far above a replay child, far below the 25-minute job", () => {
  assert.equal(REPLAY_CHILD_TIMEOUT_MS, 60_000);
  assert.ok(REPLAY_CHILD_TIMEOUT_MS >= 50 * 633, "≥ 50× the slowest measured settler child (633 ms)");
  assert.ok(REPLAY_CHILD_TIMEOUT_MS * 10 < 25 * 60_000, "ten consecutive stalls still end inside the job");
});
