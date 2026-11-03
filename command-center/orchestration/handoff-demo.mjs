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

/** Stand-in briefs per workstream, for any request: what a planner would hand each named agent. */
const STANDIN_BRIEF = Object.freeze({
  "claude-engineering": (asked, criteria) => demoBrief({
    objective: asked, whyItMatters: "[MOCK] the founder asked for it from CEO Chat.", currentState: "[MOCK] not inspected: a stand-in planner reads no code.",
    requirements: [`[MOCK] ${asked.slice(0, 120)}`], codeLocations: [], acceptanceCriteria: criteria,
    constraints: ["Stage explicit paths; no push"], priorResults: "None — first assignment for this request.",
  }),
  "claude-qa": (asked) => demoBrief({
    assignee: "claude-qa", objective: `Check the result of: ${asked.slice(0, 160)}`, whyItMatters: "[MOCK] the founder asked for QA.", currentState: "[MOCK] not inspected.",
    requirements: ["Run the request's checks and report what was verified"], codeLocations: [], acceptanceCriteria: ["A QA report lists each check and its result"],
    constraints: ["Read only"], deliverables: ["A QA report"], permissions: ["repo.read"], priorResults: "None — first assignment for this request.",
  }),
  "grok-research": (asked) => ({
    ...demoBrief(), assignee: "grok-research", priority: "P2", tests: [], codeLocations: [],
    objective: `Research for the CEO request, with sources: ${asked.slice(0, 160)}`,
    whyItMatters: "[MOCK] the founder asked for outside research on this subject.", currentState: "[MOCK] no research exists for this request.",
    requirements: ["Findings on the requested subject only", "Each finding with an https source URL"],
    acceptanceCriteria: ["At least three findings on the requested subject, each with a real https source"],
    constraints: ["Public sources only", "Never post on X"], deliverables: ["A research report"], permissions: ["read-public-web", "never-post"],
    reportingFormat: "Research report JSON: findings with claim and url.", priorResults: "None — first assignment for this request.",
  }),
  "chatgpt-product": (asked) => demoBrief({
    assignee: "chatgpt-product", objective: `Product review for: ${asked.slice(0, 160)}`, whyItMatters: "[MOCK] the founder asked for a product view.", currentState: "[MOCK] not inspected.",
    requirements: ["Assess the request from the user's side"], codeLocations: [], tests: [], acceptanceCriteria: ["A product review with concrete recommendations"],
    constraints: ["No code changes"], deliverables: ["A product review"], permissions: [], priorResults: "None — first assignment for this request.",
  }),
});

const evaluation = (o) => ({ verdict: "accept", decision: "CLOSE", requirementCoverage: [], missing: [], findings: [], qaRequired: false, followUps: [], rationale: "", ceoSummary: "", ...o });

/**
 * Scripted stand-ins. `script.plan(req)` / `script.evaluate(req, subject)` / `script.research(req)` / `script.work(req)`
 * return artifacts; defaults reproduce the acceptance scenario. Adapters are plain objects (never branded live).
 */
