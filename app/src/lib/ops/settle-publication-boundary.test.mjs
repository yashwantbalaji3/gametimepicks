/**
 * THE PUBLICATION BOUNDARY IN `nightly-settle` (§18).
 *
 * 🔴 THE DEFECT. The settler computes a night's work across ~20 steps — dated receipts, ledgers,
 * graded picks per sport, the risk-ladder record, the products lifecycle — all onto the runner's
 * working tree. Then "Rebuild the canonical Results projection" runs, and its `exit 1` means one
 * thing only: a dated projection for this slate day already exists and DIFFERS, so the write-once
 * rule refused to restate it. That is a refusal to REPUBLISH ONE READ MODEL.
 *
 * Because the commit step came after it with no condition, that refusal skipped BOTH the health gate
 * and the commit — and every validly computed settlement artifact died with the runner. The site
 * never moved, and the next run met write-once receipts that now refuse.
 *
 * §18: "Do not fix this with a blind `always()` commit that bypasses health gates."
 *
 * THE BOUNDARY, and why each half is needed:
 *   · the projection step records `publish_refusal=true` and STILL EXITS 1 — the job ends red and an
 *     operator decides. An output written before a step fails is readable afterwards, which is what
 *     makes a deferred failure possible WITHOUT `continue-on-error`. This repo has paid twice for
 *     `continue-on-error` cancelling an explicit `exit 1`.
 *   · the HEALTH GATE still runs, and still decides. That is what separates this from a blind
 *     `always()`: money invariants, the $100→bankroll reconciliation and freshness must all pass
 *     before anything reaches the canonical owner.
 *   · the commit runs only on a PASSED gate, and REVERTS the projection's dated directory first, so
 *     write-once integrity holds — the artifact that was refused is not committed.
 *   · exit 2 (bad arguments) and exit 3 (the assembly refused an owner) set NO flag. Those mean the
 *     settlement itself may be wrong, and nothing publishes.
 *
 * Run: cd app && npx tsx --test src/lib/ops/settle-publication-boundary.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const WF = fs.readFileSync(path.join(ROOT, ".github/workflows/nightly-settle.yml"), "utf8");

/**
 * Comment lines stripped.
 *
 * ⚠ A GUARD THAT READS ITS OWN EXPLANATION PROVES NOTHING. `exit "$rc"` appears twice in this
 * workflow: once in the comment describing the boundary, once as the code. A probe deleting the CODE
 * left the guard green because the prose still matched — and my probe, replacing the first
 * occurrence, had mutated the comment instead of the step. Both halves of that were wrong, and both
 * are the same mistake: treating a mention as the thing.
 */
const stripComments = (block) => block.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

/** One step's YAML block, from its `- name:` to the next step at the same indent. */
function step(name) {
  const i = WF.indexOf(`- name: ${name}`);
  assert.notEqual(i, -1, `step "${name}" not found — this guard cannot pass by failing to look`);
  const rest = WF.slice(i + 1);
  const j = rest.search(/\n      - name: /);
  return WF.slice(i, j === -1 ? WF.length : i + 1 + j);
}

const PROJECTION = "Rebuild the canonical Results projection (read model over the settled owners)";
const HEALTH = "Health gate (abort publish on missing/stale/non-reconciling data)";
const COMMIT = "Commit and push if results changed";

test("the projection step is addressable and still FAILS on a refusal", () => {
  const s = stripComments(step(PROJECTION));
  assert.match(s, /^\s*- name: .*\n\s*id: projection/m, "later steps must be able to read its outputs");
  /* ⚠ The whole design depends on this step going RED. A deferred failure that never arrives is a
     swallowed failure. */
  assert.match(s, /exit "\$rc"/, "the step must still exit with the builder's code");
  /*
   * ⚠ THE KEY, NOT THE PHRASE. This first asserted /continue-on-error/ against the block and failed —
   * the step's own error message says "Do NOT make this step continue-on-error", so the guard matched
   * the WARNING rather than the setting. Matching a mention instead of the thing is the single most
   * repeated guard defect on this repo, and it very nearly read as a real regression here.
   */
  assert.doesNotMatch(s, /^\s*continue-on-error:/m, "continue-on-error would cancel the explicit exit");
  /* `|| true` / `|| echo` only matter on the BUILDER invocation, which is the line that can fail. */
  const builder = s.split("\n").find((l) => l.includes("build-results-projection.mjs"));
  assert.ok(builder, "the builder invocation must be present");
  assert.doesNotMatch(builder, /\|\| true/, "`|| true` turns an explicit exit 1 green");
  assert.doesNotMatch(builder, /\|\| echo/, "`|| echo` turns an explicit exit 1 green");
});

