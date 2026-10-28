/**
 * THE CLAUDE CODE SEAT — one headless `claude -p` run, bounded, observable, cancellable.
 *
 * Spawned with an argument array (never a shell) and the scrubbed environment from claude-preflight.mjs, so the
 * founder's subscription login is the only credential it can use. The prompt goes in on stdin. Output is
 * `stream-json`: every line becomes a progress event for the CEO console, the final `result` line carries the
 * session id, turns, duration, estimated usage (total_cost_usd — an API-equivalent estimate, not a charge on a
 * subscription) and `structured_output` validated by --json-schema.
 *
 * Permissions are allowlist-only (`--permission-mode dontAsk`): anything not in allowedTools is denied, with no
 * prompt to answer. Settings are limited to the user file (`--setting-sources user`) and MCP servers are off
 * (`--strict-mcp-config` with none given), so nothing outside this call can widen what the run may do.
 *
 * Limits: --max-turns, --max-budget-usd (client-side estimate), a wall-clock timeout, and cancel(). Timeout and
 * Pause send SIGTERM, then SIGKILL after a grace period; Emergency stop sends SIGKILL at once.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Text Claude Code prints when the saved login (or a key) is rejected by the API. `auth status` can't see this. */
export const AUTH_FAILURE = /Failed to authenticate|OAuth access token is invalid|API Error: 401|Invalid API key|Please run \/login|login expired/i;

const clip = (s, n = 140) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** One readable line per tool call, for the console. */
export function describeToolUse(name, input = {}) {
  const rel = (p) => String(p ?? "").replace(/^.*?(command-center\/)/, "$1");
  switch (name) {
    case "Read": return `Reading ${rel(input.file_path)}`;
    case "Grep": return `Searching for “${clip(input.pattern, 60)}”${input.path ? ` in ${rel(input.path)}` : ""}`;
    case "Glob": return `Listing ${clip(input.pattern, 80)}`;
    case "Edit": return `Editing ${rel(input.file_path)}`;
    case "MultiEdit": return `Editing ${rel(input.file_path)} (${(input.edits ?? []).length} changes)`;
    case "Write": return `Writing ${rel(input.file_path)}`;
    case "Bash": return `Running ${clip(input.command, 100)}`;
    default: return `${name}`;
  }
}

/** Map one stream-json event to zero or more progress lines. */
export function progressLines(ev) {
  if (ev.type === "system" && ev.subtype === "init") return [`Session started · model ${ev.model ?? "?"}`];
  if (ev.type === "assistant") {
    const out = [];
    for (const c of ev.message?.content ?? []) {
      if (c.type === "tool_use") out.push(describeToolUse(c.name, c.input));
      else if (c.type === "text" && c.text?.trim()) out.push(`Claude: ${clip(c.text)}`);
    }
    return out;
  }
  if (ev.type === "user") {
    const denied = (ev.message?.content ?? []).filter((c) => c.type === "tool_result" && c.is_error && /permission|denied|not allowed/i.test(JSON.stringify(c.content)));
    return denied.map(() => "A tool call was denied by the permission rules");
  }
  if (ev.type === "result") return [`Finished · ${ev.subtype}${ev.num_turns != null ? ` · ${ev.num_turns} turns` : ""}`];
  return [];
}

/**
 * Start one run. Returns { done: Promise<RunResult>, cancel(reason, { immediate }) }.
 *
 * @param {{ bin: string, cwd: string, env: object, prompt: string, schema: object, allowedTools: string[],
 *           disallowedTools: string[], maxTurns: number, maxBudgetUsd: number, timeoutMs: number,
 *           killGraceMs?: number, rawLogFile?: string, onProgress?: (line:string) => void }} o
 */
/**
 * Fixed environment additions for every run (documented in code.claude.com/docs/en/env-vars): keep the founder's
 * auto memory and CLAUDE.md files, cron tools and git workflow instructions out of a bounded task's context.
 */
export const RUN_ENV = Object.freeze({
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
  CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1",
  CLAUDE_CODE_DISABLE_CRON: "1",
  CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS: "1",
});

