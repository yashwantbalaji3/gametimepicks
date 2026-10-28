#!/usr/bin/env node
/**
 * FAKE `claude` for offline tests — never contacts anything. Behaviour comes from $HOME/.fake-claude.json (HOME is
 * one of the few variables the orchestrator lets through), and every -p call is logged to
 * $HOME/.fake-claude-calls.jsonl with its argv and the NAMES of the environment variables it received.
 */
import fs from "node:fs";
import path from "node:path";

const home = process.env.HOME;
const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(home, ".fake-claude.json"), "utf8")); } catch { return {}; } })();
const argv = process.argv.slice(2);
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");

if (argv[0] === "--version") { process.stdout.write("9.9.9 (Claude Code fake)\n"); process.exit(0); }
if (argv[0] === "auth" && argv[1] === "status") {
  process.stdout.write(JSON.stringify(cfg.auth ?? { loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "max", email: "x@example.com" }));
  process.exit(0);
}
if (!argv.includes("-p")) process.exit(2);

let prompt = "";
process.stdin.on("data", (d) => (prompt += d));
process.stdin.on("end", async () => {
  const schema = argv[argv.indexOf("--json-schema") + 1] ?? "";
  const mode = schema.includes("testPlan") ? "plan" : "build";
  fs.appendFileSync(path.join(home, ".fake-claude-calls.jsonl"), JSON.stringify({ mode, argv, envKeys: Object.keys(process.env).sort(), cwd: process.cwd(), promptHead: prompt.slice(0, 200) }) + "\n");
  out({ type: "system", subtype: "init", session_id: `fake-${mode}-session`, model: "claude-fake-1", tools: cfg.noStructuredTool ? ["Read", "Grep", "Glob"] : ["Read", "Grep", "Glob", "StructuredOutput"] });
  if (cfg.noStructuredTool) { setInterval(() => {}, 1000); return; }
  if (cfg.budgetFail === mode) {
    // Mirrors the first real failure: an empty attempt, a rejected attempt, then a valid one, then the cap.
    const valid = { summary: "Add copy button", files: [{ path: "command-center/surfaces/console/app.js", change: "button + counter" }], steps: ["edit"], risks: [], testPlan: ["node --test"] };
    for (const input of [{}, { ...valid, files: [{ path: "command-center/surfaces/console/app.js", change: "x".repeat(2100) }] }, valid]) {
      out({ type: "assistant", message: { content: [{ type: "tool_use", name: "StructuredOutput", input }] } });
    }
    out({ type: "result", subtype: "error_max_budget_usd", is_error: true, session_id: "fake-budget", num_turns: 13, total_cost_usd: 1.12, usage: { input_tokens: 17, output_tokens: 11614 }, errors: ["Reached maximum budget ($1)"] });
    process.exit(1);
  }
  if (cfg.auth401) {
    out({ type: "assistant", message: { content: [{ type: "text", text: "Failed to authenticate. API Error: 401 OAuth access token is invalid." }] } });
    out({ type: "result", subtype: "success", is_error: true, session_id: "fake-401", num_turns: 1, total_cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 }, result: "Failed to authenticate. API Error: 401" });
    process.exit(1);
  }
  if (cfg.hang === mode) { out({ type: "assistant", message: { content: [{ type: "text", text: "thinking for a long time" }] } }); setInterval(() => {}, 1000); return; }
  if (mode === "plan") {
    out({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: path.join(process.cwd(), "command-center/surfaces/console/app.js") } }] } });
    const plan = cfg.plan ?? { summary: "Add a copy button and counter", files: [{ path: "command-center/surfaces/console/app.js", change: "render button and counter" }], steps: ["edit renderDecisions"], risks: [], testPlan: ["node --test"] };
    out({ type: "result", subtype: "success", is_error: false, session_id: "fake-plan-session", num_turns: 2, total_cost_usd: 0.11, usage: { input_tokens: 1000, output_tokens: 200 }, structured_output: plan, result: "planned" });
  } else {
    const edits = cfg.edits ?? [{ path: "command-center/surfaces/console/app.js", append: "\n/* fake build edit */\n" }];
    for (const e of edits) {
      fs.mkdirSync(path.dirname(path.join(process.cwd(), e.path)), { recursive: true });
      fs.appendFileSync(path.join(process.cwd(), e.path), e.append);
      out({ type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: path.join(process.cwd(), e.path) } }] } });
    }
    out({ type: "result", subtype: "success", is_error: false, session_id: "fake-build-session", num_turns: 4, total_cost_usd: 0.42, usage: { input_tokens: 5000, output_tokens: 900 }, structured_output: { summary: "Added it", filesChanged: edits.map((e) => e.path), notes: [] }, result: "built" });
  }
  process.exit(0);
});
