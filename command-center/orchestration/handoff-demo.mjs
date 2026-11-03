/**
 * HANDOFF LOOP — MOCK acceptance run (the 12 steps of the V3 directive with stand-in agents).
 *
 *   node command-center/orchestration/handoff-demo.mjs            # temp store, prints the audit
 *   node command-center/orchestration/handoff-demo.mjs --json     # the CEO Home / tree views as JSON
 *
 * Every agent here is a scripted stand-in: its model id starts with "mock-", the ledger labels every output MOCK, it
 * costs $0, and nothing it "did" happened. The orchestration around it (routing, verification, evaluation, briefs,
 * bounds, approvals, the audit) is the real code. The same run with live adapters needs the founder's keys and caps.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFileStore } from "../ledger/store.mjs";
import { stepClock } from "../lib/util.mjs";
import { createTaskLedger, replay } from "./task-ledger.mjs";
import { budgetConfig } from "./budgets.mjs";
import { createHandoffLoop } from "./handoff-loop.mjs";

export const DEMO_REQUEST = Object.freeze({
  objective: "Show when the Command Center queue was last refreshed, in UTC, in the queue header",
  acceptanceCriteria: ["The queue header shows 'Updated HH:MM UTC' from the server's last refresh time", "A test fails if the header shows local time"],
});
export const KNOWN_COMMITS = Object.freeze(["1111111111111111111111111111111111111111", "2222222222222222222222222222222222222222"]);

/** A complete, executable brief (the shape the evaluator must produce). */
export function demoBrief(over = {}) {
  return {
    assignee: "claude-engineering", priority: "P2", risk: "medium", fixesSubject: false,
    objective: "Add an 'Updated HH:MM UTC' label to the Command Center queue header, fed by the server's last refresh time",
    whyItMatters: "On Nov 2 the founder could not tell whether the queue was current; stale screens led to missed approval windows.",
    currentState: "The queue header shows the title only; /api/state carries generatedAt but nothing renders it.",
    requirements: ["Render generatedAt as HH:MM UTC in the queue header", "Never render the browser's local time"],
    codeLocations: [{ path: "command-center/surfaces/console/app.js", verified: false }],
    priorResults: "None — first assignment for this request.",
    acceptanceCriteria: ["The header shows 'Updated HH:MM UTC' matching generatedAt", "A unit test fails when the label uses local time"],
    tests: ["node --test command-center/tests/*.test.mjs"],
    constraints: ["No change to /api/state's shape", "Stage explicit paths; no push"],
    deliverables: ["A commit on a work branch", "A completion report"],
    reportingFormat: "Completion report JSON with commits, test counts and stage.",
    dependencies: [], permissions: ["workcopy.write", "no-push", "no-deploy"],
    ...over,
  };
}

const evaluation = (o) => ({ verdict: "accept", decision: "CLOSE", requirementCoverage: [], missing: [], findings: [], qaRequired: false, followUps: [], rationale: "", ceoSummary: "", ...o });

/**
 * Scripted stand-ins. `script.plan(req)` / `script.evaluate(req, subject)` / `script.research(req)` / `script.work(req)`
 * return artifacts; defaults reproduce the acceptance scenario. Adapters are plain objects (never branded live).
 */
export function createScriptedMocks(script = {}) {
  const calls = [];
  const subjectOf = (req) => req.state.tasks[req.task.subjectTaskId];
  const evalCount = {};
  const defaults = {
    plan: () => evaluation({ verdict: "not-applicable", decision: "FOLLOW_UP", rationale: "[MOCK] one engineering change covers the request", followUps: [demoBrief()], ceoSummary: "[MOCK] planned: one Claude engineering task" }),
    evaluate: (req, subject) => {
      const a = subject.brief?.assignee;
      const n = (evalCount[a] = (evalCount[a] ?? 0) + 1);
      if (a === "claude-engineering" && !subject.brief.fixesSubject) {
        return evaluation({
          verdict: "changes", decision: "FOLLOW_UP",
          requirementCoverage: [{ requirement: "UTC label", met: "partial", evidence: "[MOCK] report says label renders local time on Safari" }],
          findings: [{ id: "F1", severity: "major", text: "The label falls back to local time when generatedAt is missing" }],
          followUps: [
            demoBrief({ fixesSubject: true, priority: "P1", objective: "Make the queue header label use generatedAt in UTC even when the browser locale differs, and hide it when generatedAt is missing", priorResults: "First implementation rendered local time when generatedAt was absent (finding F1).", acceptanceCriteria: ["Label hidden when generatedAt is missing", "Label is UTC for a non-UTC browser locale in the test"] }),
            {
              ...demoBrief(), assignee: "grok-research", priority: "P3", tests: [],
              objective: "Find how three sports-analytics dashboards show data freshness to users, with source links, to inform the label wording",
              whyItMatters: "The wording should match what users already understand from comparable products.",
              currentState: "Label wording is 'Updated HH:MM UTC'; no external comparison exists.",
              requirements: ["Three products, each with a source URL", "Quote the exact freshness wording each uses"],
              codeLocations: [], acceptanceCriteria: ["Three findings, each with an https source URL", "Each finding quotes the product's freshness wording"],
              constraints: ["Public sources only", "Never post on X"], deliverables: ["A research report"], permissions: ["read-public-web", "never-post"],
              reportingFormat: "Research report JSON: findings with claim and url.",
            },
          ],
          rationale: "[MOCK] verified defect F1; outside comparison is cheap and useful", ceoSummary: "[MOCK] first change needs a fix; research requested",
        });
      }
      return evaluation({
        requirementCoverage: [{ requirement: a === "grok-research" ? "three sourced findings" : "UTC label", met: "yes", evidence: "[MOCK] report and claim verification" }],
        rationale: `[MOCK] ${a} round ${n} meets its criteria`,
        ceoSummary: a === "grok-research" ? "[MOCK] research delivered with sources" : "[MOCK] queue header shows 'Updated HH:MM UTC'; fix verified; ready to close",
      });
    },
    research: () => ({
      summary: "[MOCK] three products show freshness as relative time with an absolute tooltip",
      findings: [1, 2, 3].map((i) => ({ claim: `[MOCK] product ${i} shows 'Updated N min ago'`, url: `https://example.invalid/mock-${i}` })),
      limitations: ["[MOCK] no real search was run"], suggestedNextSteps: [{ title: "Consider a relative-time tooltip", rationale: "[MOCK] common pattern", suggestedAssignee: "chatgpt-product" }],
    }),
  };
  const s = { ...defaults, ...script };
  const mk = (provider) => ({
    provider, model: `mock-${provider}`, kind: "mock",
    worstCase: () => 0,
    async run(req) {
      calls.push({ provider, step: req.step.key, kind: req.step.kind, taskId: req.task.taskId });
      const artifact = req.step.key === "plan" ? s.plan(req) : req.step.key === "evaluate" ? s.evaluate(req, subjectOf(req)) : req.step.kind === "research" ? s.research(req) : s.work(req);
      return { artifact, usage: { usd: 0, estimated: false, tokensIn: 0, tokensOut: 0 } };
    },
  });
  return { adapters: { openai: mk("openai"), anthropic: mk("anthropic"), xai: mk("xai") }, calls };
}

