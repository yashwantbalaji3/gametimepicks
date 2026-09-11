/**
 * A capture a workflow uses must be committed by that workflow (P256).
 *
 * nfl-event-window ran capture-injuries, built role evidence from the fresh feed, and never added the
 * injuries directory to its commit — so the committed file stayed hours older than the evidence built
 * from it, and the carry-forward's "previous file" could never advance in CI. Any workflow that runs
 * the capture must stage its output in the same run.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WF = path.resolve(process.cwd(), "..", ".github", "workflows");

test("every workflow that runs capture-injuries also commits data/internal/research/injuries/", () => {
  const files = fs.readdirSync(WF).filter((f) => f.endsWith(".yml"));
  const capturing = files.filter((f) => /capture-injuries\.mjs/.test(fs.readFileSync(path.join(WF, f), "utf8")));
  assert.ok(capturing.length >= 2, `sanity: the capture runs in at least two workflows (found ${capturing.join(", ")})`);
  for (const f of capturing) {
    const src = fs.readFileSync(path.join(WF, f), "utf8").replace(/^\s*#.*$/gm, "");
    assert.match(src, /git add[^\n]*data\/internal\/research\/injuries\//, `${f} runs the injury capture but does not commit it`);
  }
});
