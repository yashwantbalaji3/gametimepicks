/**
 * RESEARCH SCORERS ARE CODE, AND THEY WERE UNGATED (2026-09-25).
 *
 * `scripts/research/**` holds the replay scorers. replay-win-margin.mjs decides which heads the
 * PUBLIC forecasts adopt; replay-team-availability.mjs imports production model code to do its job.
 * Neither path was on the quality gate's push filter or its pull_request filter, and the repo-root
 * scripts tree was outside the lint glob entirely — 19 files.
 *
 * ⚠ THE SYMPTOM WAS A PR WITH NO CHECK AT ALL. A pull request containing a 300-line scorer showed
 * no quality gate to skip: green by absence rather than by test. That is the same blind spot this
 * file's own comment records for app/api/** ("PRs were green and pushes ran nothing"), one
 * directory over.
 *
 * ⚠ AND THE PATH FILTER ALONE IS HALF A FIX. Adding the path makes the gate RUN; it does not make
 * anything in the gate READ the changed file. Both halves are asserted here, because a gate that
 * runs and checks nothing is the more dangerous of the two states — it looks like coverage.
 *
 * Run: npx tsx --test src/lib/ops/research-scripts-gated.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");

test("the quality gate fires on a research-scorer change, on push AND on a pull request", () => {
  const wf = fs.readFileSync(path.join(REPO, ".github/workflows/quality-gate.yml"), "utf8");
  const onBlock = wf.slice(wf.indexOf("\non:"), wf.indexOf("concurrency:"));
  const push = onBlock.slice(onBlock.indexOf("push:"), onBlock.indexOf("pull_request:"));
  const pr = onBlock.slice(onBlock.indexOf("pull_request:"));
  assert.match(push, /- "scripts\/research\/\*\*"/,
    "a scorer change pushed to main must run the gate — otherwise pushes run nothing");
  assert.match(pr, /- "scripts\/research\/\*\*"/,
    "and the pull request must carry a check at all, rather than being green because none was registered");
});

test("and the lint the gate runs actually READS those files", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8"));
  const lint = pkg.scripts["lint:scripts"];
  assert.ok(lint, "lint:scripts must exist");
  assert.match(lint, /\.\.\/scripts\/\*\*\/\*\.mjs/,
    "lint:scripts runs from app/, so its globs are app-relative — the repo-root scripts tree needs ../scripts/** or the gate fires and lints nothing");
});

test("every research scorer is reachable by that glob", () => {
  /* Anti-vacuity: if the tree empties or moves, the two assertions above become decorative. */
  const dir = path.join(REPO, "scripts/research");
  assert.ok(fs.existsSync(dir), "scripts/research must still exist for these guards to mean anything");
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".mjs")) found.push(path.relative(REPO, full));
    }
  };
  walk(dir);
  assert.ok(found.length >= 5, `only ${found.length} research scripts found — too few to call this guard live`);
  for (const f of found) assert.ok(f.startsWith("scripts/research/"), `${f} sits outside the glob the gate lints`);
});
