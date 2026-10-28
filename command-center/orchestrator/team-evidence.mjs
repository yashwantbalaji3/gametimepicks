/**
 * TEAM RUN EVIDENCE — what actually happened in one team workflow, read from the ledger alone.
 *
 * For each step: the role, the seat, the execution label, the provider and model, when it ran, and the sha256 of
 * what it produced. Then the hand-offs, each checked rather than asserted:
 *   • the prompt shown for ChatGPT contained the exact text of every finding the evidence check passed;
 *   • the decision you were asked about is bound to the exact ChatGPT plan / drafts and the exact Claude review;
 *   • Claude Code's contribution carries its session id, model, raw-log path and the preflight that proved
 *     subscription billing.
 * Verdict lines say plainly when something was manual (your paste — the ledger proves when and what, not which app
 * produced it), simulated, refused or missing. Nothing here is inferred from an artifact's own claims.
 *
 * Used by `node command-center/orchestrator/team-evidence.mjs [commandId]` against the console's ledger, and by
 * tests.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { digestOf, CC_ROOT, wallClock } from "../lib/util.mjs";
import { executionOf, EXECUTION } from "../providers/catalog.mjs";
import { TEAM_WORKFLOWS } from "./team-flow.mjs";

const WHO = { "manual:grok": "Grok (your app, pasted)", "manual:chatgpt": "ChatGPT (your app, pasted)", "api:xai": "Grok via xAI API", "api:openai": "ChatGPT via OpenAI API", "cli:claude-code": "Claude Code CLI", deterministic: "Command Center code", fake: "SIMULATED stand-in" };

/** @returns {{ commandId, text, intent, steps: object[], checks: object[], verdict: { genuineProviders: string[], simulated: number, ok: boolean } }} */
export function teamRunEvidence(entries, commandId) {
  const cmd = commandId
    ? entries.find((e) => e.kind === "command" && e.data.commandId === commandId)
    : entries.filter((e) => e.kind === "command" && TEAM_WORKFLOWS[e.data.intent]).at(-1);
  if (!cmd) throw new Error(commandId ? `no command ${commandId}` : "no team workflow in this ledger yet");
  const id = cmd.data.commandId;
  const mine = entries.filter((e) => e.data?.commandId === id);
  const tasks = new Map();
  for (const e of mine.filter((x) => x.kind === "task")) tasks.set(e.data.taskId, { ...(tasks.get(e.data.taskId) ?? {}), ...e.data, [`at_${e.data.status}`]: e.at });
  const contributions = mine.filter((e) => e.kind === "contribution");
  const refusals = mine.filter((e) => e.kind === "refusal").map((e) => e.data);

  const steps = TEAM_WORKFLOWS[cmd.data.intent].map((step) => {
    const c = contributions.filter((e) => e.data.artifactType === step.artifact && e.data.role === step.role).at(-1);
    const task = [...tasks.values()].find((t) => t.expectedArtifactType === step.artifact && t.ownerRole === step.role);
    const refusal = task ? refusals.filter((r) => r.taskId === task.taskId).at(-1) : null;
    if (!c) return { step: step.key, role: step.role, status: refusal ? `REFUSED ${refusal.code}` : task ? `NOT DONE (${[...Object.keys(task)].filter((k) => k.startsWith("at_")).at(-1)?.slice(3) ?? "queued"})` : "NOT STARTED", detail: refusal?.detail ?? null };
    const d = c.data;
    return {
      step: step.key, role: step.role, status: "DONE", seat: d.seat, execution: executionOf(d.seat), who: WHO[d.seat] ?? d.seat,
      provider: d.provider, model: d.model ?? null, at: c.at, taskId: d.taskId, artifactSha256: digestOf(d.artifact),
      promptShownSha256: task?.prompt ? digestOf(task.prompt) : null, awaitingSince: task?.at_AWAITING_INPUT ?? null,
      claude: d.run ? { sessionId: d.run.sessionId, model: d.run.model, turns: d.run.numTurns, durationS: Math.round((d.run.durationMs ?? 0) / 1000), rawLog: d.run.rawLog, billedTo: d.run.billedTo, preflight: d.run.preflight ? `${d.run.preflight.authMethod} · ${d.run.preflight.subscriptionType} · CLI ${d.run.preflight.cliVersion}` : null, estUsageUsd: d.cost?.estUsageUsd ?? 0 } : null,
      cost: d.cost ?? null,
    };
  });

  const art = (type) => contributions.filter((e) => e.data.artifactType === type).at(-1)?.data?.artifact ?? null;
  const checks = [];
  const research = art("x-research");
  const evidence = art("evidence-check");
  const writerStep = steps.find((s) => s.role === "content-strategist");
  const writerTask = [...tasks.values()].find((t) => t.ownerRole === "content-strategist");
  if (research && evidence && writerTask?.prompt) {
    const inPrompt = (i) => writerTask.prompt.includes(JSON.stringify(research.findings[i].summary).slice(1, -1));
    const missing = evidence.usable.filter((i) => !inPrompt(i));
    const leaked = research.findings.map((f, i) => i).filter((i) => !evidence.usable.includes(i) && inPrompt(i));
    checks.push({ check: "ChatGPT's prompt contained every checked Grok finding, and no unsourced one", ok: missing.length === 0 && leaked.length === 0, detail: `${evidence.usable.length} passed in, ${leaked.length} unsourced leaked, ${missing.length} missing` });
  } else if (writerStep?.seat?.startsWith("api:")) {
    checks.push({ check: "ChatGPT received the checked findings", ok: Boolean(research && evidence), detail: "API seat: the prompt is built from the same contributions (not stored)" });
  }
  const decisions = mine.filter((e) => e.kind === "decision-request" && e.data.kind === "proposal").map((e) => e.data);
  const plan = art("content-plan");
  const proposals = art("content-proposals");
  const review = art("feasibility-review");
  if (cmd.data.intent === "content-plan" && decisions[0]) {
    checks.push({ check: "Your decision is bound to the exact ChatGPT plan", ok: digestOf(decisions[0].subject.plan) === digestOf(plan), detail: `plan sha256 ${digestOf(plan).slice(0, 16)}…` });
    checks.push({ check: "Your decision carries the exact Claude Code review", ok: review ? digestOf(decisions[0].subject.feasibility) === digestOf(review) : decisions[0].subject.feasibility === null, detail: review ? `review sha256 ${digestOf(review).slice(0, 16)}…` : "no review (see refusals)" });
  }
  if (cmd.data.intent === "x-social-research") {
    const bound = decisions.every((d) => proposals?.proposals?.some((p) => digestOf(p) === digestOf(d.subject.proposal)));
    checks.push({ check: "Every decision is one of ChatGPT's exact drafts", ok: decisions.length > 0 && bound, detail: `${decisions.length} decision(s)` });
  }
  for (const d of decisions) {
    const res = entries.find((e) => e.kind === "decision" && e.data.decisionId === d.decisionId)?.data;
    if (res) checks.push({ check: `Your decision on ${d.decisionId}`, ok: res.verdict !== "approve" || res.approvedExactDigest === d.subjectDigest, detail: `${res.verdict}${res.note ? ` — "${res.note}"` : ""} · ${res.authentication}` });
  }

  const done = steps.filter((s) => s.status === "DONE");
  const simulated = done.filter((s) => s.execution === EXECUTION.SIMULATED).length;
  const providers = new Set(done.filter((s) => [EXECUTION.REAL, EXECUTION.MANUAL].includes(s.execution)).map((s) => s.role));
  const genuineProviders = [
    providers.has("social-intelligence") && "Grok",
    providers.has("content-strategist") && "ChatGPT",
    providers.has("engineering") && "Claude Code",
  ].filter(Boolean);
  return {
    commandId: id, text: cmd.data.text, intent: cmd.data.intent, at: cmd.at, steps, checks, refusals,
    verdict: { genuineProviders, simulated, allThree: genuineProviders.length === 3, ok: simulated === 0 && checks.every((c) => c.ok) },
  };
}

