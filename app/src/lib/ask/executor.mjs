/**
 * THE TOOL EXECUTOR — where model output stops being language and becomes an authorised action.
 *
 * Every call arriving here was written by a language model, which means it arrives with exactly the
 * trust level of a query string. The executor therefore re-derives permission from first principles
 * on every single call, and never from anything the model asserted:
 *
 *   1. the tool NAME must be in the registry              → UNKNOWN_TOOL
 *   2. the ARGUMENTS must satisfy the closed field spec    → UNKNOWN_ARGUMENT / INVALID_ARGUMENT
 *   3. the BUDGET must still allow one more call           → BUDGET_EXCEEDED
 *   4. the HANDLER runs against injected data only         → no ambient filesystem, no ambient network
 *
 * Step 2 is the one that matters most and is easiest to get wrong. A provider's "structured output"
 * feature is a claim about a happy path, not a guarantee, and even a perfectly-behaved model will
 * occasionally emit a key that once existed. Silently ignoring an unrecognised argument is precisely
 * how `includePrivate: true` ends up looking like it worked, so an unknown key FAILS the call.
 *
 * DE-DUPLICATION IS A CORRECTNESS FEATURE, NOT AN OPTIMISATION (§165, §166). A plan that calls Game
 * Finder twice with the same arguments should get one answer with one evidence id, or the writer sees
 * "79 games" twice and may describe them as two findings.
 */
import { ASK_BUDGET, ASK_ERROR, ASK_STATUS } from "./contract.mjs";
import { ASK_TOOL_NAMES, toolDef } from "./registry.mjs";
import { validateArgs } from "./schema.mjs";

import { getSeasonExplorer, runGameFinder, runPlayerResearchQuery } from "./tools/research.mjs";
import { calculate, getGameTimeNow, getPlayerRecentGames, resolveEntity, searchGameTimeHelp } from "./tools/product.mjs";
import { getMatchupContext, getPlayerComparison, getTeamComparison } from "./tools/compare.mjs";
import { getParlayCandidates, getPublishedForecasts } from "./tools/forecast.mjs";
import { getLiveSlate } from "./tools/live.mjs";
import { getForecastRecord, getPendingResults, getProductRecord, getRecentResults } from "./tools/results.mjs";

/**
 * The handler table. Its keys are asserted against the registry at module load, so a tool that is
 * declared but not implemented — or implemented but not declared — fails immediately and loudly rather
 * than at the moment a reader asks the question only that tool could answer.
 */
const HANDLERS = {
  getGameTimeNow,
  resolveEntity,
  runGameFinder,
  runPlayerResearchQuery,
  getSeasonExplorer,
  getPlayerRecentGames,
  getTeamComparison,
  getPlayerComparison,
  getMatchupContext,
  getPublishedForecasts,
  getParlayCandidates,
  getLiveSlate,
  getProductRecord,
  getForecastRecord,
  getRecentResults,
  getPendingResults,
  searchGameTimeHelp,
  calculate,
};

{
  const declared = new Set(ASK_TOOL_NAMES);
  const implemented = new Set(Object.keys(HANDLERS));
  const missing = [...declared].filter((n) => !implemented.has(n));
  const extra = [...implemented].filter((n) => !declared.has(n));
  if (missing.length || extra.length) {
    throw new Error(`ask executor: registry and handlers disagree — missing [${missing}] extra [${extra}]`);
  }
}

/** A stable key for de-duplication: the tool plus its NORMALISED arguments, in sorted key order. */
function callKey(name, args) {
  const sorted = Object.keys(args ?? {}).sort().map((k) => `${k}=${JSON.stringify(args[k])}`);
  return `${name}(${sorted.join(",")})`;
}

const refusal = (tool, code, detail) => ({
  schemaVersion: 1,
  tool,
  status: ASK_STATUS.ERROR,
  error: code,
  detail: detail ?? null,
  data: null,
});

/**
 * Create an executor for ONE user turn.
 *
 * `ctx` carries the injected capabilities a handler may use — the asset loader's turn, the clock, the
 * live transport — and nothing else. A handler has no way to read a file or open a socket except
 * through what is handed to it here, which is what makes "Ask has no file tool" a structural statement
 * rather than a policy.
 */
