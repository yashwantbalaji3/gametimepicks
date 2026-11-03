/**
 * BUDGETS — every metered call is checked against its worst case BEFORE it runs, and every cost is recorded per task.
 *
 *   per provider   daily + monthly caps (USD, UTC day / month)
 *   per agent      daily + monthly caps for one agent (provider:seat:role)
 *   per task       the task's own costBudget { usd, hardStop }
 *   retries        at most maxAttemptsPerTask adapter attempts per task (first try included)
 *   breaker        after `failureThreshold` consecutive failed attempts on a provider, calls to it are refused for
 *                  `cooldownMs` (derived from the ledger, so every replica agrees)
 *
 * Every cap defaults to $0. With a $0 cap, a call whose worst case is above $0 is refused (BUDGET_HARD_STOP); MOCK
 * calls have a $0 worst case, so the demo runs with nothing configured. Spend is summed from `task.cost` events in
 * the task ledger — the same record the audit shows.
 *
 * Cap values are configuration, not secrets: they are read as numbers. Provider credentials are never read here.
 */

export const PROVIDERS = Object.freeze(["anthropic", "openai", "xai"]);

/** Env var names (values are USD). The two monthly API caps are the names the Providers panel already uses. */
export const CAP_ENV = Object.freeze({
  anthropic: { daily: "GTP_CC_ANTHROPIC_DAILY_CAP_USD", monthly: "GTP_CC_ANTHROPIC_MONTHLY_CAP_USD" },
  openai: { daily: "GTP_CC_OPENAI_DAILY_CAP_USD", monthly: "GTP_CC_OPENAI_MONTHLY_CAP_USD" },
  xai: { daily: "GTP_CC_XAI_DAILY_CAP_USD", monthly: "GTP_CC_XAI_MONTHLY_CAP_USD" },
});
export const AGENT_CAP_ENV = Object.freeze({ daily: "GTP_CC_AGENT_DAILY_CAP_USD", monthly: "GTP_CC_AGENT_MONTHLY_CAP_USD" });
export const RETRY_ENV = "GTP_CC_ORCH_MAX_ATTEMPTS";
export const BREAKER_ENV = "GTP_CC_ORCH_BREAKER_FAILURES";

const usd = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

/**
 * @returns {{ providers: Record<string,{dailyUsd:number, monthlyUsd:number}>, agentDefault: {dailyUsd:number, monthlyUsd:number},
 *   agents: Record<string,{dailyUsd:number, monthlyUsd:number}>, hardStop: true, maxAttemptsPerTask: number,
 *   breaker: {failureThreshold:number, cooldownMs:number} }}
 */
export function budgetConfig({ env = {}, agents = {} } = {}) {
  const providers = {};
  for (const p of PROVIDERS) providers[p] = { dailyUsd: usd(env[CAP_ENV[p].daily]), monthlyUsd: usd(env[CAP_ENV[p].monthly]) };
  const attempts = Math.trunc(Number(env[RETRY_ENV]));
  const failures = Math.trunc(Number(env[BREAKER_ENV]));
  return deepFreeze({
    providers,
    agentDefault: { dailyUsd: usd(env[AGENT_CAP_ENV.daily]), monthlyUsd: usd(env[AGENT_CAP_ENV.monthly]) },
    agents: Object.fromEntries(Object.entries(agents).map(([k, v]) => [k, { dailyUsd: usd(v.dailyUsd), monthlyUsd: usd(v.monthlyUsd) }])),
    hardStop: true,
    maxAttemptsPerTask: attempts >= 1 && attempts <= 5 ? attempts : 2,
    breaker: { failureThreshold: failures >= 1 && failures <= 10 ? failures : 3, cooldownMs: 15 * 60 * 1000 },
  });
}

export const agentKey = (a) => `${a.provider}:${a.seat}:${a.role}`;
const day = (iso) => String(iso).slice(0, 10);
const month = (iso) => String(iso).slice(0, 7);

/** Spend so far from the ledger state, by provider and agent, for the day and month of `now`. */
export function spendSummary(state, now) {
  const out = { providers: {}, agents: {}, totalUsd: 0, liveUsd: 0 };
  for (const c of state.costs) {
    const p = (out.providers[c.provider] ??= { dayUsd: 0, monthUsd: 0, allUsd: 0 });
    const a = (out.agents[c.agent] ??= { dayUsd: 0, monthUsd: 0, allUsd: 0 });
    for (const x of [p, a]) {
      x.allUsd += c.usd;
      if (month(c.at) === month(now)) x.monthUsd += c.usd;
      if (day(c.at) === day(now)) x.dayUsd += c.usd;
    }
    out.totalUsd += c.usd;
    if (c.mode === "LIVE") out.liveUsd += c.usd;
  }
  return out;
}