export function evidenceMarkdown(ev) {
  const L = [];
  L.push(`# Team run evidence — ${ev.commandId}`, "", `> ${ev.text}`, "", `Intent \`${ev.intent}\` · started ${ev.at}`, "");
  L.push("| Step | Agent | How it ran | Model | When | Output sha256 |", "|---|---|---|---|---|---|");
  for (const s of ev.steps) {
    L.push(s.status === "DONE"
      ? `| ${s.step} | ${s.who} | **${s.execution}** | ${s.model ?? "—"} | ${s.at} | \`${s.artifactSha256.slice(0, 16)}…\` |`
      : `| ${s.step} | — | **${s.status}** | — | — | ${s.detail ? s.detail.replace(/\|/g, "/").slice(0, 160) : ""} |`);
  }
  const claude = ev.steps.find((s) => s.claude);
  if (claude) {
    const c = claude.claude;
    L.push("", `**Claude Code run:** session \`${c.sessionId}\` · ${c.model} · ${c.turns} turns · ${c.durationS} s · est. usage $${Number(c.estUsageUsd).toFixed(2)} of your allowance · preflight ${c.preflight} · ${c.billedTo} · raw log \`out/console/${c.rawLog}\``);
  }
  L.push("", "**Hand-off checks**", "");
  for (const c of ev.checks) L.push(`- ${c.ok ? "✓" : "✗"} ${c.check} — ${c.detail}`);
  L.push("", "**Verdict**", "");
  L.push(`- Genuine provider contributions in this one workflow: ${ev.verdict.genuineProviders.join(", ") || "none"}${ev.verdict.allThree ? " — all three" : ""}.`);
  L.push(`- Simulated contributions: ${ev.verdict.simulated}.`);
  if (ev.steps.some((s) => s.execution === EXECUTION.MANUAL)) L.push("- MANUAL steps are your pastes: the ledger proves what prompt was shown, when the answer arrived and its exact content (sha256) — not which app wrote it. That attestation is yours.");
  for (const r of ev.refusals) L.push(`- Refused: ${r.code} — ${String(r.detail).slice(0, 200)}`);
  return L.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const fs = await import("node:fs");
  const { createFileStore } = await import("../ledger/store.mjs");
  const out = path.resolve(process.env.GTP_CC_OUT_DIR ?? path.join(CC_ROOT, "out/console"));
  const store = createFileStore({ dir: path.join(out, "ledger"), clock: wallClock });
  const ev = teamRunEvidence(store.list(), process.argv[2]);
  const md = evidenceMarkdown(ev);
  fs.mkdirSync(path.join(out, "evidence"), { recursive: true });
  fs.writeFileSync(path.join(out, "evidence", `${ev.commandId}.md`), `${md}\n`);
  fs.writeFileSync(path.join(out, "evidence", `${ev.commandId}.json`), `${JSON.stringify(ev, null, 2)}\n`);
  console.log(md);
  console.log(`\n(saved to ${path.relative(process.cwd(), path.join(out, "evidence", `${ev.commandId}.md`))})`);
}
