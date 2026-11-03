/**
 * VIEWS — plain-text renderings of the derived state. Every line that shows an agent's work starts with its mode
 * tag, [MOCK] or [LIVE], taken from the ledger's recorded mode (never from the artifact's own text), and a run with
 * any MOCK output carries a MOCK banner. There is no option to hide either.
 */
import { spendSummary } from "./budgets.mjs";

export const modeTag = (mode) => (mode === "LIVE" ? "[LIVE]" : "[MOCK]");
const short = (d) => (d ? String(d).slice(0, 12) : "—");
const agentName = (a) => `${a.provider}/${a.seat}/${a.role}`;

export function mockBanner(state) {
  const outs = Object.values(state.tasks).flatMap((t) => t.outputs);
  const mocks = outs.filter((o) => o.mode !== "LIVE").length;
  return mocks ? `*** MOCK RUN: ${mocks} of ${outs.length} outputs are MOCK — local stand-ins, no provider was called, nothing here is real work ***` : null;
}

export function renderTaskTree(state) {
  const kids = {};
  for (const id of state.taskOrder) (kids[state.tasks[id].parentTaskId ?? "root"] ??= []).push(id);
  const lines = [];
  const walk = (id, depth) => {
    const t = state.tasks[id];
    const mode = t.outputs.length ? modeTag(t.outputs.at(-1).mode) : "      ";
    const extra = [
      t.blocker ? `blocker ${t.blocker.class}:${t.blocker.code}` : null,
      t.escalation ? `ESCALATED → ${t.escalation.decider}` : null,
      `L${t.approvalLevel}`, `$${t.costUsd.toFixed(4)}`,
    ].filter(Boolean).join(" · ");
    lines.push(`${"  ".repeat(depth)}${depth ? "└─ " : ""}${t.taskId} ${t.state.padEnd(18)} ${mode} ${t.stepKey}${t.round ? ` r${t.round}` : ""} — ${agentName(t.assignedAgent)} (${extra})`);
    for (const k of kids[id] ?? []) walk(k, depth + 1);
  };
  for (const r of kids.root ?? []) walk(r, 0);
  return lines.join("\n");
}

export function renderHandoffs(state) {
  return state.handoffs.map((h) => {
    const mode = state.outputsByDigest[h.artifactDigest]?.mode;
    return `#${h.seq} ${h.fromTaskId} → ${h.toTaskId}  ${h.from.provider}/${h.from.role} → ${h.to.provider}/${h.to.role}  artifact ${short(h.artifactDigest)} ${modeTag(mode)}${h.context.length ? ` +${h.context.length} context` : ""}\n      “${h.instructions.split("\n")[0].slice(0, 110)}”`;
  }).join("\n");
}

export function renderOutputs(state) {
  return state.taskOrder.flatMap((id) => state.tasks[id].outputs.map((o) =>
    `${modeTag(o.mode)} ${o.taskId} ${o.provider}/${o.model ?? "—"} as ${o.role}  cost $${o.cost.usd.toFixed(4)}${o.cost.estimated ? " (est.)" : ""}  sha256 ${short(o.artifactDigest)}\n      ${summarize(o)}`)).join("\n");
}

function summarize(o) {
  const a = o.artifact ?? {};
  const s = a.summary ?? a.brief ?? (a.checks ? `gate: ${a.checks.map((c) => `${c.id}=${c.pass ? "pass" : "FAIL"}`).join(", ")}; releasable=${a.releasable}` : JSON.stringify(a).slice(0, 100));
  const v = a.verdict ? ` · verdict ${a.verdict}${a.findings?.length ? ` (${a.findings.map((f) => f.id).join(", ")})` : ""}` : "";
  return `${String(s).slice(0, 140)}${v}`;
}

export function renderAudit(state, events) {
  const lines = events.map((e) => {
    const b = e.body;
    const what = e.type === "task.transition" ? `${b.taskId} → ${b.to}${b.blocker ? ` [${b.blocker.class}:${b.blocker.code}]` : ""}`
      : e.type === "task.output" ? `${b.taskId} output ${modeTag(b.output.mode)} ${b.output.provider}/${b.output.model ?? "—"} $${b.output.cost.usd}`
        : e.type === "handoff" ? `${b.fromTaskId} ⇒ ${b.child.taskId}`
          : e.type === "task.created" ? `${b.task.taskId} created`
            : e.type === "approval.granted" ? `${b.taskId} approved by ${e.actor.role}/${e.actor.id}`
              : e.type === "review.verdict" ? `${b.reviewTaskId} verdict ${b.verdict} (round ${b.round})`
                : e.type === "review.escalated" ? `${b.subjectTaskId} ESCALATED → ${b.decider}`
                  : e.type === "run.status" ? `${b.runId} ${b.status}`
                    : e.type === "notify" ? `notify ${b.to} (${b.reason}) re ${b.taskId}`
                      : e.type === "task.cost" ? `${b.taskId} ${b.mode} $${b.usd}`
                        : e.type === "budget.refused" ? `${b.taskId} REFUSED ${b.code} (${b.scope})`
                          : b.taskId ?? "";
    return `${String(e.seq).padStart(3)} ${e.at} ${e.type.padEnd(16)} ${(e.actor.role + "/" + e.actor.id).padEnd(44)} ${what}  ‹${short(e.digest)}›`;
  });
  return `${lines.join("\n")}\nchain head ${state.headDigest} (${state.seq} events, each linked to the previous by sha256)`;
}

export function renderBudget(state, now) {
  const s = spendSummary(state, now);
  const rows = Object.entries(s.providers).map(([p, v]) => `  ${p.padEnd(14)} today $${v.dayUsd.toFixed(4)} · month $${v.monthUsd.toFixed(4)}`);
  return `spend: total $${s.totalUsd.toFixed(4)} (live $${s.liveUsd.toFixed(4)})\n${rows.join("\n")}`;
}
