/**
 * CLAUDE CODE PREFLIGHT — prove a run will bill the founder's subscription, or refuse it.
 *
 * Claude Code picks its credential in this order (code.claude.com/docs/en/authentication): cloud-provider flags,
 * ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY (always used in -p mode when present), apiKeyHelper,
 * CLAUDE_CODE_OAUTH_TOKEN, Anthropic profiles, and only then the /login subscription. So a subscription run is
 * guaranteed only when none of the higher sources exists. This module checks all of them and fails closed:
 *
 *   1. none of the API-billing variables is set in the parent environment (refuse rather than silently drop);
 *   2. no settings file supplies apiKeyHelper or those variables;
 *   3. ANTHROPIC_BASE_URL, if set, is exactly https://api.anthropic.com (no proxy or gateway);
 *   4. `claude auth status --json`, run with the scrubbed child environment, reports a claude.ai login on a
 *      first-party Pro/Max/Team/Enterprise subscription.
 *
 * The evidence it returns (CLI version, auth method, provider, plan) goes to the ledger; email and org do not.
 * What it cannot see is claude.ai "usage credits" (overflow billed at API rates) — that is the founder's
 * attestation, recorded separately and required before any run.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REASON } from "../contracts/index.mjs";

/** Variables that would make Claude Code bill an API account or route elsewhere instead of the subscription. */
export const FORBIDDEN_ENV = Object.freeze([
  "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE",
  "ANTHROPIC_FEDERATION_RULE_ID", "ANTHROPIC_ORGANIZATION_ID", "ANTHROPIC_IDENTITY_TOKEN_FILE", "ANTHROPIC_IDENTITY_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY",
  "CLAUDE_CODE_OAUTH_TOKEN",
]);
export const DEFAULT_BASE_URL = "https://api.anthropic.com";
const SUBSCRIPTIONS = new Set(["pro", "max", "team", "enterprise"]);
/** The only parent variables a Claude child process inherits. */
const ENV_ALLOWLIST = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "SHELL", "TERM", "__CF_USER_TEXT_ENCODING"];

/** Locate the claude executable: explicit override first (tests use a fake), then PATH. */
export function resolveClaudeBin(env = process.env) {
  if (env.GTP_CC_CLAUDE_BIN) return env.GTP_CC_CLAUDE_BIN;
  for (const dir of String(env.PATH ?? "").split(path.delimiter)) {
    const p = path.join(dir, "claude");
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch { /* keep looking */ }
  }
  return null;
}

/**
 * The scrubbed environment every Claude child process gets. On the hosted runner (`allowOauthToken`) the founder's
 * subscription arrives as CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`), and that one variable is passed on.
 */
export function childEnv(parent = process.env, { allowOauthToken = false } = {}) {
  const env = {};
  for (const k of ENV_ALLOWLIST) if (parent[k] != null) env[k] = parent[k];
  if (parent.ANTHROPIC_BASE_URL === DEFAULT_BASE_URL) env.ANTHROPIC_BASE_URL = DEFAULT_BASE_URL;
  if (allowOauthToken && parent.CLAUDE_CODE_OAUTH_TOKEN) env.CLAUDE_CODE_OAUTH_TOKEN = parent.CLAUDE_CODE_OAUTH_TOKEN;
  return env;
}

function settingsOverrides(home) {
  const found = [];
  const files = [path.join(home, ".claude/settings.json"), path.join(home, ".claude/settings.local.json"), "/Library/Application Support/ClaudeCode/managed-settings.json"];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    let d;
    try {
      d = JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {
      found.push(`${f}: unreadable`);
      continue;
    }
    if (d.apiKeyHelper) found.push(`${f}: apiKeyHelper`);
    for (const k of Object.keys(d.env ?? {})) if (FORBIDDEN_ENV.includes(k) || k === "ANTHROPIC_BASE_URL") found.push(`${f}: env.${k}`);
  }
  return found;
}

/**
 * @returns {{ ok: boolean, code?: string, detail?: string, evidence: object }}
 */
