/**
 * SESSION 12 · A TRIGGER GITHUB WILL NOT FIRE IS NOT A TRIGGER.
 *
 * Sunday 2026-10-04. nfl-kickoff-refresh listened for daily-products' completion (`workflow_run`), and
 * daily-products DELIVERED four times that morning (11:17Z, 13:03Z, 14:04Z, 15:09Z) while every scheduled
 * clock was silent. Not one of those runs started nfl-kickoff-refresh. They were the 4th link of
 *
 *     nightly-settle (cron) → morning-projections → mlb-daily-production → daily-products
 *
 * and GitHub stops a `workflow_run` chain there. The same day measured the boundary from both sides:
 *
 *     daily-products 15:40Z at depth 3 (morning-projections' own cron) → nfl-kickoff-refresh 15:43Z  FIRED
 *     daily-products 15:55Z at depth 2 (mlb-daily-production's cron)  → nfl-kickoff-refresh 15:58Z  FIRED
 *     daily-products 11:17Z / 13:03Z / 14:04Z / 15:09Z at depth 4     → nothing                        DROPPED
 *
 * So a chain holds at most FOUR workflows (the root plus three `workflow_run` levels). A trigger is judged by
 * its WORST delivery, not its best: daily-products also has a cron (depth 1), which is exactly why the YAML
 * looked fine — the source that actually delivered on a Sunday morning was the deep one.
 *
 * The fix is a `workflow_dispatch` from daily-products' `tick` job (GITHUB_TOKEN dispatches start a fresh
 * chain; cron-watchdog relies on the same fact). This file pins the topology and the tick's safety.
 *
 * Run: npx tsx --test src/lib/ops/workflow-trigger-depth.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const REPO = path.resolve(process.cwd(), "..");
const DIR = path.join(REPO, ".github", "workflows");

/** The most workflows GitHub runs in one workflow_run chain (measured 2026-10-04; see the header). */
const MAX_CHAIN_WORKFLOWS = 4;

/** The free, kickoff-aware deciders a deep chain must reach by dispatch, never by workflow_run. */
const KICKOFF_OWNERS = Object.freeze(["nfl-kickoff-refresh", "nba-forecast-window"]);

function loadWorkflows(dir = DIR) {
  const byName = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) {
    const doc = yaml.load(fs.readFileSync(path.join(dir, f), "utf8"));
    // js-yaml reads a bare `on:` key as boolean true (YAML 1.1); accept both spellings.
    const on = doc?.on ?? doc?.[true] ?? {};
    const sources = on?.workflow_run?.workflows ?? [];
    byName.set(doc?.name ?? f, { file: f, doc, on, sources: Array.isArray(sources) ? sources : [sources] });
  }
  return byName;
}

/**
 * WORST-CASE chain position: 1 for a workflow nothing chains into, else 1 + the deepest source.
 * A cycle is reported as Infinity rather than recursing forever.
 */
function worstChainDepth(byName) {
  const memo = new Map();
  const visit = (name, stack = new Set()) => {
    if (memo.has(name)) return memo.get(name);
    if (stack.has(name)) return Infinity;
    const w = byName.get(name);
    if (!w || !w.sources.length) { memo.set(name, 1); return 1; }
    stack.add(name);
    const d = 1 + Math.max(...w.sources.map((s) => visit(s, stack)));
    stack.delete(name);
    memo.set(name, d);
    return d;
  };
  for (const n of byName.keys()) visit(n);
  return memo;
}

const WF = loadWorkflows();
const DEPTH = worstChainDepth(WF);

test("the loader actually read the workflows (a vacuous graph would pass everything)", () => {
  assert.ok(WF.size >= 20, `expected the repository's workflows, read ${WF.size}`);
  for (const n of [...KICKOFF_OWNERS, "daily-products", "publication-watchdog", "mlb-daily-production", "nightly-settle"]) {
    assert.ok(WF.has(n), `workflow "${n}" not found by name — the guard would be checking nothing`);
  }
  // The measured incident must be visible to the depth function: daily-products is 4 deep.
  assert.equal(DEPTH.get("daily-products"), 4, "daily-products' worst chain position (nightly-settle → … → daily-products)");
});

test("every workflow_run source names a workflow that exists (a typo is a trigger that never fires)", () => {
  for (const [name, w] of WF) {
    for (const s of w.sources) assert.ok(WF.has(s), `${w.file}: workflow_run source "${s}" matches no workflow name`);
  }
});

