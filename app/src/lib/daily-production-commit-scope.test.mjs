/**
 * DAILY PRODUCTION COMMIT-SCOPE GUARD (Sprint 017 · Phase 7 reliability).
 *
 * A generator step that writes an artifact the commit step does not stage produces that artifact on every
 * automated run and then throws it away — silently, with a green workflow. That is exactly what happened to
 * `full-game-simulations/` (step 5b) and `predictions/` (step 5c): both were generated daily in CI and never
 * staged, so the autopilot never published the full-game simulation or prediction layers. Their only commits
 * in history came from manual/agent runs.
 *
 * This pins the general invariant rather than those two paths: EVERY artifact directory a `--write` generator
 * step targets must appear in the `git add` scope. It fails for the next artifact anyone adds, too.
 *
 * Run: npx tsx --test src/lib/daily-production-commit-scope.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WORKFLOW = path.join(process.cwd(), "..", ".github", "workflows", "mlb-daily-production.yml");
const yml = fs.readFileSync(WORKFLOW, "utf8");

/** Which public artifact directory each generator script writes. Extend when a generator is added. */
const GENERATOR_OUTPUT = {
  "ingest-mlb-team-markets.mjs": "app/public/data/mlb/team-markets/",
  "ingest-mlb-slate.mjs": "app/public/data/mlb/player-props/",
  "generate-mlb-game-simulations.mjs": "app/public/data/mlb/game-simulations/",
  "generate-mlb-full-game-simulations.mjs": "app/public/data/mlb/full-game-simulations/",
  "generate-mlb-predictions.mjs": "app/public/data/mlb/predictions/",
};

const addLine = yml.split("\n").find((l) => l.trim().startsWith("git add "));

test("the workflow has a single explicit, path-scoped git add", () => {
  assert.ok(addLine, "found the git add line");
  assert.ok(!/git add\s+(-A|\.|--all)/.test(yml), "never stages the whole tree — money paths must be unreachable");
});

test("every generated artifact directory is inside the commit scope", () => {
  const missing = [];
  for (const [script, dir] of Object.entries(GENERATOR_OUTPUT)) {
    // Only require staging for generators this workflow actually runs with --write.
    const runsIt = new RegExp(`${script.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}[^\\n]*--write`).test(yml);
    if (!runsIt) continue;
    if (!addLine.includes(dir)) missing.push(`${script} writes ${dir} but it is NOT staged — the run discards it`);
  }
  assert.deepEqual(missing, [], missing.join("\n"));
});

test("the money/settlement safety assert still guards the staged set", () => {
  // The commit scope widened; the abort-on-forbidden-paths check must remain, and must still cover money.
  assert.match(yml, /git diff --cached --name-only \| grep -iE '([^']*)'/, "asserts over the STAGED set");
  for (const token of ["portfolio", "mr-dub", "settled_leans", "bank-builder", "moonshot"]) {
    assert.ok(new RegExp(`grep -iE '[^']*${token}`).test(yml), `forbidden-path assert still covers "${token}"`);
  }
  assert.match(yml, /ABORT: forbidden paths staged/, "aborts rather than committing when one appears");
});

test("newly staged paths cannot themselves trip the forbidden-path assert", () => {
  // A path added to the scope must not contain a forbidden token, or every run would abort.
  const forbidden = /portfolio|mr-dub|settled_leans|bank-builder|moonshot|\/out\//i;
  for (const dir of ["app/public/data/mlb/full-game-simulations/", "app/public/data/mlb/predictions/"]) {
    assert.ok(addLine.includes(dir), `${dir} is staged`);
    assert.ok(!forbidden.test(dir), `${dir} does not collide with the money/settlement abort list`);
  }
});
