/**
 * Session 12 · the shadow report's rewrite check must not be vacuous in a shallow checkout. Real git repos:
 * a full history finds the true first add; a depth-1 clone sees only the boundary and must say "cannot tell".
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { firstAddCommit, shallowBoundaries } from "./first-commit.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-first-commit-"));
const origin = path.join(tmp, "origin");
const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();
fs.mkdirSync(origin);
g(origin, "init", "-q", "-b", "main");
const rel = "data/day.json";
fs.mkdirSync(path.join(origin, "data"));
fs.writeFileSync(path.join(origin, rel), JSON.stringify({ v: "first" }));
g(origin, "add", rel); g(origin, "commit", "-q", "-m", "add day");
const addHash = g(origin, "rev-parse", "HEAD");
// Deleted and re-added later with different content: the FIRST add (oldest) is the publication, not the re-add.
g(origin, "rm", "-q", rel); g(origin, "commit", "-q", "-m", "delete day");
fs.mkdirSync(path.join(origin, "data"), { recursive: true });
fs.writeFileSync(path.join(origin, rel), JSON.stringify({ v: "rewritten" }));
g(origin, "add", rel); g(origin, "commit", "-q", "-m", "re-add day");
fs.writeFileSync(path.join(origin, "other.txt"), "x");
g(origin, "add", "other.txt"); g(origin, "commit", "-q", "-m", "unrelated bot commit");
const shallow = path.join(tmp, "shallow");
g(tmp, "clone", "-q", "--depth", "1", `file://${origin}`, shallow);
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("full history: the true FIRST add (not a later re-add), with its content", () => {
  assert.equal(shallowBoundaries(origin).size, 0);
  const fc = firstAddCommit(origin, rel);
  assert.equal(fc.hash, addHash);
  assert.deepEqual(fc.content, { v: "first" });
});

test("🔴 shallow clone: the boundary 'adds' every file — that is not evidence, so null (UNVERIFIED), never a self-compare", () => {
  const b = shallowBoundaries(shallow);
  assert.equal(b.size, 1, "the depth-1 clone has one boundary commit");
  // Positive control: git DOES report the boundary as the file's add — exactly the vacuous input.
  const raw = g(shallow, "log", "--diff-filter=A", "--format=%H", "--", rel);
  assert.ok(b.has(raw), "git attributes the add to the shallow boundary");
  assert.notEqual(raw, addHash);
  assert.equal(firstAddCommit(shallow, rel), null);
});

test("deepened enough, the shallow clone finds the true first add again", () => {
  g(shallow, "fetch", "-q", "--deepen=5", "origin", "main");
  assert.equal(firstAddCommit(shallow, rel)?.hash, addHash);
});

test("nightly-settle deepens history before the report, and fails closed if it cannot", () => {
  const wf = fs.readFileSync(path.join(process.cwd(), "../.github/workflows/nightly-settle.yml"), "utf8").replace(/^\s*#.*$/gm, "");
  assert.match(wf, /git fetch --quiet --shallow-since=\S+ origin main[^\n]*\n\s*\(cd app && npx tsx scripts\/products\/report-selector-shadow\.mjs --write\)/);
  const script = fs.readFileSync(path.join(process.cwd(), "scripts/products/report-selector-shadow.mjs"), "utf8");
  assert.match(script, /firstAddCommit\(REPO, .*, JSON\.parse, boundaries\)/, "the report passes the shallow boundaries to the owner");
});
