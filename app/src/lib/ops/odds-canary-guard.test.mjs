/**
 * Odds-canary structural guards (Program 164 · Release 2) — the script's safety properties,
 * proven without any network: refusals run as real subprocesses with a scrubbed env; the
 * authorization/redaction/scope/leak structures are pinned in source.
 *
 * Run: npx tsx --test src/lib/ops/odds-canary-guard.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const SCRIPT = path.join(APP, "scripts", "ops", "odds-canary.mjs");
const run = (args, env = {}) => spawnSync("npx", ["tsx", SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, ODDS_API_KEY: "", ...env }, timeout: 60_000 });

test("missing key exits 3 BLOCKED_EXTERNAL with zero calls; malformed exits 4 CONFIG_INVALID", () => {
  const missing = run(["--sport", "nfl"]);
  assert.equal(missing.status, 3, missing.stdout + missing.stderr);
  assert.match(missing.stdout, /BLOCKED_EXTERNAL/);
  const malformed = run(["--sport", "nfl"], { ODDS_API_KEY: "not a key!!" });
  assert.equal(malformed.status, 4);
  assert.match(malformed.stdout, /CONFIG_INVALID/);
  assert.ok(!malformed.stdout.includes("not a key!!"), "the malformed value is never echoed either");
});

test("broad or unknown scopes refuse (exit 5) before any secret handling", () => {
  for (const bad of [[], ["--sport", "all"], ["--sport", "mlb"], ["--sport", "everything"]]) {
    const out = run(bad);
    assert.equal(out.status, 5, JSON.stringify(bad));
    assert.match(out.stderr, /REFUSED/);
  }
});

test("source structure: authorization gate, credit floor+ceiling, redaction, self-leak scan, single-sport single-market", () => {
  const src = fs.readFileSync(SCRIPT, "utf8");
  assert.match(src, /if \(!AUTHORIZED\)/, "dry-run is the default");
  assert.match(src, /FLOOR = 50/, "the reserve floor is hard-coded, not an argument");
  assert.match(src, /apiKey=\$\{KEY\}/, "the key is used");
  assert.match(src, /redact/, "…and redacted in every printed URL");
  assert.match(src, /payload\.includes\(KEY\)/, "the artifact is self-scanned for the key before writing");
  assert.match(src, /markets=h2h/, "one market type only");
  // The docstring NAMES "--sport all" as the refused form, so pin the executable property
  // instead: the odds URL binds ODDS_SPORT_KEYS[SPORT] exactly once and no fan-out exists.
  assert.equal((src.match(/ODDS_SPORT_KEYS\[SPORT\]/g) ?? []).length, 2, "one validation + one URL binding — no loop over sports");
  assert.ok(!/Promise\.all/.test(src), "no parallel fan-out exists to misuse");
});
