/**
 * A GUARD THAT FAILS THE RUN MUST ALSO STOP THE PUBLISH.
 *
 * nfl-event-window ends its generation step with two audits that exit non-zero on a P0. On
 * 2026-08-28 at 05:07 audit-nfl-differentiation reported P0_DEFECT — twelve distinct games sharing
 * one distribution, every projected score 19-18 — and killed the step, exactly as designed. The run
 * went red. The artifacts were committed and deployed regardless, and /nfl published twelve
 * identical "projected" scorelines to the public.
 *
 * The cause was mine. P215 R-D1 ungated the commit to `always()` so an EMPTY window would still
 * commit its re-derived index — right about empty windows, wrong about everything else. A guard
 * that fails the run and cannot stop the publish is decoration.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WF = path.join(process.cwd(), "..", ".github", "workflows", "nfl-event-window.yml");

test("the commit step is not unconditionally always()", () => {
  const y = fs.readFileSync(WF, "utf8");
  const i = y.indexOf("- name: Commit the window's artifacts");
  assert.ok(i > 0, "the commit step exists");
  const cond = y.slice(i, y.indexOf("run: |", i));
  assert.match(cond, /steps\.generate\.outcome == 'success'/, "a failed generation may not be committed");
  assert.match(cond, /steps\.window\.outputs\.events == '0'/, "an empty window must still commit its re-derived index");
});

test("the generation step carries the id the gate reads", () => {
  // A condition referencing a step with no id silently evaluates to empty and gates nothing.
  const y = fs.readFileSync(WF, "utf8");
  const i = y.indexOf("- name: Generate public-beta NFL forecasts");
  assert.ok(i > 0);
  assert.match(y.slice(i, i + 220), /id: generate/);
});

test("the audits still run inside that step — the gate is only meaningful if they do", () => {
  const y = fs.readFileSync(WF, "utf8");
  const start = y.indexOf("- name: Generate public-beta NFL forecasts");
  const end = y.indexOf("- name: Rebuild the NFL admin lane status", start);
  const step = y.slice(start, end);
  assert.match(step, /audit-nfl-differentiation\.mjs/);
  assert.match(step, /audit-nfl-signal-significance\.mjs/);
});
