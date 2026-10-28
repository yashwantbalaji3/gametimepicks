/**
 * ENGINEERING CONTRACTS — the artifacts that carry one task from a ChatGPT spec to a kept or discarded change.
 *
 *   engineering-spec     written by the Prompt Architect (ChatGPT via the manual seat)      → gate G1
 *   implementation-plan  written by Claude Code (read-only run, --json-schema enforced)      → gate G2
 *   engineering-result   written by Claude Code (build run in the isolated working copy)
 *   verification         produced by the orchestrator itself: diff, scope, tests, screenshots → gate G3
 *
 * The same JSON Schemas are handed to Claude Code with --json-schema and re-checked here, because the CLI's
 * validation is the provider's and this one is ours. `validateSchema` is a deliberately small subset of JSON
 * Schema (object/array/string/number/boolean, required, properties, items, min/max) — enough for these shapes.
 */

/** Edits are allowed only under these prefixes (repo-relative, POSIX). Everything else is out of scope. */
export const ALLOWED_PREFIXES = Object.freeze(["command-center/surfaces/console/", "command-center/tests/"]);

export const inScope = (p) => ALLOWED_PREFIXES.some((pre) => String(p).replace(/^\.\//, "").startsWith(pre));

const str = { type: "string", minLength: 1, maxLength: 2000 };
const strList = (min = 0, max = 30) => ({ type: "array", items: str, minItems: min, maxItems: max });

export const ENGINEERING_SPEC_SCHEMA = Object.freeze({
  type: "object",
  required: ["objective", "userStories", "constraints", "filesInScope", "tests", "acceptanceCriteria", "nonGoals"],
  properties: {
    objective: str,
    userStories: strList(1),
    constraints: strList(1),
    filesInScope: strList(1),
    tests: strList(1),
    acceptanceCriteria: strList(1),
    nonGoals: strList(0),
  },
});

export const IMPLEMENTATION_PLAN_SCHEMA = Object.freeze({
  type: "object",
  required: ["summary", "files", "steps", "risks", "testPlan"],
  additionalProperties: false,
  properties: {
    summary: str,
    files: {
      type: "array", minItems: 1, maxItems: 12,
      items: { type: "object", required: ["path", "change"], additionalProperties: false, properties: { path: str, change: str } },
    },
    steps: strList(1),
    risks: strList(0),
    testPlan: strList(1),
  },
});

export const ENGINEERING_RESULT_SCHEMA = Object.freeze({
  type: "object",
  required: ["summary", "filesChanged", "notes"],
  additionalProperties: false,
  properties: {
    summary: str,
    filesChanged: strList(0, 40),
    notes: strList(0),
  },
});

/** Validate `value` against the small schema subset above. Returns { ok, errors }. */
export function validateSchema(schema, value, where = "$") {
  const errors = [];
  const t = schema.type;
  if (t === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, errors: [`${where}: expected object`] };
    for (const k of schema.required ?? []) if (!(k in value)) errors.push(`${where}.${k}: required`);
    for (const [k, sub] of Object.entries(schema.properties ?? {})) {
      if (k in value) errors.push(...validateSchema(sub, value[k], `${where}.${k}`).errors);
    }
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) if (!(k in (schema.properties ?? {}))) errors.push(`${where}.${k}: not allowed`);
    }
  } else if (t === "array") {
    if (!Array.isArray(value)) return { ok: false, errors: [`${where}: expected array`] };
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${where}: at least ${schema.minItems} item(s)`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${where}: at most ${schema.maxItems} items`);
    value.forEach((v, i) => errors.push(...validateSchema(schema.items, v, `${where}[${i}]`).errors));
  } else if (t === "string") {
    if (typeof value !== "string") errors.push(`${where}: expected string`);
    else {
      if (schema.minLength != null && value.length < schema.minLength) errors.push(`${where}: empty`);
      if (schema.maxLength != null && value.length > schema.maxLength) errors.push(`${where}: longer than ${schema.maxLength}`);
    }
  } else if (t === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${where}: expected number`);
  } else if (t === "boolean") {
    if (typeof value !== "boolean") errors.push(`${where}: expected boolean`);
  }
  return { ok: errors.length === 0, errors };
}

/** A plan may only name files inside the allowed prefixes. */
export function planScope(plan) {
  const outside = (plan?.files ?? []).map((f) => f.path).filter((p) => !inScope(p));
  return { ok: outside.length === 0, outside };
}

/** Execution limits per Claude Code run (founder-approved M2 envelope). */
export const RUN_LIMITS = Object.freeze({
  // model/effort: the first real plan run used the CLI default (claude-opus-4-7) and spent $1.12 estimated in 13
  // turns. A bounded, context-packed plan does not need the largest model; `sonnet` at medium effort is the
  // recommended default (founder can switch back per run). The $1 / $3 caps are unchanged.
  plan: { timeoutMs: 10 * 60_000, maxTurns: 10, maxBudgetUsd: 1, model: "sonnet", effort: "medium" },
  build: { timeoutMs: 15 * 60_000, maxTurns: 40, maxBudgetUsd: 3, model: "sonnet", effort: "medium" },
  /** Estimated usage across every Claude Code run of one command. */
  commandMaxEstUsageUsd: 5,
  /** Grace between SIGTERM and SIGKILL on Pause / timeout; Emergency stop skips it. */
  killGraceMs: 10_000,
});
