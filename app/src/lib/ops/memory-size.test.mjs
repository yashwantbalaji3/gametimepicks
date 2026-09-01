/**
 * The memory index must fit its loader, and compaction must preserve what it moves.
 *
 * Run: npx tsx --test src/lib/ops/memory-size.test.mjs
 *
 * The session memory index is loaded whole at session start. Over the limit, only PART of it
 * arrives — silently. Observed 2026-09-01: 27.7 KB against 24.4 KB, so an unknown tail of 165
 * entries simply was not there and nothing said so.
 *
 * The memory directory lives outside this repository, so the checker cannot run against real memory
 * in CI. What CI CAN prove is that the checker itself is correct, which is what this does — against
 * fixtures, in a child process, because the script exits rather than returning.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = path.join(process.cwd(), "scripts", "ops", "check-memory-size.mjs");
const run = (dir, extra = []) => spawnSync("node", [SCRIPT, "--dir", dir, ...extra], { encoding: "utf8" });

const fixture = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-mem-"));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
};

test("an index over the limit FAILS, and says by how much", () => {
  const dir = fixture({ "MEMORY.md": "x".repeat(30_000) });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /OVER LIMIT by/);
  assert.match(r.stderr, /MEMORY_ARCHIVE\.md/, "and names the remedy");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("an index inside the limit passes and reports its headroom", () => {
  const dir = fixture({ "MEMORY.md": "x".repeat(1000) });
  const r = run(dir);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /OK · .* headroom/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("COMPACTION MUST PRESERVE · an archive pointing at a missing file is REFUSED", () => {
  /*
   * The failure this exists to prevent: compaction that looks like preservation while quietly
   * losing the history. An archive of dead links is worse than no archive, because it reads as
   * a promise that the detail is still there.
   */
  const dir = fixture({
    "MEMORY.md": "ok",
    "MEMORY_ARCHIVE.md": "- [gone](gtp-not-here.md) — x\n",
  });
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /name a file that no longer exists/);
  fs.rmSync(dir, { recursive: true, force: true });

  const ok = fixture({
    "MEMORY.md": "ok",
    "MEMORY_ARCHIVE.md": "- [here](gtp-here.md) — x\n",
    "gtp-here.md": "body",
  });
  assert.equal(run(ok).status, 0, "a resolvable archive passes");
  fs.rmSync(ok, { recursive: true, force: true });
});

test("REFUSAL · a missing memory directory reports SKIPPED, not passed", () => {
  /*
   * The exact failure mode this whole program is repairing: a check that cannot see its subject and
   * reports success anyway. It exits 0 because there is genuinely nothing to judge on this machine —
   * but it must SAY so, in words, rather than printing a green line.
   */
  const r = run(path.join(os.tmpdir(), "gtp-memory-definitely-absent"));
  assert.equal(r.status, 0);
  assert.match(r.stdout, /SKIPPED/);
  assert.match(r.stdout, /has not run, it has not passed/);
  assert.doesNotMatch(r.stdout, /\bOK\b/, "an unrun check must never print OK");
});

test("the limit is a parameter, so a loader change does not need a code change", () => {
  const dir = fixture({ "MEMORY.md": "x".repeat(20_000) });
  assert.equal(run(dir, ["--limit-kb", "24.4"]).status, 0);
  assert.equal(run(dir, ["--limit-kb", "10"]).status, 1, "a smaller limit must fail the same file");
  fs.rmSync(dir, { recursive: true, force: true });
});
