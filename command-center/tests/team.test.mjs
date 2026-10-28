/**
 * Provider onboarding and the Grok → ChatGPT → Claude Code team workflows. No network: the OpenAI and xAI APIs are
 * stubbed with recorded-shape responses and fake keys; Claude Code is the offline fake CLI.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createFileStore } from "../ledger/store.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { EXECUTION, executionOf, providerStatus, apiSeat, testProvider } from "../providers/catalog.mjs";
import { callJson } from "../providers/api-common.mjs";
import { checkEvidence } from "../contracts/team.mjs";
import { teamRunEvidence, evidenceMarkdown } from "../orchestrator/team-evidence.mjs";
import { RUN_LIMITS } from "../contracts/engineering.mjs";
import { stepClock } from "../lib/util.mjs";
import { FOUNDER, tempDir, TEST_SLATE } from "./helpers.mjs";

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/fake-claude.mjs");
const RESEARCH_CMD = "Team, analyze today's biggest NFL conversations on X and identify three opportunities for GameTimePicks to contribute useful content.";
const PLAN_CMD = "Team, review GameTimePicks' current NFL social-content opportunities and propose an improved weekly X content plan.";
const noSleep = async () => {};

const RESEARCH = {
  query: "NFL conversations on X today",
  findings: [
    { topic: "Seahawks defense", summary: "Fans debating Seattle holding KC to 3 points", sport: "NFL", sources: [{ url: "https://x.com/nflfan/status/1849000000000000001", author: "@nflfan", excerpt: "KC held to 3?!" }], signals: "many replies", relevanceToGTP: "our forecast had SEA" },
    { topic: "Steelers road win", summary: "PIT beat NO 16-10", sport: "NFL", sources: [{ url: "https://x.com/pghsports/status/1849000000000000002" }] },
    { topic: "Rumour", summary: "unsourced trade chatter", sport: "NFL", sources: [{ url: "https://example.com/blog" }] },
  ],
  caveats: ["engagement figures not verified"],
};
const PROPOSALS = {
  proposals: [
    { findingIndex: 0, type: "reply", replyToUrl: "https://x.com/nflfan/status/1849000000000000001", text: "Our pregame forecast had Seattle at 62.6% to win. Final: Seahawks 20, Chiefs 3.", rationale: "joins the top thread with our frozen forecast" },
    { findingIndex: 1, type: "post", text: "Pittsburgh won 16-10 in New Orleans, as our forecast had it (64.8%)... and 99 other things.", rationale: "credit where due" },
    { findingIndex: 2, type: "post", text: "Big trade coming? Lock it in.", rationale: "trend" },
  ],
};
const PLAN = {
  summary: "Recap-first week built on frozen forecasts",
  weekly: [
    { day: "Mon", format: "recap card", theme: "Forecast vs final", dataSource: "Forecast Ledger" },
    { day: "Wed", format: "thread", theme: "Biggest misses", dataSource: "Forecast Ledger" },
    { day: "Sat", format: "post", theme: "Week preview", dataSource: "published forecasts" },
  ],
  kpis: ["replies per post"], risks: ["late settlement"], automationCandidates: ["Monday recap card"],
};
const fence = (o) => `Here you go:\n\`\`\`json\n${JSON.stringify(o, null, 2)}\n\`\`\``;

function team({ env = {}, fetch, engineering } = {}) {
  const dir = tempDir("gtp-cc-team-");
  const clock = stepClock("2026-10-27T15:00:00.000Z");
  const store = createFileStore({ dir: path.join(dir, "ledger"), clock });
  const o = createOrchestrator({ store, clock, env, outDir: dir, slateDate: TEST_SLATE, providerFetch: fetch ?? (async () => { throw new Error("network not allowed in this test"); }), providerSleep: noSleep, engineering });
  const cmd = (s) => s.commands.at(-1);
  const awaiting = (s) => cmd(s).tasks.find((t) => t.status === "AWAITING_INPUT");
  return { o, dir, store, cmd, awaiting };
}

test("execution labels come from the seat, never from the output", () => {
  assert.equal(executionOf("fake"), EXECUTION.SIMULATED);
  assert.equal(executionOf("manual:grok"), EXECUTION.MANUAL);
  assert.equal(executionOf("api:xai"), EXECUTION.REAL);
  assert.equal(executionOf("cli:claude-code"), EXECUTION.REAL);
  assert.equal(executionOf("deterministic"), EXECUTION.DETERMINISTIC);
  assert.equal(executionOf(null), EXECUTION.UNAVAILABLE);
});

test("onboarding status: manual paths available, APIs locked with the exact founder action, Anthropic API never used", () => {
  const p = providerStatus({ env: {}, entries: [], now: "2026-10-27T15:00:00.000Z" });
  const get = (prov, id) => p.find((x) => x.id === prov).integrations.find((i) => i.id === id);
  assert.equal(get("openai", "manual:chatgpt").status, "AVAILABLE");
  assert.equal(get("xai", "manual:grok").status, "AVAILABLE");
  assert.equal(get("openai", "api:openai").status, "NOT CONFIGURED");
  assert.equal(get("openai", "api:openai").execution, EXECUTION.UNAVAILABLE, "an unconfigured API never wears the REAL label");
  assert.equal(get("openai", "api:openai").whenConnected, EXECUTION.REAL);
  assert.equal(get("openai", "manual:chatgpt").execution, EXECUTION.MANUAL);
  assert.match(get("openai", "api:openai").founderAction, /OPENAI_API_KEY/);
  assert.match(get("openai", "api:openai").billing, /separately from ChatGPT Plus/);
  assert.equal(get("xai", "api:xai").status, "NOT CONFIGURED");
  assert.match(get("xai", "api:xai").billing, /\$5 per 1,000 posts/);
  assert.equal(get("xai", "mcp:grok").status, "BLOCKED");
  assert.equal(get("anthropic", "api:anthropic").status, "NOT USED");
  assert.equal(apiSeat("api:anthropic", {}).code, "NEVER_SILENT_API");
  const hosted = providerStatus({ env: {}, entries: [], now: "2026-10-27T15:00:00.000Z", hosted: true });
  assert.match(hosted[0].integrations[0].founderAction, /CP-H2/);
});

test("provider calls: one retry on 5xx, none on 4xx, credit errors named, keys never echoed", async () => {
  let calls = 0;
  const flaky = async () => (++calls === 1 ? new Response("busy", { status: 503 }) : new Response('{"ok":1}', { status: 200 }));
  assert.deepEqual(await callJson(flaky, "https://x", { headers: {}, sleep: noSleep }), { ok: 1 });
  assert.equal(calls, 2);
  calls = 0;
  const bad = async () => { calls++; return new Response("bad request", { status: 400 }); };
  await assert.rejects(callJson(bad, "https://x", { headers: { Authorization: "Bearer sk-secret" }, sleep: noSleep }), (e) => e.code === "PROVIDER_ERROR" && !e.message.includes("sk-secret"));
  assert.equal(calls, 1);
  const broke = async () => new Response('{"error":"Your team has run out of credits"}', { status: 429 });
  await assert.rejects(callJson(broke, "https://x", { headers: {}, sleep: noSleep }), (e) => e.code === "PROVIDER_OUT_OF_CREDIT");
});

test("evidence check: only findings citing a specific X post are usable", () => {
  const c = checkEvidence(RESEARCH);
  assert.deepEqual(c.usable, [0, 1]);
  assert.equal(c.findings[2].verdict, "UNSOURCED");
  assert.deepEqual(checkEvidence({ findings: [{ sources: [{ url: "javascript:alert(1)" }, { url: "https://x.com/a/status/12345/../../evil" }] }] }).findings[0].linkedPosts.length, 1);
});

test("X research, manual mode: Grok and ChatGPT answers pasted, checks run, one decision per passing draft, nothing simulated", async () => {
  const t = team();
  await t.o.handleCommand(RESEARCH_CMD, FOUNDER);
  let s = t.o.state();
  assert.equal(t.cmd(s).intent, "x-social-research");
  assert.equal(t.cmd(s).contributions[0].artifactType, "gtp-facts");
  assert.ok(t.cmd(s).contributions[0].artifact.games.length > 0);
  const research = t.awaiting(s);
  assert.equal(research.ownerRole, "social-intelligence");
  assert.equal(research.app, "Grok");
  assert.match(research.prompt, /https:\/\/x\.com\/<handle>\/status\/<id>/);

  const bad = await t.o.submitManual(research.taskId, "{\"query\":\"x\"}", FOUNDER);
  assert.equal(bad.ok, false);
  assert.equal(t.awaiting(t.o.state()).taskId, research.taskId, "a bad paste leaves the step waiting");
  assert.equal((await t.o.submitManual(research.taskId, fence(RESEARCH), FOUNDER)).ok, true);

  s = t.o.state();
  const writer = t.awaiting(s);
  assert.equal(writer.ownerRole, "content-strategist");
  assert.equal(writer.app, "ChatGPT");
  assert.match(writer.prompt, /62\.6%/, "ChatGPT gets the verified GameTimePicks facts");
  assert.ok(!writer.prompt.includes("unsourced trade chatter"), "unsourced findings never reach ChatGPT");
  assert.equal((await t.o.submitManual(writer.taskId, fence(PROPOSALS), FOUNDER)).ok, true);

  s = t.o.state();
  const c = t.cmd(s);
  const check = c.contributions.find((x) => x.artifactType === "content-check").artifact;
  assert.equal(check.results[0].ok, true, JSON.stringify(check.results[0]));
  assert.deepEqual(check.results[1].problems.map((p) => p.code), ["UNTRACEABLE_NUMBER"], "99 is invented");
  assert.ok(check.results[2].problems.some((p) => p.code === "FINDING_NOT_USABLE"));
  assert.ok(check.results[2].problems.some((p) => p.code === "FORBIDDEN_TERM"));
  const decisions = s.decisions.filter((d) => d.kind === "proposal");
  assert.equal(decisions.length, 1, "only the passing draft reaches the CEO");
  assert.deepEqual(c.contributions.map((x) => x.execution), [EXECUTION.DETERMINISTIC, EXECUTION.MANUAL, EXECUTION.DETERMINISTIC, EXECUTION.MANUAL, EXECUTION.DETERMINISTIC, EXECUTION.DETERMINISTIC]);
  assert.ok(!c.contributions.some((x) => x.execution === EXECUTION.SIMULATED));
  assert.ok(c.reports.at(-1).warnings.some((w) => /not independently fetched/.test(w)));

  const d = decisions[0];
  assert.equal((await t.o.decide({ decisionId: d.decisionId, verdict: "approve", digest: "wrong" }, FOUNDER)).code, "APPROVAL_DIGEST_MISMATCH");
  assert.equal((await t.o.decide({ decisionId: d.decisionId, verdict: "revise" }, FOUNDER)).code, "NOTE_REQUIRED");
  const ok = await t.o.decide({ decisionId: d.decisionId, verdict: "approve", digest: d.subjectDigest }, FOUNDER);
  assert.equal(ok.ok, true);
  assert.match(ok.next, /Nothing was published/);
  assert.equal(t.o.state().history.filter((h) => h.kind === "publish-receipt").length, 0);
  assert.equal((await t.o.decide({ decisionId: d.decisionId, verdict: "reject" }, FOUNDER)).duplicate, true);
});

/** Stubs of the OpenAI and xAI REST APIs with the response shapes the adapters read. */
function stubApis({ research = RESEARCH, proposals = PROPOSALS } = {}) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers.Authorization, body: init.body ? JSON.parse(init.body) : null });
    if (url === "https://api.x.ai/v1/api-key") return Response.json({ name: "gtp", api_key_blocked: false, api_key_disabled: false });
    if (url === "https://api.openai.com/v1/models") return Response.json({ data: [{ id: "gpt-test" }] });
    if (url === "https://api.x.ai/v1/responses") return Response.json({ model: "grok-4.3", output_text: JSON.stringify(research), citations: ["https://x.com/nflfan/status/1849000000000000001"], usage: { input_tokens: 3000, output_tokens: 800 } });
    if (url === "https://api.openai.com/v1/responses") return Response.json({ model: "gpt-test", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(proposals) }] }], usage: { input_tokens: 4000, output_tokens: 600 } });
    return new Response("not found", { status: 404 });
  };
  return { f, calls };
}
const API_ENV = {
  XAI_API_KEY: "xai-test-not-real", GTP_CC_XAI_MONTHLY_CAP_USD: "5",
  OPENAI_API_KEY: "sk-test-not-real", OPENAI_MODEL: "gpt-test", OPENAI_PRICE_IN_PER_M: "1", OPENAI_PRICE_OUT_PER_M: "4", GTP_CC_OPENAI_MONTHLY_CAP_USD: "5",
};

