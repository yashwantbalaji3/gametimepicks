/**
 * THE INDEX MUST BE BUILT AFTER THE CORPUS IT READS (v1.8).
 *
 * `build-model-results-index.mjs` reads `public/data/mlb/results/calibration` and reconciles the result
 * against `mlb/graded-picks.json`, refusing (exit 2) when the two disagree. That refusal is correct and is
 * the whole point of the script.
 *
 * It was positioned to fail. The step sat ~160 lines BEFORE "Refresh prediction history + learning
 * artifacts", which is where `export-mlb-calibration-rows.mjs` rewrites that corpus — while the aggregate
 * had already been rewritten by an earlier step. So every night it compared TODAY's aggregate against
 * YESTERDAY's corpus and refused, and a trailing `|| echo` turned the refusal into a warning.
 *
 * Observed 2026-09-23, run 35845995477: `##[warning]model-results index refused to write — prior index
 * retained`. Job green, settle committed, and `main` shipped an index claiming **22,938** wins beside an
 * aggregate claiming **23,204**. Run by hand against that same commit the builder reconciles exactly — the
 * data was never wrong, only the order in which it was read.
 *
 * Two things are pinned, because fixing either alone leaves the failure reachable: the ORDER, and the
 * absence of the swallow that hid it.
 *
 * Run: cd app && npx tsx --test src/lib/ops/model-index-ordering.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WF = path.join(process.cwd(), "..", ".github", "workflows", "nightly-settle.yml");
const src = fs.readFileSync(WF, "utf8");

/** Step boundaries, with a leading comment block belonging to the step it documents. */
function steps(text) {
  const lines = text.split("\n");
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^ *- name:/.test(lines[i])) continue;
    let j = i;
    while (j > 0 && /^ *(#.*)?$/.test(lines[j - 1]) && lines[j - 1].trim() !== "") j--;
    starts.push({ nameAt: i, from: j });
  }
  return starts.map((s, k) => ({
    name: lines[s.nameAt].replace(/^ *- name: */, "").trim(),
    text: lines.slice(s.from, k + 1 < starts.length ? starts[k + 1].from : lines.length).join("\n"),
  }));
}

const ALL = steps(src);
const indexOf = (needle) => ALL.findIndex((s) => s.name.includes(needle));
/** A step's COMMANDS — comments stripped, so a guard never fires on its own prose. */
const commandsOf = (t) => t.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

test("PREMISE: the three steps this is about all exist, exactly once each", () => {
  for (const n of ["Refresh prediction history", "model-results index", "Health gate"]) {
    const hits = ALL.filter((s) => s.name.includes(n));
    assert.equal(hits.length, 1, `expected exactly one "${n}" step, found ${hits.length}`);
  }
});

test("the model-results index is rebuilt AFTER the calibration corpus it reads", () => {
  const cal = indexOf("Refresh prediction history");
  const idx = indexOf("model-results index");
  assert.ok(
    cal < idx,
    `the index (step ${idx}) must come after the calibration refresh (step ${cal}) — built first, it reconciles ` +
      "today's aggregate against yesterday's corpus and refuses every night",
  );
});

test("…and before the health gate, so a refusal stops the publish", () => {
  assert.ok(indexOf("model-results index") < indexOf("Health gate"));
});

test("a refusal is NOT swallowed — the swallow is what hid this for an unknown number of nights", () => {
  const step = ALL[indexOf("model-results index")];
  const cmds = commandsOf(step.text);
  assert.match(cmds, /build-model-results-index\.mjs[^\n]*--apply/, "it must actually run with --apply");
  assert.doesNotMatch(cmds, /build-model-results-index[^\n]*\|\|/, "no `|| echo` — exit 2 means the detail does not reconcile");
  assert.doesNotMatch(step.text, /continue-on-error:\s*true/);
  assert.match(cmds, /set -euo pipefail/);
});

test("POSITIVE CONTROL: the step extractor reads one step, and the right one", () => {
  const step = ALL[indexOf("model-results index")];
  assert.equal((step.text.match(/^ *- name:/gm) ?? []).length, 1, "one step, not several");
  /* Checked on the NAME LINE, not the whole slice: this step's own header comment names both neighbours
     while explaining why the order matters, and a guard that scanned the prose would fire on that. */
  assert.match(step.text, /^ *- name: Rebuild the public model-results index$/m, "and it is the right step");
  assert.doesNotMatch(commandsOf(step.text), /Health gate|Refresh prediction history/, "no neighbour COMMANDS leaked in");
  // …and the comment-stripping is load-bearing: the prose names `|| echo`, the commands must not.
  assert.match(step.text, /\|\| echo/, "the header explains the swallow that was removed");
  assert.doesNotMatch(commandsOf(step.text), /\|\| echo/, "…and stripping comments is what makes the check meaningful");
});