export function makeExecutor(ctx) {
  let calls = 0;
  const results = new Map(); // callKey → envelope
  const order = [];

  return {
    get spent() {
      return { calls, unique: results.size };
    },

    /** Every envelope produced this turn, in the order it was first produced. */
    get evidence() {
      return order.map((k) => results.get(k));
    },

    /**
     * Execute one validated-or-refused tool call.
     * @param {{name: string, arguments?: object}} call as the planner emitted it
     */
    async run(call) {
      const name = call?.name;
      const def = toolDef(name);
      // An unknown tool is refused by NAME LOOKUP, not by a list of forbidden names — a name that is
      // not in the registry cannot be executed, whatever it is called.
      if (!def) return refusal(String(name ?? "unknown").slice(0, 40), ASK_ERROR.UNKNOWN_TOOL, null);

      const checked = validateArgs(def.args, call.arguments);
      if (!checked.ok) return refusal(name, checked.code, checked.detail);

      const key = callKey(name, checked.value);
      if (results.has(key)) {
        // Identical call, identical answer, SAME evidence id. The writer must not see one fact twice.
        return results.get(key);
      }

      if (calls >= ASK_BUDGET.maxToolCalls) return refusal(name, ASK_ERROR.BUDGET_EXCEEDED, `${ASK_BUDGET.maxToolCalls} tool calls`);
      calls += 1;

      let out;
      try {
        out = await withTimeout(HANDLERS[name](checked.value, ctx), ASK_BUDGET.toolTimeoutMs);
      } catch (e) {
        /*
         * A handler that throws is a DEFECT, and the turn continues without that tool rather than
         * failing the whole answer — but the message is truncated and never echoed to the reader
         * verbatim, because a stack-shaped string in a chat bubble is both useless and a leak risk.
         */
        out = { status: ASK_STATUS.ERROR, error: ASK_ERROR.UNSUPPORTED_DATA, detail: String(e?.message ?? e).slice(0, 160) };
      }

      const envelope = {
        schemaVersion: 1,
        tool: name,
        toolVersion: def.version,
        kind: def.kind,
        status: out.status ?? ASK_STATUS.OK,
        error: out.error ?? null,
        detail: out.detail ?? null,
        arguments: checked.value,
        data: strip(out),
        links: Array.isArray(out.links) ? out.links : [],
        cost: out.cost ?? null,
      };

      results.set(key, envelope);
      order.push(key);
      return envelope;
    },

    /**
     * Run a plan's calls with bounded parallelism and explicit dependency ordering.
     *
     * A call that names another call's `id` in `after` is sequenced behind it. Everything else in a
     * wave runs together, capped at `maxParallelTools` — uncontrolled concurrency against the asset
     * loader is how one question turns into a burst of upstream reads (§167).
     */
    async runPlan(calls_) {
      const byId = new Map(calls_.map((c, i) => [c.id ?? `c${i}`, c]));
      const done = new Set();
      const out = [];
      let guard = 0;

      while (done.size < byId.size) {
        if (guard += 1, guard > ASK_BUDGET.maxToolCalls + 2) break; // a cycle in `after` must not hang the turn
        const ready = [...byId.entries()]
          .filter(([id, c]) => !done.has(id) && (c.after ?? []).every((d) => done.has(d)))
          .slice(0, ASK_BUDGET.maxParallelTools);
        // Nothing ready and nothing done means the dependencies are unsatisfiable; stop rather than spin.
        if (!ready.length) break;
        const wave = await Promise.all(ready.map(([, c]) => this.run(c)));
        ready.forEach(([id]) => done.add(id));
        out.push(...wave);
      }
      return out;
    },
  };
}

/** The handler's own payload minus the envelope fields, so nothing is carried twice. */
function strip(out) {
  const { status, error, detail, links, cost, ...rest } = out;
  return rest;
}

/** A handler that never settles must not hold the whole turn open. */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("tool timed out")), ms)),
  ]);
}
