/**
 * THE PRODUCER HALF MUST NEVER SILENTLY STOP (v1.8 · Track C · C2).
 *
 * C1 pinned a BICONDITIONAL — a consumer imports the reader ⟺ a workflow runs the builder — because both
 * halves were off and only the mixture was dangerous. C2 turns both on, so the biconditional has served its
 * purpose and its harmless direction ("a producer with no reader") is now permanently false. What survives
 * is the direction that can still bite: pages print the current record from this artifact, so if the build
 * step ever falls out of the workflow the artifact freezes and every one of those pages serves a stale
 * record as a current one, with nothing red. That is the failure this repository has paid for repeatedly —
 * a generated contract never added to a commit allowlist (62-hour outage), a static artifact whose
 * eligibility claim aged into a lie, and a derived table (`derive-cycle-table.mjs`) that was in no workflow
 * at all and froze the day it was written.
 *
 * So this file pins the LIFECYCLE, not the boundary:
 *   1. some workflow runs the builder;
 *   2. its step cannot be green while the builder fails;
 *   3. the artifact is staged, so a successful build is actually committed;
 *   4. the owner the projection cites is rebuilt BEFORE it, in the same step.
 *
 * Run: cd app && npx tsx --test src/lib/results/projection-lifecycle.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const WORKFLOWS = path.join(REPO, ".github", "workflows");
const BUILDER = "build-results-projection";
const CYCLE_TABLE = "derive-cycle-table";

const workflowFiles = () => {
  try { return fs.readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f)); } catch { return []; }
};
const readWorkflow = (f) => fs.readFileSync(path.join(WORKFLOWS, f), "utf8");

/** Every source file under a directory, tests and node_modules excluded. */
function sources(dir) {
  const out = [];
  const walk = (d) => {
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
      if (/\.(mjs|ts|tsx|js|jsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/**
 * Does this import specifier name the projection READER?
 *
 * C1's detector required the spec to END in `results/projection`, which missed a SIBLING importing
 * `"./projection"` — and that is exactly the spelling `current-record.ts` uses, so the first reader wired
 * in C2 was invisible to the very test meant to notice readers. A detector that recognises one spelling of
 * a thing is a detector that reports the absence of the other. Both are matched now, and the controls below
 * assert each one, plus the lookalikes that must NOT fire.
 */
const isReaderSpec = (spec, file) =>
  /(^|\/)results\/projection(\.(ts|js|mjs))?$/.test(spec) ||
  (/^\.\/projection(\.(ts|js|mjs))?$/.test(spec) && path.dirname(file).endsWith(path.join("lib", "results")));

function readerImporters(roots) {
  const hits = [];
  const IMPORT = /(?:from\s*|require\(\s*|import\(\s*)["']([^"']+)["']/g;
  for (const root of roots) {
    for (const file of sources(path.join(APP, root))) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(IMPORT)) {
        if (!isReaderSpec(m[1], file)) continue;
        hits.push(path.relative(APP, file));
        break;
      }
    }
  }
  return hits;
}

/**
 * The workflow + the text of the ONE step that runs the builder.
 *
 * Scoped by splitting on step boundaries rather than by a lookahead regex. The first attempt used a
 * lookahead and swallowed the NEIGHBOURING step, so `continue-on-error: true` from an unrelated step made
 * the "cannot be green while it fails" assertion fail against a workflow that was in fact correct. A guard
 * reading the wrong lines is a guard reporting someone else's property — in the other direction it would
 * have passed on a step that really was continue-on-error. The control below pins the scoping itself.
 */
function builderStep() {
  for (const f of workflowFiles()) {
    const src = readWorkflow(f);
    if (!src.includes(BUILDER)) continue;
    /* A step BEGINS at the comment block that documents it, not at its `- name:`. Attributing those lines
       to the PREVIOUS step is what made the second attempt fail: this step's own header comment names
       `build-results-projection.mjs`, so the slice matched was the neighbour's — the one that legitimately
       carries `continue-on-error: true`. */
    const lines = src.split("\n");
    const starts = [];
    for (let i = 0; i < lines.length; i++) {
      if (!/^ *- name:/.test(lines[i])) continue;
      let j = i;
      while (j > 0 && /^ *(#.*)?$/.test(lines[j - 1]) && lines[j - 1].trim() !== "") j--;
      starts.push(j);
    }
    for (let i = 0; i < starts.length; i++) {
      const text = lines.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : lines.length).join("\n");
      if (text.includes(BUILDER)) return { file: `.github/workflows/${f}`, text };
    }
  }
  return null;
}

/**
 * The step's COMMANDS, with every YAML comment line dropped.
 *
 * A mutation probe caught this: deleting the `derive-cycle-table.mjs` invocation left the step's own header
 * comment, which NAMES that script, so a plain substring check still matched and the guard passed over a
 * workflow that no longer rebuilt the owner. A guard that reads prose as code is a guard that fires on its
 * own footnotes — C3's rendered assertions hit the same wall from the other side. Anything asserting that
 * a command RUNS must read this, never the raw step text.
 */
const commandsOf = (text) => text.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

test("POSITIVE + NEGATIVE CONTROLS: the reader detector sees every spelling, and nothing that merely looks like one", () => {
  const sibling = path.join(APP, "src", "lib", "results", "current-record.ts");
  const elsewhere = path.join(APP, "src", "app", "page.tsx");
  for (const [spec, file] of [
    ["@/lib/results/projection", elsewhere],
    ["../results/projection", elsewhere],
    ["@/lib/results/projection.ts", elsewhere],
    ["./projection", sibling],          // ← the spelling C1's detector could not see
    ["./projection.ts", sibling],
  ]) assert.ok(isReaderSpec(spec, file), `the reader detector must see ${spec} from ${path.relative(APP, file)}`);

  for (const [spec, file] of [
    ["../../src/lib/results/projection-core.mjs", elsewhere], // the builder and tests import this legitimately
    ["@/lib/results/projection-reader-notes", elsewhere],
    ["@/lib/results/projections", elsewhere],
    ["./projection-core.mjs", sibling],
    ["./projection", elsewhere],        // a "./projection" OUTSIDE lib/results is a different module
  ]) assert.equal(isReaderSpec(spec, file), false, `the reader detector must not fire on ${spec}`);

  assert.ok(workflowFiles().length > 0, "the workflow directory must be readable, or the producer half proves nothing");

  /* SCOPING CONTROL. The step extractor must return exactly the builder's step — not the file, and not a
     neighbour. Every assertion below reads that slice, so a slice one step too wide would report the
     neighbour's `continue-on-error` as the builder's, in either direction. */
  const step = builderStep();
  assert.ok(step, "a builder step must be found at all");
  assert.equal((step.text.match(/^ *- name:/gm) ?? []).length, 1, "the extracted slice is ONE step, not several");
  assert.match(step.text, /^ *- name:[^\n]*Results projection/m, "…and it is the builder's own step");
  assert.doesNotMatch(step.text, /Refresh prediction history|Health gate/, "…not the steps either side of it");
});

test("readers exist — C2 repointed them, so the producer half below is load-bearing", () => {
  const readers = readerImporters(["src/app", "src/components", "src/lib", "scripts", "api"]);
  assert.ok(readers.length > 0, "no consumer reads lib/results/projection — if C2 was reverted, delete this file with it");
  assert.ok(
    readers.includes(path.join("src", "lib", "results", "current-record.ts")),
    `the shared current-record reader must be among them (got: ${readers.join(", ")})`,
  );
});

test("a workflow runs the builder — the artifact is produced, not just committed once", () => {
  const step = builderStep();
  assert.ok(step, `NO workflow runs ${BUILDER}.mjs. Pages print the current record from its artifact, so without a producer that artifact freezes and every one of them serves a stale record as a current one.`);
  const cmds = commandsOf(step.text);
  assert.match(cmds, new RegExp(`${BUILDER}\\.mjs[^\\n]*--write`), "the build step must actually RUN the builder with --write, not dry-run");
  assert.match(cmds, new RegExp(`${BUILDER}\\.mjs[^\\n]*--now `), "--now is required so the artifact is replayable");
});

test("the build step cannot be green while the builder fails", () => {
  const { text } = builderStep();
  /* `continue-on-error` and a trailing `|| echo` each turn an explicit `exit 1` into a pass. This
     repository has shipped both: a paid UFC capture that bought prices then threw inside a green step, and
     a settle step whose `|| true` ran nothing. The builder's exit codes are its contract (1 = write-once
     refusal, 2 = bad args, 3 = an owner refused) and all three must reach the job. */
  const cmds = commandsOf(text);
  assert.doesNotMatch(text, /continue-on-error:\s*true/, "the build step must not be continue-on-error");
  assert.doesNotMatch(
    cmds, new RegExp(`${BUILDER}[^\\n]*\\|\\|`),
    "the builder invocation must not be followed by `|| …`, which would make a refusal green",
  );
  assert.match(cmds, /exit "\$rc"/, "the builder's exit code must propagate to the job");
  assert.match(cmds, /::error title=/, "…and a refusal must surface by name, not as a generic red");
});

test("the owner the projection cites is rebuilt in the same step, before it", () => {
  const { text } = builderStep();
  /* `derive-cycle-table.mjs` was in NO workflow, so the cycle table froze the day it was written while the
     projection went on citing it as an owner — a read model of a stale owner is not a read model. It runs
     first, and under `set -e`, so a failure stops the step before the projection is built on it. */
  const cmds = commandsOf(text);
  assert.match(cmds, new RegExp(`${CYCLE_TABLE}\\.mjs`), "the cycle table must be REBUILT in this step, not merely mentioned in its comments");
  assert.ok(cmds.indexOf(CYCLE_TABLE) < cmds.indexOf(BUILDER), "…before the projection that cites it");
  assert.match(cmds, /set -euo pipefail/, "so that a failed owner rebuild stops the step");
});

test("the artifact is staged, so a successful build is committed rather than discarded", () => {
  const step = builderStep();
  const src = readWorkflow(path.basename(step.file));
  /* C1 relied on this and said so: the projection lives under results/ precisely because
     `git add app/public/data/results/` already exists, so no new allowlist line is needed. If that line
     ever goes, the build runs every night and the commit silently drops it. */
  assert.match(src, /git add app\/public\/data\/results\//, "nightly-settle must still stage app/public/data/results/");
  assert.match(src, /git add data\/internal\/products\//, "…and the cycle table's internal output");
});