export function createScriptedMocks(script = {}) {
  const calls = [];
  const subjectOf = (req) => req.state.tasks[req.task.subjectTaskId];
  const evalCount = {};
  // The request in the founder's own words. The scripted texts below describe DEMO_REQUEST; for any other request the
  // stand-ins name the request instead, so a MOCK screen never shows work that has nothing to do with what was asked.
  const askedOf = (req) => req.state.tasks[req.task.rootTaskId ?? req.task.taskId]?.objective ?? "";
  const isDemo = (req) => askedOf(req) === DEMO_REQUEST.objective;
  const short = (t) => (t.length > 90 ? `${t.slice(0, 87)}...` : t);
  const defaults = {
    plan: (req) => {
      if (isDemo(req)) return evaluation({ verdict: "not-applicable", decision: "FOLLOW_UP", rationale: "[MOCK] one engineering change covers the request", followUps: [demoBrief()], ceoSummary: "[MOCK] planned: one Claude engineering task" });
      const root = req.state.tasks[req.task.rootTaskId];
      const criteria = root?.acceptanceCriteria?.length ? root.acceptanceCriteria : [`[MOCK] ${short(askedOf(req))} is done and shown on the page`, "[MOCK] a test fails without the change"];
      // One brief per workstream the founder named (Claude engineering when none is named), each with its own assignee.
      const named = (root?.meta?.requiredWorkstreams ?? []).filter((w) => STANDIN_BRIEF[w]);
      const briefs = (named.length ? named : ["claude-engineering"]).map((w) => STANDIN_BRIEF[w](askedOf(req), criteria));
      return evaluation({ verdict: "not-applicable", decision: "FOLLOW_UP", rationale: `[MOCK] one assignment per workstream: ${briefs.map((b) => b.assignee).join(", ")}`, followUps: briefs, ceoSummary: `[MOCK] planned: ${briefs.map((b) => b.assignee).join(" + ")}` });
    },
    evaluate: (req, subject) => {
      const a = subject.brief?.assignee;
      const n = (evalCount[a] = (evalCount[a] ?? 0) + 1);
      if (a === "claude-engineering" && !subject.brief.fixesSubject) {
        return evaluation({
          verdict: "changes", decision: "FOLLOW_UP",
          requirementCoverage: [{ requirement: "UTC label", met: "partial", evidence: "[MOCK] report says label renders local time on Safari" }],
          findings: [{ id: "F1", severity: "major", text: "The label falls back to local time when generatedAt is missing" }],
          followUps: isDemo(req) ? [
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
          ] : [
            demoBrief({ fixesSubject: true, priority: "P1", objective: `Fix finding F1 in the first change for: ${short(askedOf(req))}`, currentState: "[MOCK] the first change is committed; finding F1 is open.", requirements: ["Resolve finding F1", "Keep the request's acceptance criteria met"], codeLocations: [], priorResults: "[MOCK] first change committed; the review found F1.", acceptanceCriteria: ["Finding F1 no longer reproduces", "A test fails without the fix"] }),
          ],
          rationale: isDemo(req) ? "[MOCK] verified defect F1; outside comparison is cheap and useful" : "[MOCK] review found F1; a fix is routed to Claude", ceoSummary: isDemo(req) ? "[MOCK] first change needs a fix; research requested" : "[MOCK] first change needs a fix",
        });
      }
      return evaluation({
        requirementCoverage: [{ requirement: a === "grok-research" ? "three sourced findings" : isDemo(req) ? "UTC label" : short(askedOf(req)), met: "yes", evidence: "[MOCK] report and claim verification" }],
        rationale: `[MOCK] ${a} round ${n} meets its criteria`,
        ceoSummary: a === "grok-research" ? "[MOCK] research stand-in finished: no research was run, no sources" : isDemo(req) ? "[MOCK] queue header shows 'Updated HH:MM UTC'; fix verified; ready to close" : `[MOCK] done: ${short(askedOf(req))}; fix verified; ready to close`,
      });
    },
    research: (req) => ({
      summary: isDemo(req) ? "[MOCK] three products show freshness as relative time with an absolute tooltip" : `[MOCK] three comparable products, for: ${short(askedOf(req))}`,
      // A stand-in never invents a source: each finding says so, and its url is mock:no-source (never an https link).
      findings: [1, 2, 3].map((i) => ({ claim: `[MOCK] placeholder finding ${i}: no research was run for "${short(askedOf(req))}"`, url: "mock:no-source" })),
      limitations: ["[MOCK] no real search was run; these findings are placeholders, not facts"], suggestedNextSteps: [],
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

const DEMO_REQUEST_BRIEF_OBJECTIVE = demoBrief().objective;

/** What the stand-in Claude Code worker reports. */
export function demoReport(task, over = {}) {
  const fix = task.brief?.fixesSubject;
  const demo = task.brief.objective === DEMO_REQUEST_BRIEF_OBJECTIVE || /queue header label/.test(task.brief.objective);
  return {
    originalTask: task.taskId, intendedOutcome: task.brief.acceptanceCriteria.join("; "),
    summary: demo
      ? (fix ? "[MOCK] label now hidden without generatedAt and always UTC" : "[MOCK] added the Updated label to the queue header")
      : `[MOCK] ${fix ? "fixed" : "completed"}: ${task.brief.objective}`,
    changes: ["[MOCK] no file was changed"], files: ["(mock)"],
    git: { branch: demo ? "mock/queue-updated-label" : "mock/hq-request", commits: [fix ? KNOWN_COMMITS[1] : KNOWN_COMMITS[0]], prs: [] },
    tests: [{ command: "node --test command-center/tests/*.test.mjs", passed: 12, failed: 0 }],
    evidence: [{ kind: "note", ref: "[MOCK] no screenshot" }], limitations: ["[MOCK] stand-in worker"], risks: [],
    suggestedNextSteps: fix ? [] : [{ title: demo ? "Check the label at 390 px" : "Check the change at 390 px", rationale: "[MOCK] the founder works from a phone", suggestedAssignee: "claude-qa" }],
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