/** Circuit breaker for one provider, derived from `task.attempt` events. */
export function breakerState(state, provider, now, config) {
  const attempts = state.attempts.filter((a) => a.provider === provider);
  let run = 0;
  for (let i = attempts.length - 1; i >= 0 && !attempts[i].ok; i--) run++;
  const last = attempts.at(-1);
  if (run >= config.breaker.failureThreshold && Date.parse(now) - Date.parse(last.at) < config.breaker.cooldownMs) {
    return { open: true, consecutiveFailures: run, until: new Date(Date.parse(last.at) + config.breaker.cooldownMs).toISOString() };
  }
  return { open: false, consecutiveFailures: run, until: null };
}

/**
 * May this task spend `worstCaseUsd` now? Checks, in order: retry budget, breaker, task budget, provider day/month,
 * agent day/month. Returns { ok: true } or { ok: false, code, scope, detail, blockerClass }.
 */
export function checkSpend(state, { task, worstCaseUsd, now, config }) {
  const provider = task.assignedAgent.provider;
  if (task.attempts >= config.maxAttemptsPerTask) {
    return { ok: false, code: "RETRY_BUDGET_EXHAUSTED", scope: "task", blockerClass: "TOOL", detail: `${task.attempts} attempts used of ${config.maxAttemptsPerTask}` };
  }
  const br = breakerState(state, provider, now, config);
  if (br.open) return { ok: false, code: "CIRCUIT_OPEN", scope: `provider:${provider}`, blockerClass: "TOOL", detail: `${br.consecutiveFailures} consecutive failures; closed again at ${br.until}` };
  const wc = Math.max(0, Number(worstCaseUsd) || 0);
  if (wc === 0) return { ok: true, worstCaseUsd: 0 };
  if (task.costBudget.hardStop && task.costUsd + wc > task.costBudget.usd) {
    return { ok: false, code: "BUDGET_HARD_STOP", scope: "task", blockerClass: "FOUNDER", detail: `task budget $${task.costBudget.usd}: spent $${task.costUsd.toFixed(4)} + worst case $${wc.toFixed(4)}` };
  }
  const s = spendSummary(state, now);
  const caps = config.providers[provider];
  if (!caps) return { ok: false, code: "BUDGET_HARD_STOP", scope: `provider:${provider}`, blockerClass: "FOUNDER", detail: `no cap configured for ${provider}` };
  const p = s.providers[provider] ?? { dayUsd: 0, monthUsd: 0 };
  if (p.dayUsd + wc > caps.dailyUsd) return { ok: false, code: "BUDGET_HARD_STOP", scope: `provider:${provider}:daily`, blockerClass: "FOUNDER", detail: `${provider} daily cap $${caps.dailyUsd}: spent $${p.dayUsd.toFixed(4)} + worst case $${wc.toFixed(4)}` };
  if (p.monthUsd + wc > caps.monthlyUsd) return { ok: false, code: "BUDGET_HARD_STOP", scope: `provider:${provider}:monthly`, blockerClass: "FOUNDER", detail: `${provider} monthly cap $${caps.monthlyUsd}: spent $${p.monthUsd.toFixed(4)} + worst case $${wc.toFixed(4)}` };
  const key = agentKey(task.assignedAgent);
  const ac = config.agents[key] ?? config.agentDefault;
  const a = s.agents[key] ?? { dayUsd: 0, monthUsd: 0 };
  if (a.dayUsd + wc > ac.dailyUsd) return { ok: false, code: "BUDGET_HARD_STOP", scope: `agent:${key}:daily`, blockerClass: "FOUNDER", detail: `agent daily cap $${ac.dailyUsd}: spent $${a.dayUsd.toFixed(4)} + worst case $${wc.toFixed(4)}` };
  if (a.monthUsd + wc > ac.monthlyUsd) return { ok: false, code: "BUDGET_HARD_STOP", scope: `agent:${key}:monthly`, blockerClass: "FOUNDER", detail: `agent monthly cap $${ac.monthlyUsd}: spent $${a.monthUsd.toFixed(4)} + worst case $${wc.toFixed(4)}` };
  return { ok: true, worstCaseUsd: wc };
}

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
