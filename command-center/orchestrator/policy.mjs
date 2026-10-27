/**
 * POLICY — the limits that keep a team of agents from becoming a swarm.
 *
 *   • hop ≤ MAX_HOPS. The Chief of Staff's plan is hop 1; any task a role's proposal would spawn is hop + 1.
 *   • ≤ MAX_TASKS_PER_COMMAND tasks per CEO command, however the proposals chain.
 *   • Roles may only PROPOSE delegations; ALLOWED_DELEGATIONS lists which ones the orchestrator will honour.
 *   • Spend: a seat that costs money needs budget; the Phase 1 budget is $0, so only free seats run.
 *   • Founder-only actions are checked by identity, never inferred from message text.
 *
 * Pure functions over plain values — every branch is a unit test.
 */
import { REASON } from "../contracts/index.mjs";

export const MAX_HOPS = 3;
export const MAX_TASKS_PER_COMMAND = 8;

/** Seats that cost nothing to run: no model call, or the founder's own subscription via copy/paste. */
export const FREE_SEATS = Object.freeze(new Set(["fake", "deterministic", "manual:chatgpt", "manual:claude", "manual:grok"]));

/** fromRole → roles it may propose work for. Anything else is refused, whatever the hop count. */
export const ALLOWED_DELEGATIONS = Object.freeze({
  "chief-of-staff": ["prompt-architect", "product-strategist", "engineering", "social-strategy"],
  "prompt-architect": ["engineering"],
  "engineering": ["integrity-reviewer", "creative-renderer"],
  /* A renderer may ask Engineering for a re-render — the classic eng → renderer → eng loop the hop limit stops. */
  "creative-renderer": ["engineering"],
  "social-strategy": [],
  "product-strategist": [],
});

export const FOUNDER_ACTIONS = Object.freeze(["approve", "reject", "request-changes", "publish", "pause", "resume", "spend", "change-seat"]);

/** Monthly budget in USD. Defaults to 0 — nothing paid runs until the founder raises it (CP5). */
export function budgetUsd(env = {}) {
  const n = Number(env.GTP_CC_BUDGET_USD ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function checkSeat(seat, { spentUsd = 0, env = {} } = {}) {
  if (FREE_SEATS.has(seat)) return { ok: true };
  const budget = budgetUsd(env);
  if (budget <= 0 || spentUsd >= budget) {
    return { ok: false, code: REASON.BUDGET_EXCEEDED, detail: `seat ${seat} costs money; budget is $${budget} and $${spentUsd} is spent` };
  }
  return { ok: true };
}

/**
 * Decide whether a proposed delegation may become a task.
 * @param {{fromRole:string, toRole:string, hop:number, tasksSoFar:number}} p   hop = the proposer's hop
 */
export function checkDelegation({ fromRole, toRole, hop, tasksSoFar }) {
  const nextHop = hop + 1;
  if (nextHop > MAX_HOPS) {
    return { ok: false, code: REASON.LOOP_GUARD, detail: `${fromRole} → ${toRole} would be hop ${nextHop} (max ${MAX_HOPS})` };
  }
  if (tasksSoFar >= MAX_TASKS_PER_COMMAND) {
    return { ok: false, code: REASON.TASK_CAP, detail: `command already has ${tasksSoFar} tasks (max ${MAX_TASKS_PER_COMMAND})` };
  }
  if (!(ALLOWED_DELEGATIONS[fromRole] ?? []).includes(toRole)) {
    return { ok: false, code: REASON.DELEGATION_NOT_ALLOWED, detail: `${fromRole} may not delegate to ${toRole}` };
  }
  return { ok: true, hop: nextHop };
}

/**
 * Founder-only actions. `actor` comes from the surface's authenticated identity — in Phase 1 the loopback console,
 * which is demo-grade (see docs/approval-security.md); never from the text of a message.
 */
export function checkFounder(action, actor) {
  if (!FOUNDER_ACTIONS.includes(action)) return { ok: true };
  if (actor?.role !== "founder") return { ok: false, code: REASON.NOT_FOUNDER, detail: `${action} requires the founder` };
  return { ok: true };
}