/**
 * `allowOauthToken` is the hosted-runner variant: CLAUDE_CODE_OAUTH_TOKEN (a subscription token from
 * `claude setup-token`) is then REQUIRED and is the only credential allowed; every API-billing source above it must
 * still be absent. What `claude auth status` reports for a token login is UNVERIFIED until CP-H2, so the runner
 * accepts "claude.ai" or "oauth_token" as the method and records the plan as reported (possibly null).
 */
export function preflight({ env = process.env, bin = resolveClaudeBin(env), home = env.HOME ?? os.homedir(), allowOauthToken = false } = {}) {
  const evidence = { checkedAt: null, cliPath: bin ? path.basename(bin) : null, cliVersion: null, authMethod: null, apiProvider: null, subscriptionType: null, forbiddenEnv: [], settingsOverrides: [], baseUrl: env.ANTHROPIC_BASE_URL ? new URL(env.ANTHROPIC_BASE_URL).origin : "(default)" };
  const fail = (detail) => ({ ok: false, code: REASON.SUBSCRIPTION_AUTH_NOT_CONFIRMED, detail, evidence });

  evidence.forbiddenEnv = FORBIDDEN_ENV.filter((k) => env[k] != null && env[k] !== "" && !(allowOauthToken && k === "CLAUDE_CODE_OAUTH_TOKEN"));
  if (evidence.forbiddenEnv.length) return fail(`API-billing variables are set: ${evidence.forbiddenEnv.join(", ")} (they outrank the subscription)`);
  if (env.ANTHROPIC_BASE_URL && env.ANTHROPIC_BASE_URL !== DEFAULT_BASE_URL) return fail(`ANTHROPIC_BASE_URL points at ${evidence.baseUrl}, not ${DEFAULT_BASE_URL}`);
  evidence.settingsOverrides = settingsOverrides(home);
  if (evidence.settingsOverrides.length) return fail(`settings can override auth: ${evidence.settingsOverrides.join("; ")}`);
  if (!bin) return fail("claude CLI not found on PATH");
  if (allowOauthToken && !env.CLAUDE_CODE_OAUTH_TOKEN) return fail("hosted runner: CLAUDE_CODE_OAUTH_TOKEN (subscription token) is not set");

  const cenv = childEnv(env, { allowOauthToken });
  const version = spawnSync(bin, ["--version"], { env: cenv, encoding: "utf8", timeout: 20_000 });
  evidence.cliVersion = String(version.stdout ?? "").trim().split(/\s+/)[0] || null;
  const status = spawnSync(bin, ["auth", "status", "--json"], { env: cenv, encoding: "utf8", timeout: 20_000 });
  let s;
  try {
    s = JSON.parse(status.stdout);
  } catch {
    return fail(`could not read \`claude auth status\` (exit ${status.status})`);
  }
  evidence.authMethod = s.authMethod ?? null;
  evidence.apiProvider = s.apiProvider ?? null;
  evidence.subscriptionType = s.subscriptionType ?? null;
  if (!s.loggedIn) return fail("Claude Code is not logged in");
  if (allowOauthToken) {
    if (!["claude.ai", "oauth_token"].includes(s.authMethod)) return fail(`auth method is ${s.authMethod}, not a subscription token`);
    if (s.apiProvider !== "firstParty") return fail(`API provider is ${s.apiProvider}, not first-party Anthropic`);
    if (s.subscriptionType != null && !SUBSCRIPTIONS.has(s.subscriptionType)) return fail(`subscription type is ${s.subscriptionType}`);
    evidence.subscriptionType = s.subscriptionType ?? "unreported (OAuth token)";
    return { ok: true, evidence };
  }
  if (s.authMethod !== "claude.ai") return fail(`auth method is ${s.authMethod}, not a claude.ai subscription login`);
  if (s.apiProvider !== "firstParty") return fail(`API provider is ${s.apiProvider}, not first-party Anthropic`);
  if (!SUBSCRIPTIONS.has(s.subscriptionType)) return fail(`subscription type is ${s.subscriptionType}`);
  return { ok: true, evidence };
}
