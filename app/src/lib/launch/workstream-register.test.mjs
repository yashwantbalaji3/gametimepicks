/**
 * The register's own rules — the ones that stop it becoming a place to declare victory.
 *
 * A program that reports progress in prose can always find a sentence that sounds finished. These
 * cases make the classification a derived fact: SHIPPED needs a commit, a gate needs a named event,
 * and a row cannot inherit another row's excuse.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

import {
  WORKSTREAMS,
  DISPOSITIONS,
  executableNow,
  programClassification,
  dispositionCounts,
} from "./workstream-register.mjs";

test("exactly ten rows, uniquely identified, in order", () => {
  assert.equal(WORKSTREAMS.length, 10);
  assert.deepEqual(WORKSTREAMS.map((w) => w.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("every row carries a real starting state and an executable acceptance test", () => {
  for (const w of WORKSTREAMS) {
    assert.ok(DISPOSITIONS.includes(w.disposition), `${w.id}: unknown disposition ${w.disposition}`);
    // Length is a crude proxy, but it catches the failure mode it is aimed at: a row filled in with
    // "TBD" or restating its own title instead of the evidence it actually started from.
    assert.ok(w.startedFrom.length > 80, `${w.id}: startedFrom must say what was already true`);
    assert.ok(w.acceptance.length > 80, `${w.id}: acceptance must be testable, not aspirational`);
    assert.ok(!w.acceptance.toLowerCase().includes("tbd"), `${w.id}: acceptance is undecided`);
  }
});

test("SHIPPED requires a commit that exists in git", () => {
  /*
   * The rule that makes SHIPPED mean something. A row may not be marked shipped from a plan, a
   * local edit or a passing unit test — only from a commit this repository actually contains.
   */
  for (const w of WORKSTREAMS) {
    if (w.disposition !== "SHIPPED") continue;
    assert.ok(w.commit, `${w.id}: SHIPPED without a commit`);
    const found = execSync(`git cat-file -t ${w.commit} 2>/dev/null || echo missing`, { encoding: "utf8" }).trim();
    assert.equal(found, "commit", `${w.id}: commit ${w.commit} is not in this repository`);
  }
});

test("a gated row must name its own acceptance event, not gesture at one", () => {
  for (const w of WORKSTREAMS) {
    if (w.disposition !== "REALITY_GATED" && w.disposition !== "FOUNDER_GATED") continue;
    assert.ok(w.note && w.note.length > 30, `${w.id}: a gate without a named event is an excuse`);
  }
});

test("a row may not be closed while a row it depends on is open", () => {
  const byId = new Map(WORKSTREAMS.map((w) => [w.id, w]));
  const closed = (w) => w.disposition === "SHIPPED" || w.disposition === "ALREADY_PROVEN";
  for (const w of WORKSTREAMS) {
    if (!closed(w)) continue;
    for (const dep of w.dependsOn) {
      assert.ok(closed(byId.get(dep)), `${w.id} is closed but depends on ${dep}, which is not`);
    }
  }
});

test("dependencies are real rows and never circular", () => {
  const ids = new Set(WORKSTREAMS.map((w) => w.id));
  for (const w of WORKSTREAMS) {
    for (const d of w.dependsOn) {
      assert.ok(ids.has(d), `${w.id}: depends on unknown row ${d}`);
      assert.notEqual(d, w.id, `${w.id}: depends on itself`);
    }
  }
  // Row 10 depends on the other nine, so a topological order must exist over the whole set.
  const done = new Set();
  let progress = true;
  while (progress) {
    progress = false;
    for (const w of WORKSTREAMS) {
      if (done.has(w.id)) continue;
      if (w.dependsOn.every((d) => done.has(d))) { done.add(w.id); progress = true; }
    }
  }
  assert.equal(done.size, WORKSTREAMS.length, "the dependency graph has a cycle");
});

test("executableNow lists only rows nothing is blocking", () => {
  const rows = [
    { id: 1, dependsOn: [], disposition: "SHIPPED" },
    { id: 2, dependsOn: [1], disposition: "ENGINEERING_OPEN" },
    { id: 3, dependsOn: [2], disposition: "ENGINEERING_OPEN" },
    { id: 4, dependsOn: [], disposition: "REALITY_GATED" },
  ];
  assert.deepEqual(executableNow(rows).map((r) => r.id), [2], "3 is blocked by 2; 4 is not engineering-open");
});

test("CLASSIFICATION IS DERIVED · one open engineering row means MATERIAL_PROGRESS", () => {
  /*
   * Never declared. The charter's own rule, encoded — a reality or founder gate does not excuse an
   * open engineering row, and neither does a persuasive summary.
   */
  assert.equal(programClassification([{ disposition: "SHIPPED" }, { disposition: "ENGINEERING_OPEN" }]), "MATERIAL_PROGRESS");
  assert.equal(programClassification([{ disposition: "SHIPPED" }, { disposition: "REALITY_GATED" }]), "PROGRAM_217_COMPLETE");
  assert.equal(programClassification([{ disposition: "ENGINEERING_OPEN" }]), "MATERIAL_PROGRESS");
});

test("the live register's classification matches its own rows", () => {
  const counts = dispositionCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.equal(total, 10, "every row has exactly one disposition");
  assert.equal(
    programClassification(),
    counts.ENGINEERING_OPEN > 0 ? "MATERIAL_PROGRESS" : "PROGRAM_217_COMPLETE",
  );
});