test("X research, connected mode (stubbed APIs): tests gate the seats, real calls are capped, priced and attributed", async () => {
  const api = stubApis();
  const t = team({ env: API_ENV, fetch: api.f });
  assert.equal(t.o.setSeat("social-intelligence", "api:xai", FOUNDER).ok, false, "not selectable before a connection test");
  assert.equal((await t.o.testProviderConnection("api:xai", FOUNDER)).ok, true);
  assert.equal((await t.o.testProviderConnection("api:openai", FOUNDER)).ok, true);
  assert.equal(t.o.setSeat("social-intelligence", "api:xai", FOUNDER).ok, true);
  assert.equal(t.o.setSeat("content-strategist", "api:openai", FOUNDER).ok, true);
  const tests = t.o.state().history.filter((h) => h.kind === "provider-test");
  assert.equal(tests.length, 2);
  assert.ok(!JSON.stringify(t.o.state()).includes("not-real"), "keys never reach the ledger or the state");

  await t.o.handleCommand(RESEARCH_CMD, FOUNDER);
  const s = t.o.state();
  const c = t.cmd(s);
  const grok = c.contributions.find((x) => x.artifactType === "x-research");
  assert.equal(grok.execution, EXECUTION.REAL);
  assert.equal(grok.provider, "xai");
  assert.equal(grok.model, "grok-4.3");
  assert.ok(grok.cost.usd > 0 && grok.cost.estimated === true);
  const gpt = c.contributions.find((x) => x.artifactType === "content-proposals");
  assert.equal(gpt.execution, EXECUTION.REAL);
  assert.equal(gpt.cost.usd, Number(((4000 * 1 + 600 * 4) / 1e6).toFixed(6)));
  const xaiCall = api.calls.find((x) => x.url.endsWith("x.ai/v1/responses"));
  assert.equal(xaiCall.body.tools[0].type, "x_search");
  assert.equal(xaiCall.auth, "Bearer xai-test-not-real");
  assert.equal(s.decisions.filter((d) => d.kind === "proposal").length, 1);
  const status = s.providers.find((p) => p.id === "xai").integrations.find((i) => i.id === "api:xai");
  assert.equal(status.status, "CONNECTED");
  assert.match(status.limits, /spent this month/);
});