/** What the stand-in Claude Code worker reports. */
export function demoReport(task, over = {}) {
  const fix = task.brief?.fixesSubject;
  return {
    originalTask: task.taskId, intendedOutcome: task.brief.acceptanceCriteria.join("; "),
    summary: fix ? "[MOCK] label now hidden without generatedAt and always UTC" : "[MOCK] added the Updated label to the queue header",
    changes: ["[MOCK] no file was changed"], files: ["(mock)"],
    git: { branch: "mock/queue-updated-label", commits: [fix ? KNOWN_COMMITS[1] : KNOWN_COMMITS[0]], prs: [] },
    tests: [{ command: "node --test command-center/tests/*.test.mjs", passed: 12, failed: 0 }],
    evidence: [{ kind: "note", ref: "[MOCK] no screenshot" }], limitations: ["[MOCK] stand-in worker"], risks: [],
    suggestedNextSteps: fix ? [] : [{ title: "Check the label at 390 px", rationale: "[MOCK] mobile header is narrow", suggestedAssignee: "claude-qa" }],
    stage: "COMMITTED", ...over,
  };
}

export const FOUNDER = Object.freeze({ role: "founder", id: "founder", surface: "mobile-console", authenticated: true });

/** Run the acceptance scenario on a fresh temp store. Returns the loop, ledger and a step log. */
export async function runDemo({ dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-cc-v3-")), origin = "2026-11-03T16:00:00.000Z" } = {}) {
  const clock = stepClock(origin);
  const ledger = createTaskLedger({ store: createFileStore({ dir, clock }), clock, ledgerId: "v3-demo" });
  const mocks = createScriptedMocks();
  const loop = createHandoffLoop({ ledger, adapters: mocks.adapters, config: budgetConfig(), now: clock, checkers: { commitExists: (sha) => KNOWN_COMMITS.includes(sha) } });
  const worker = loop.registerWorker({ id: "mock-claude-code-worker-1" });
  const log = [];
  const rootId = loop.intake(FOUNDER, { ...DEMO_REQUEST, requestKey: "demo-1" });
  log.push(`intake ${rootId}`);
  for (let i = 0; i < 20; i++) {
    log.push(...(await loop.runUntilIdle()));
    const job = loop.claimNext(worker);
    if (!job) break;
    log.push(`worker claimed ${job.taskId}`);
    loop.submit(worker, job.taskId, demoReport(ledger.task(job.taskId)));
  }
  log.push(...(await loop.runUntilIdle()));
  return { loop, ledger, rootId, log, mocks, worker, dir, replayed: replay(ledger.events()) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const r = await runDemo();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ home: r.loop.views.home(), tree: r.loop.views.tree(r.rootId) }, null, 2));
  } else {
    console.log("MOCK — every agent below is a scripted stand-in; no provider was called; $0.\n");
    for (const n of r.loop.views.tree(r.rootId)) console.log(`${"  ".repeat(n.depth)}${n.status.padEnd(22)} ${n.step.padEnd(18)} ${n.agent.padEnd(40)} ${n.mode ?? ""}`);
    const home = r.loop.views.home()[0];
    console.log(`\nCEO Home: ${home.status} · ${home.tasks} tasks · $${home.costUsd} · ${home.mode}\n  summary: ${home.summary}\n  decision: ${home.decision?.taskId ?? "none"}`);
    console.log(`\nLedger: ${r.ledger.events().length} hash-chained events in ${r.dir}`);
  }
}