export function startClaudeRun(o) {
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", "dontAsk",
    "--setting-sources", "user",
    "--strict-mcp-config",
    "--json-schema", JSON.stringify(o.schema),
    "--allowedTools", o.allowedTools.join(","),
    "--disallowedTools", o.disallowedTools.join(","),
    "--max-turns", String(o.maxTurns),
    "--max-budget-usd", String(o.maxBudgetUsd),
    ...(o.model ? ["--model", o.model] : []),
    ...(o.effort ? ["--effort", o.effort] : []),
    // Only these built-in tools are even defined for the model (smaller prompt, nothing to wander into).
    ...(o.tools ? ["--tools", o.tools.join(",")] : []),
  ];
  const started = Date.now();
  const child = spawn(o.bin, args, { cwd: o.cwd, env: { ...o.env, ...RUN_ENV }, stdio: ["pipe", "pipe", "pipe"] });
  if (o.rawLogFile) fs.mkdirSync(path.dirname(o.rawLogFile), { recursive: true });
  const raw = o.rawLogFile ? fs.createWriteStream(o.rawLogFile, { flags: "a" }) : null;

  let buf = "";
  let stderr = "";
  let init = null;
  let result = null;
  let ended = null; // { code, detail }
  let authFailed = null;
  /** The last StructuredOutput call Claude made, kept for diagnostics if the run fails after it. */
  let lastStructuredAttempt = null;
  let structuredAttempts = 0;
  let reads = 0;
  let killTimer = null;

  const stop = (code, detail, immediate) => {
    if (ended) return;
    ended = { code, detail };
    try { child.kill(immediate ? "SIGKILL" : "SIGTERM"); } catch { /* already gone */ }
    if (!immediate) killTimer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* gone */ } }, o.killGraceMs ?? 10_000);
  };
  const timer = setTimeout(() => stop("RUN_TIMEOUT", `no result after ${Math.round(o.timeoutMs / 1000)} s`, false), o.timeoutMs);

  child.stdout.on("data", (chunk) => {
    raw?.write(chunk);
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type === "system" && ev.subtype === "init") {
        init = ev;
        // --json-schema needs the StructuredOutput tool. If a flag combination removed it, stop now (before
        // the model spends anything) instead of letting the run fail at the end.
        if (o.schema && Array.isArray(ev.tools) && !ev.tools.includes("StructuredOutput")) {
          stop("STRUCTURED_OUTPUT_UNAVAILABLE", `the session started without the StructuredOutput tool (tools: ${ev.tools.join(", ")})`, true);
        }
      }
      for (const c of ev.type === "assistant" ? ev.message?.content ?? [] : []) {
        if (c.type === "tool_use" && c.name === "StructuredOutput") {
          structuredAttempts += 1;
          lastStructuredAttempt = c.input ?? null;
        }
        if (c.type === "tool_use" && (c.name === "Read" || c.name === "Grep" || c.name === "Glob")) reads += 1;
      }
      if (ev.type === "result") result = ev;
      for (const c of ev.type === "assistant" ? ev.message?.content ?? [] : []) {
        if (c.type === "text" && AUTH_FAILURE.test(c.text)) authFailed = clip(c.text, 200);
      }
      if (ev.type === "result" && typeof ev.result === "string" && AUTH_FAILURE.test(ev.result)) authFailed ??= clip(ev.result, 200);
      for (const l of progressLines(ev)) o.onProgress?.(l);
    }
  });
  child.stderr.on("data", (d) => {
    stderr = (stderr + d).slice(-4000);
  });
  child.stdin.on("error", () => { /* the process may exit before reading stdin */ });
  child.stdin.end(o.prompt);

  const done = new Promise((resolve) => {
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      raw?.end();
      resolve({
        ok: !ended && !authFailed && exitCode === 0 && result && !result.is_error,
        endedBy: ended?.code ?? (authFailed ? "AUTH_FAILED" : null),
        endedDetail: ended?.detail ?? (authFailed ? `Claude Code's saved login was rejected by the API (${authFailed}). Nothing was billed. Fix: in Terminal run \`claude auth login\`, sign in with your Max account, then press "Run preflight now".` : null),
        exitCode,
        signal,
        durationMs: Date.now() - started,
        sessionId: result?.session_id ?? init?.session_id ?? null,
        model: init?.model ?? null,
        requestedModel: o.model ?? null,
        effort: o.effort ?? null,
        tools: init?.tools ?? null,
        structuredAttempts,
        lastStructuredAttempt,
        lookups: reads,
        budgetErrors: result?.errors ?? null,
        subtype: result?.subtype ?? null,
        isError: result?.is_error ?? null,
        numTurns: result?.num_turns ?? null,
        estUsageUsd: typeof result?.total_cost_usd === "number" ? result.total_cost_usd : null,
        usage: result?.usage ? { inputTokens: result.usage.input_tokens ?? null, outputTokens: result.usage.output_tokens ?? null, cacheReadTokens: result.usage.cache_read_input_tokens ?? null } : null,
        structured: result?.structured_output ?? null,
        resultText: typeof result?.result === "string" ? result.result.slice(0, 4000) : null,
        stderrTail: stderr.slice(-1500),
      });
    });
  });

  return {
    pid: child.pid,
    args,
    done,
    cancel: (reason = "cancelled", { immediate = false } = {}) => stop("RUN_CANCELLED", reason, immediate),
  };
}