test("ONLY exit 1 sets the publication-refusal flag", () => {
  const s = stripComments(step(PROJECTION));
  const flagLine = s.split("\n").find((l) => l.includes("publish_refusal=true"));
  assert.ok(flagLine, "the flag must be written");
  /* It must sit inside the rc -eq 1 branch, not the generic failure branch: exit 2 is bad arguments
     and exit 3 means a truth rule caught an owner, and neither licenses a publish. */
  const beforeFlag = s.slice(0, s.indexOf("publish_refusal=true"));
  const lastBranch = Math.max(beforeFlag.lastIndexOf('[ "$rc" -eq 1 ]'), -1);
  const genericBranch = beforeFlag.lastIndexOf('[ "$rc" -ne 0 ]');
  assert.ok(lastBranch > genericBranch, "the flag must be set in the rc=1 branch only");
});

test("the health gate STILL RUNS after a publication refusal — this is not a blind always()", () => {
  const s = step(HEALTH);
  assert.match(s, /publish_refusal == 'true'/, "the gate must be reachable on a refusal");
  assert.match(s, /success\(\)/, "and on the normal path");
  /* §18's explicit prohibition. `always()` would run it after ANY failure, including a settlement
     orchestrator crash, which is exactly the bypass being warned against. */
  assert.doesNotMatch(s, /^\s*if:.*always\(\)/m, "always() would bypass the failure it must respect");
});

test("the commit requires a PASSED health gate — a refusal is not permission to skip it", () => {
  const s = step(COMMIT);
  assert.match(s, /steps\.health\.outcome == 'success'/, "the gate's verdict gates the commit");
  assert.match(s, /publish_refusal == 'true'/);
  assert.doesNotMatch(s, /^\s*if:.*always\(\)/m, "§18: not a blind always() commit");
  /* And the normal path is unchanged. */
  assert.match(s, /success\(\)/);
});

test("write-once integrity: the refused artifact is NOT committed", () => {
  const s = stripComments(step(COMMIT));
  assert.match(s, /git checkout -- app\/public\/data\/results\/projection\//,
    "the dated projection directory must be reverted on a refusal");
  /* The revert must be conditional — on a normal run the freshly built projection MUST commit, and
     reverting it unconditionally would recreate the 62-hour outage in a new place. */
  const idx = s.indexOf("git checkout -- app/public/data/results/projection/");
  const guard = s.slice(0, idx);
  assert.match(guard, /if \[ "\$PUBLISH_REFUSAL" = "true" \]/, "the revert is conditional on the refusal");
});

test("the normal path still commits the projection it just built", () => {
  /* The artifact is in the allowlist through `app/public/data/results/`; a refusal reverts the dated
     subdirectory, and nothing else changes. */
  const s = step(COMMIT);
  assert.match(s, /git add app\/public\/data\/results\//, "the results tree stays in the allowlist");
});

test("the boundary does not widen the commit allowlist", () => {
  /* A publication boundary is about WHEN a commit may run, never about WHAT it may commit. Code,
     secrets and vp/ must stay out — the allowlist is a separate contract. */
  const s = step(COMMIT);
  for (const forbidden of [/git add vp\//, /git add \./, /git add -A/, /git add app\/src/, /git add \*/]) {
    assert.doesNotMatch(s, forbidden, `the boundary must not widen the allowlist: ${forbidden}`);
  }
});

test("every step named by this guard exists — it cannot pass by looking at nothing", () => {
  /* The failure mode of a YAML-text guard is a renamed step and a green scan. */
  for (const n of [PROJECTION, HEALTH, COMMIT]) {
    assert.ok(WF.includes(`- name: ${n}`), `${n} is missing`);
  }
  /* And the blocks must be distinct and non-empty. */
  const blocks = [PROJECTION, HEALTH, COMMIT].map(step);
  assert.equal(new Set(blocks).size, 3, "the step slicer returned overlapping blocks");
  for (const b of blocks) assert.ok(b.split("\n").length > 3, "a one-line block means the slicer is wrong");
});