test("a call whose worst case exceeds the monthly cap is refused before it is made", async () => {
  const api = stubApis();
  const t = team({ env: { ...API_ENV, GTP_CC_XAI_MONTHLY_CAP_USD: "0.10" }, fetch: api.f });
  await t.o.testProviderConnection("api:xai", FOUNDER);
  assert.equal(t.o.setSeat("social-intelligence", "api:xai", FOUNDER).ok, true);
  await t.o.handleCommand(RESEARCH_CMD, FOUNDER);
  const c = t.cmd(t.o.state());
  assert.equal(c.refusals.at(-1).code, "BUDGET_EXCEEDED");
  assert.match(c.refusals.at(-1).detail, /worst case/);
  assert.equal(api.calls.filter((x) => x.url.endsWith("/responses")).length, 0, "no metered call was made");
});

function toyRepo() {
  const dir = tempDir("gtp-cc-toy-");
  const git = (...a) => execFileSync("git", a, { cwd: dir });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "toy");
  git("config", "user.email", "toy@example.com");
  fs.mkdirSync(path.join(dir, "command-center/recap"), { recursive: true });
  fs.writeFileSync(path.join(dir, "command-center/recap/pipeline.mjs"), "// recap\n");
  fs.writeFileSync(path.join(dir, ".gitignore"), ".claude/\n");
  git("add", "-A");
  git("commit", "-q", "-m", "toy");
  return dir;
}

