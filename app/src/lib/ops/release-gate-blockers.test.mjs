import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { classifyWorkflow, blockingRuns, GATE_EXEMPT } from "./release-gate-blockers.mjs";

const DIR = path.resolve(process.cwd(), "..", ".github", "workflows");
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");
const all = () => new Map(fs.readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)).map((f) => { const c = classifyWorkflow(read(f)); return [c.name, c]; }));

test("committed writers block: every workflow that commits or holds contents: write", () => {
  for (const f of ["nfl-event-window.yml", "nba-forecast-window.yml", "sport-schedules.yml", "nightly-settle.yml", "auto-refresh.yml", "daily-products.yml"]) {
    assert.equal(classifyWorkflow(read(f)).writer, true, f);
  }
  // no `contents:` declaration = the repository default token, which may write: blocks (fail closed)
  assert.ok(classifyWorkflow(read("ufc-pre-card.yml")).reasons.includes("NO_CONTENTS_DECLARATION"));
});

test("committed read-only waiters do not block: contents: read, no commit/push/merge, no personal token", () => {
  for (const f of ["nfl-pregame-free-refresh.yml", "nfl-kickoff-refresh.yml", "mlb-lineup-waiter.yml", "nba-finals-waiter.yml", "publication-watchdog.yml", "quality-gate.yml"]) {
    const c = classifyWorkflow(read(f));
    assert.equal(c.writer, false, `${f}: ${c.reasons.join(" ")}`);
  }
});

test("MUTATIONS: a read-only waiter becomes a writer the moment it could write", () => {
  const base = read("nfl-pregame-free-refresh.yml");
  assert.equal(classifyWorkflow(base).writer, false);
  assert.ok(classifyWorkflow(base.replace("contents: read", "contents: write")).reasons.includes("CONTENTS_WRITE"));
  assert.ok(classifyWorkflow(base.replace(/\n {6}- name: Wait/, "\n      - run: git push origin HEAD:main\n      - name: Wait")).reasons.includes("COMMITS_OR_PUSHES"));
  assert.ok(classifyWorkflow(base.replace("GH_TOKEN: ${{ github.token }}", "GH_TOKEN: ${{ secrets.OPS_PAT }}")).reasons.some((r) => r.startsWith("SECRET_TOKEN")));
  assert.ok(classifyWorkflow(base.replace(/permissions:\n(\s+\w+: \w+\n)+/, "permissions: write-all\n")).writer);
  assert.ok(classifyWorkflow(base.replace(/permissions:\n(\s+\w+: \w+\n)+/, "")).reasons.includes("NO_CONTENTS_DECLARATION"));
  // a comment that mentions git push is not a push
  assert.equal(classifyWorkflow(base.replace("# THE TRUST BOUNDARY", "# never git push here. THE TRUST BOUNDARY")).writer, false);
});

test("REPLAY 2026-11-12 19:05Z: the pregame waiter alone passes; its dispatched writer blocks; unknown names block", () => {
  const byName = all();
  assert.deepEqual(blockingRuns(["nfl-pregame-free-refresh", "deploy-flush"], byName), []);
  assert.deepEqual(blockingRuns(["nfl-pregame-free-refresh", "nfl-event-window"], byName).map((b) => b.name), ["nfl-event-window"]);
  assert.deepEqual(blockingRuns(["some-renamed-workflow"], byName), [{ name: "some-renamed-workflow", reasons: ["UNKNOWN_WORKFLOW"] }]);
  assert.deepEqual(GATE_EXEMPT, ["deploy-flush"], "the v1 exemption is unchanged");
});

test("every committed workflow has a name the gate can match", () => {
  for (const f of fs.readdirSync(DIR).filter((x) => /\.ya?ml$/.test(x))) assert.ok(classifyWorkflow(read(f)).name, f);
});
