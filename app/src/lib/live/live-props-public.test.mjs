import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = path.resolve(new URL("../../..", import.meta.url).pathname);
const PRUNE = fs.readFileSync(path.join(APP, "scripts/prune-internal-routes.mjs"), "utf8");
const LP = path.join(APP, "public/data/nfl/live-props");

test("🔴 nfl/live-props/ is INTENTIONALLY public, declared and documented", () => {
  /*
   * The sweep keeps only what the built output literally references, and the game cards assemble
   * `/data/nfl/live-props/<providerEventId>.json` at read time — so without this declaration the
   * build REFUSES (exit 1) rather than silently shipping or silently sweeping.
   *
   * This test exists so the declaration cannot be removed quietly, and so "it survived the prune"
   * can never be mistaken for "someone decided to publish it".
   */
  const m = /const ALWAYS_PUBLIC_DATA_DIRS = \[([^\]]*)\]/.exec(PRUNE);
  assert.ok(m, "the allowlist must exist");
  const dirs = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.ok(dirs.includes("nfl/live-props/"), "nfl/live-props/ must be declared public");
  assert.match(PRUNE, /AN INTENTIONAL PUBLICATION DECISION/, "and the decision must be stated, not implied");
  assert.match(PRUNE, /PUBLIC_DERIVED/, "with the data class that justifies it");
});

test("every other runtime-assembled /data/ path still refuses", () => {
  /* Widening the allowlist must not have softened the refusal for anything else. */
  assert.match(PRUNE, /REFUSING to sweep out\/data/);
  assert.match(PRUNE, /process\.exit\(1\)/);
  const m = /const ALWAYS_PUBLIC_DATA_DIRS = \[([^\]]*)\]/.exec(PRUNE);
  const dirs = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  /* Session 5 · B7: the fifth — nfl/reconciliation/, the NFL week reconciliation (PUBLIC_DERIVED; the graded rows
     /results/nfl already renders), fetched per week by the season drill-down. Its note is in prune-internal-routes.mjs
     and its guard (every file PUBLIC_DERIVED) in lib/results/v2/nfl-family-record.test.mjs. */
  assert.deepEqual(dirs.sort(), ["ask/v1/", "compare/v1/", "lab/v1/", "nfl/live-props/", "nfl/reconciliation/"],
    "exactly five prefixes are tolerated; a sixth needs its own decision and its own note");
});

test("what we are publishing is what we said we are publishing", () => {
  /*
   * The declaration claims these carry only a frozen prediction, public market context and factual
   * game state. That claim is checked against the artifacts themselves rather than trusted.
   */
  const files = fs.existsSync(LP) ? fs.readdirSync(LP).filter((f) => f.endsWith(".json")) : [];
  if (files.length === 0) {
    /* Announce rather than pass quietly — an empty directory must not look like a clean audit. */
    console.log("[live-props-public] no artifacts on disk; the shape assertions had nothing to read");
    return;
  }
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(LP, f), "utf8"));
    assert.equal(j.dataClass, "PUBLIC_DERIVED", `${f} must be public by its own classification`);
    assert.notEqual(j.public, false, `${f} would be swept by the internal-data sweep`);
    /* No secret, no key, no internal-only pointer may ride along. */
    const s = JSON.stringify(j);
    for (const leak of ["apiKey", "ODDS_API_KEY", "Bearer ", "data/internal"]) {
      assert.equal(s.includes(leak), false, `${f} must not contain ${leak}`);
    }
    for (const r of j.rows ?? []) {
      assert.ok(typeof r.predictionId === "string" && r.predictionId.length > 0);
      assert.ok("frozen" in r && "live" in r, "each row is a frozen claim beside a factual state");
    }
  }
});