test("three-provider content plan: Grok + ChatGPT (pasted) and Claude Code (real CLI, read-only) consolidated into one decision", async () => {
  const home = tempDir("gtp-cc-home-");
  fs.writeFileSync(path.join(home, ".fake-claude.json"), "{}");
  const repo = toyRepo();
  const t = team({
    engineering: {
      repoRoot: repo, claudeBin: FAKE, claudeEnv: { PATH: process.env.PATH, HOME: home }, home, screens: false,
      workcopyPaths: ["command-center"], nodeModulesFrom: null, pausePollMs: 100,
      limits: { ...RUN_LIMITS, plan: { ...RUN_LIMITS.plan, timeoutMs: 20_000 }, killGraceMs: 300 },
    },
  });
  await t.o.handleCommand(PLAN_CMD, FOUNDER);
  let s = t.o.state();
  assert.equal(t.cmd(s).intent, "content-plan");
  await t.o.submitManual(t.awaiting(s).taskId, fence(RESEARCH), FOUNDER);
  s = t.o.state();
  // Claude Code is locked until the billing attestation: the plan still arrives, the report names the blocker
  await t.o.submitManual(t.awaiting(s).taskId, fence(PLAN), FOUNDER);
  s = t.o.state();
  let c = t.cmd(s);
  assert.equal(c.refusals.find((r) => r.role === "engineering").code, "BILLING_NOT_CONFIRMED");
  assert.ok(c.reports.at(-1).refusals.some((r) => /BILLING_NOT_CONFIRMED/.test(r)));
  assert.equal(s.decisions.filter((d) => d.kind === "proposal").length, 1);

  // with the attestation on record, the same workflow gets a real (fake-CLI) Claude Code review
  const t2 = team({ engineering: {
    repoRoot: repo, claudeBin: FAKE, claudeEnv: { PATH: process.env.PATH, HOME: home }, home, screens: false,
    workcopyPaths: ["command-center"], nodeModulesFrom: null, pausePollMs: 100,
    limits: { ...RUN_LIMITS, plan: { ...RUN_LIMITS.plan, timeoutMs: 20_000 }, killGraceMs: 300 },
  } });
  t2.o.attestBilling({ usageCredits: "off" }, FOUNDER);
  await t2.o.handleCommand(PLAN_CMD, FOUNDER);
  await t2.o.submitManual(t2.awaiting(t2.o.state()).taskId, fence(RESEARCH), FOUNDER);
  await t2.o.submitManual(t2.awaiting(t2.o.state()).taskId, fence(PLAN), FOUNDER);
  s = t2.o.state();
  c = t2.cmd(s);
  const review = c.contributions.find((x) => x.artifactType === "feasibility-review");
  assert.ok(review, JSON.stringify(c.refusals));
  assert.equal(review.execution, EXECUTION.REAL);
  assert.equal(review.seat, "cli:claude-code");
  assert.equal(review.run.mode, "plan", "read-only tool set");
  const providers = new Set(c.contributions.map((x) => x.seat));
  for (const seat of ["manual:grok", "manual:chatgpt", "cli:claude-code"]) assert.ok(providers.has(seat), seat);
  const d = s.decisions.find((x) => x.kind === "proposal");
  assert.equal(d.subject.feasibility.summary, review.artifact.summary);
  assert.equal(execFileSync("git", ["worktree", "list"], { cwd: repo, encoding: "utf8" }).trim().split("\n").length, 1, "the review's working copy was removed");
  assert.match(review.run.preflight ? "ok" : "", /ok/);

  // the evidence report, read from the ledger alone
  await t2.o.decide({ decisionId: d.decisionId, verdict: "approve", digest: d.subjectDigest }, FOUNDER);
  const ev = teamRunEvidence(t2.store.list());
  assert.deepEqual(ev.verdict.genuineProviders, ["Grok", "ChatGPT", "Claude Code"]);
  assert.equal(ev.verdict.simulated, 0);
  assert.equal(ev.verdict.ok, true, JSON.stringify(ev.checks));
  assert.ok(ev.checks.some((c) => /every checked Grok finding/.test(c.check) && c.ok));
  assert.ok(ev.checks.some((c) => /exact Claude Code review/.test(c.check) && c.ok));
  assert.equal(ev.steps.find((s) => s.step === "research").execution, EXECUTION.MANUAL);
  assert.equal(ev.steps.find((s) => s.step === "feasibility").execution, EXECUTION.REAL);
  const md = evidenceMarkdown(ev);
  assert.match(md, /all three/);
  assert.match(md, /session `fake-review-session`/);

  // the first run (no billing confirmation) is reported honestly: Claude Code refused, not faked
  const ev1 = teamRunEvidence(t.store.list());
  assert.deepEqual(ev1.verdict.genuineProviders, ["Grok", "ChatGPT"]);
  assert.match(ev1.steps.find((s) => s.step === "feasibility").status, /REFUSED BILLING_NOT_CONFIRMED/);
});
