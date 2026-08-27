/**
 * Guards on assert-run-produced — the check that decides whether a green run is believed.
 *
 * It had two states for an artifact: produced by this run, or a failure. That is one state short.
 * A DEDUPLICATING producer legitimately leaves its artifact untouched — the EPL odds capture refuses
 * a duplicate request inside a 60-minute window — and on 2026-08-20 that correct behaviour failed the
 * job. Because the assert then ran BEFORE the commit, nine forecasts the run had genuinely produced
 * were discarded. The ordering was fixed the same evening; this covers the classification, which is
 * the half that makes the alert worth reading.
 *
 * Exercised as a CHILD PROCESS: the script is a top-level program that calls process.exit, so it
 * cannot be imported and asserted on in-process.
 *
 * Run: npx tsx --test src/lib/ops/assert-run-produced.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const APP = process.cwd();
const SCRIPT = path.join(APP, "scripts/ops/assert-run-produced.mjs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "assert-run-"));
/** Write an artifact whose own generatedAt is `minutesAgo` in the past. */
const artifact = (name, minutesAgo) => {
  const f = path.join(tmp, name);
  fs.writeFileSync(f, JSON.stringify({ generatedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString() }));
  return f;
};
const run = (args) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
/** A run that started 5 minutes ago. */
const since = () => new Date(Date.now() - 5 * 60_000).toISOString();

test("an artifact written during the run passes", () => {
  const f = artifact("fresh.json", 1);
  const r = run(["--since", since(), f]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ok /);
});

test("an artifact older than the run FAILS by default — no silent tolerance", () => {
  const f = artifact("stale.json", 30);
  const r = run(["--since", since(), f]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /BEFORE this run started/);
});

test("--max-age-min tolerates a DEDUPLICATED skip that is still recent", () => {
  /*
   * The real case: odds captured 24 minutes ago, the run started 5 minutes ago, the capture refused a
   * duplicate inside its 60-minute window. Nothing is wrong, and the job must not go red.
   */
  const f = artifact("deduped.json", 24);
  const r = run(["--since", since(), "--max-age-min", "90", f]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /within the 90 min dedup window/);
});

test("--max-age-min still FAILS a producer that has actually stopped", () => {
  /* Three hours old is past any dedup window — that is a dead producer, not a skip. */
  const f = artifact("dead.json", 180);
  const r = run(["--since", since(), "--max-age-min", "90", f]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /not running, not merely deduplicating/);
});

test("--max-age-min does NOT imply --allow-missing: an absent artifact still fails", () => {
  /*
   * The two flags answer different questions. Tolerating "not rewritten" must never quietly start
   * tolerating "never written", which is the failure the whole script exists to catch.
   */
  const r = run(["--since", since(), "--max-age-min", "90", path.join(tmp, "does-not-exist.json")]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /produced no artifact/);
});

test("a non-numeric --max-age-min is refused rather than ignored", () => {
  const f = artifact("ok.json", 1);
  const r = run(["--since", since(), "--max-age-min", "soon", f]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /positive number of minutes/);
});

test("the max-age value is not swallowed as an artifact path", () => {
  /*
   * The path list is built by filtering argv, so a new flag's VALUE becomes a phantom artifact unless
   * it is excluded — and a phantom path fails as "produced no artifact", turning a working guard into
   * a permanently red one.
   */
  const f = artifact("only.json", 1);
  const r = run(["--since", since(), "--max-age-min", "90", f]);
  assert.equal(r.code, 0, r.out);
  // A bare /90/ matched hex tmpdir names (…c90a…) — a wall-clock/tmpdir flake, not the defect
  // this guards. The defect shape is the VALUE echoed as its own token (a swallowed positional).
  assert.doesNotMatch(r.out, /(^|[^0-9a-f])90([^0-9a-f]|$)/m, "the number must not be reported as an artifact path");
  assert.match(r.out, /1 artifact\(s\) produced/);
});

test("no paths at all is refused — the guard may never pass vacuously", () => {
  const r = run(["--since", since()]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /vacuously/);
});