test(`no workflow sits deeper than ${MAX_CHAIN_WORKFLOWS} in a workflow_run chain (GitHub drops it)`, () => {
  const tooDeep = [...DEPTH].filter(([, d]) => d > MAX_CHAIN_WORKFLOWS).map(([n, d]) => `${n} (${d})`);
  assert.deepEqual(tooDeep, [], `GitHub will not fire these from their deepest source: ${tooDeep.join(", ")}`);
});

test("the kickoff owners are never workflow_run-triggered by daily-products (the dropped Sunday tick)", () => {
  for (const owner of KICKOFF_OWNERS) {
    const w = WF.get(owner);
    assert.ok(!w.sources.includes("daily-products"), `${w.file}: daily-products is 4 deep — its completion never fires ${owner}`);
    for (const s of w.sources) {
      assert.ok(DEPTH.get(s) < MAX_CHAIN_WORKFLOWS, `${w.file}: source ${s} sits at depth ${DEPTH.get(s)}; ${owner} would land past the limit`);
    }
    assert.ok("workflow_dispatch" in w.on, `${w.file}: must stay dispatchable — the tick reaches it by workflow_dispatch`);
  }
});

const DP = WF.get("daily-products").doc;
const TICK = DP.jobs?.tick;
const TICK_RUN = (TICK?.steps ?? []).map((s) => String(s.run ?? "")).join("\n");

test("daily-products dispatches every kickoff owner from a tick job", () => {
  assert.ok(TICK, "daily-products has no `tick` job — the kickoff owners lose their only Sunday-morning clock");
  for (const owner of KICKOFF_OWNERS) {
    assert.match(TICK_RUN, new RegExp(`\\b${owner}\\.yml\\b`), `tick does not name ${owner}.yml`);
  }
  assert.match(TICK_RUN, /gh workflow run "\$wf" --ref main/, "tick must dispatch (a fresh chain), on main");
});

test("the tick cannot be silenced by the producer: no needs, no writer queue, no success gate", () => {
  assert.equal(TICK.needs, undefined, "tick must not wait on `generate` — an MLB refusal (exit 1) would skip it");
  assert.equal(TICK.concurrency, undefined, "tick must not join a concurrency group — a pending run there is cancelled by the next writer");
  // Workflow-level concurrency would park/cancel the tick with the writer queue; it belongs on `generate`.
  assert.equal(DP.concurrency, undefined, "daily-products' writer group must be job-level, not workflow-level");
  assert.equal(DP.jobs.generate?.concurrency?.group, "gtp-generated-artifacts", "generate must still hold the shared writer queue");
  assert.equal(DP.jobs.generate?.concurrency?.["cancel-in-progress"], false);
  assert.doesNotMatch(String(TICK.if ?? ""), /conclusion\s*==\s*'success'/, "any delivered run is a clock tick; a failed producer must still tick");
  assert.match(String(TICK.if ?? ""), /head_branch == github\.event\.repository\.default_branch/, "tick keeps the default-branch trust boundary");
});

test("the tick spends nothing and writes nothing: free deciders only", () => {
  // The paid capture is reachable ONLY through nfl-kickoff-refresh's freshness + in-flight guards.
  assert.doesNotMatch(TICK_RUN, /nfl-event-window/, "tick must never dispatch the capture directly — that bypasses the spend guard");
  assert.doesNotMatch(TICK_RUN, /probe_props|week_window|skip_odds/, "tick passes no capture inputs");
  const env = JSON.stringify((TICK.steps ?? []).map((s) => s.env ?? {}));
  assert.doesNotMatch(env, /secrets\./, "tick reads no secret beyond the run token");
  assert.deepEqual(TICK.permissions, { actions: "write" }, "tick needs actions: write and nothing else (no contents: write)");
  assert.ok(!(TICK.steps ?? []).some((s) => String(s.uses ?? "").startsWith("actions/checkout")), "tick checks nothing out");
  assert.doesNotMatch(TICK_RUN, /git (commit|push)|commit-generated/, "tick never writes");
});

test("worstChainDepth: a source's deepest delivery decides, and a cycle cannot hang the guard", () => {
  const g = (edges) => new Map(Object.entries(edges).map(([n, s]) => [n, { sources: s }]));
  // C has a cron AND a workflow_run source 3 deep; its worst case is what GitHub may refuse.
  const d = worstChainDepth(g({ A: [], B: ["A"], C: ["B"], D: ["C"], E: ["D"] }));
  assert.equal(d.get("D"), 4);
  assert.equal(d.get("E"), 5);
  const cyc = worstChainDepth(g({ X: ["Y"], Y: ["X"] }));
  assert.ok(!Number.isFinite(cyc.get("X")) || cyc.get("X") > MAX_CHAIN_WORKFLOWS);
});
