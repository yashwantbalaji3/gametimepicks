#!/usr/bin/env node
/**
 * Deployment preflight for the private Command Center. Checks configuration WITHOUT printing any value: each line says
 * a name, PASS/FAIL/WARN, and why. Run on the Mac with the values in the environment (e.g. `vercel env pull` into a
 * file you delete after), or with --probe to also check the live hostname.
 *
 *   node command-center/deploy/preflight.mjs --target vercel  [--env-file .env.preflight] [--staging]
 *   node command-center/deploy/preflight.mjs --target github  [--env-file …]
 *   node command-center/deploy/preflight.mjs --probe https://team.gametimepicks.yashwantbalaji.com
 *   node command-center/deploy/preflight.mjs --remote [--vercel-project gtp-team] [--repo yashwantbalaji3/gtp-ops]
 *
 * --remote asks GitHub (gh) and Vercel (CLI) for setting NAMES, types and environments only; no value is read.
 *
 * --staging asserts the deployment cannot publish: no publisher workflow, so the cron never dispatches a send.
 */
import fs from "node:fs";
import dns from "node:dns/promises";
import { spawnSync } from "node:child_process";

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const HOST = "team.gametimepicks.yashwantbalaji.com";
const results = [];
const out = (level, name, why) => results.push({ level, name, why });

/** Parse KEY=VALUE lines (quotes stripped); the file is read, never echoed. */
export function parseEnvFile(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}
const b64len = (v) => { try { return Buffer.from(v, "base64").length; } catch { return 0; } };
const dbRole = (v) => { try { return decodeURIComponent(new URL(v).username); } catch { return null; } };

/** @returns {{level: string, name: string, why: string}[]} */
export function checkEnv(target, env, { staging = false } = {}) {
  results.length = 0;
  const need = (k, test, why) => (!env[k] ? out("FAIL", k, "not set") : test && !test(env[k]) ? out("FAIL", k, why) : out("PASS", k, "set"));
  const forbid = (k, why) => env[k] && out("FAIL", k, `must not be set: ${why}`);
  if (target === "vercel") {
    need("DATABASE_URL", (v) => dbRole(v) === "gtp_cc_app" && /sslmode=require/.test(v), "must be the gtp_cc_app role over sslmode=require (never the owner)");
    need("GTP_CC_ORIGIN", (v) => v === `https://${HOST}`, `must be exactly https://${HOST}`);
    need("GTP_CC_RP_ID", (v) => v === HOST, `must be exactly ${HOST} (passkeys are bound to it)`);
    need("GH_DISPATCH_TOKEN", (v) => /^github_pat_/.test(v), "use a fine-grained PAT (github_pat_…) limited to the ops repo, Actions read/write");
    need("GH_OPS_OWNER"); need("GH_OPS_REPO");
    need("CRON_SECRET", (v) => v.length >= 32, "32+ characters");
    if (env.GTP_CC_X_CLIENT_ID || env.GTP_CC_SECRET_KEY) need("GTP_CC_SECRET_KEY", (v) => b64len(v) === 32, "32 random bytes, base64");
    if (!env.BLOB_STORE_ID && !env.BLOB_READ_WRITE_TOKEN) out("FAIL", "BLOB_STORE_ID", "connect the PRIVATE Blob store to the project (otherwise images go into Postgres)");
    else out("PASS", "BLOB_STORE_ID", "Blob store connected");
    if (env.GTP_CC_SETUP_TOKEN_SHA256) out("WARN", "GTP_CC_SETUP_TOKEN_SHA256", "set: remove it once your first passkey is registered");
    for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "OPENAI_API_KEY", "XAI_API_KEY"]) forbid(k, "no model runs on the web app");
    forbid("DATABASE_URL_OWNER", "the owner role stays on the Mac");
    if (staging) {
      if (env.GH_PUBLISHER_WORKFLOW) out("FAIL", "GH_PUBLISHER_WORKFLOW", "staging must not dispatch the publisher: unset it");
      else out("PASS", "GH_PUBLISHER_WORKFLOW", "unset: the cron cannot start a send");
    } else if (!env.GH_PUBLISHER_WORKFLOW) out("WARN", "GH_PUBLISHER_WORKFLOW", "unset: hosted scheduled publishing is off (correct until the cutover is approved)");
  } else if (target === "github") {
    need("CC_WORKER_DATABASE_URL", (v) => dbRole(v) === "gtp_cc_worker", "must be the gtp_cc_worker role");
    need("CC_READER_DATABASE_URL", (v) => dbRole(v) === "gtp_cc_reader", "must be the gtp_cc_reader role");
    need("CC_PUBLISHER_DATABASE_URL", (v) => dbRole(v) === "gtp_cc_publisher", "must be the gtp_cc_publisher role");
    need("CC_BLOB_READ_WRITE_TOKEN", (v) => /^vercel_blob_rw_/.test(v), "the private store's read-write token (vercel_blob_rw_…)");
    need("GTP_CC_SECRET_KEY", (v) => b64len(v) === 32, "32 random bytes, base64 (same as Vercel)");
    forbid("ANTHROPIC_API_KEY", "Claude Code runs on the subscription token only");
  } else out("FAIL", "--target", "vercel or github");
  return [...results];
}

/** The live hostname: DNS answers, HTTPS works, the security headers are there, nothing is served unauthenticated. */
export async function probe(origin) {
  results.length = 0;
  const host = new URL(origin).hostname;
  try {
    const c = await dns.resolveCname(host).catch(() => []);
    const a = await dns.resolve4(host).catch(() => []);
    if (!c.length && !a.length) out("FAIL", "DNS", `${host} does not resolve yet (add the record Vercel shows for this domain)`);
    else out("PASS", "DNS", c.length ? `CNAME → ${c.join(", ")}` : `A → ${a.join(", ")}`);
  } catch (err) { out("FAIL", "DNS", String(err.message)); }
  try {
    const r = await fetch(`${origin}/api/state`, { redirect: "manual" });
    out(r.status === 401 ? "PASS" : "FAIL", "unauthenticated /api/state", `HTTP ${r.status} (must be 401)`);
    const h = r.headers;
    out(/max-age=\d{7,}/.test(h.get("strict-transport-security") ?? "") ? "PASS" : "FAIL", "HSTS", h.get("strict-transport-security") ? "present" : "missing");
    out(h.get("x-frame-options") === "DENY" ? "PASS" : "FAIL", "X-Frame-Options", h.get("x-frame-options") ?? "missing");
    out(h.get("content-security-policy") ? "PASS" : "FAIL", "Content-Security-Policy", h.get("content-security-policy") ? "present" : "missing");
    const cron = await fetch(`${origin}/api/cron/publish`, { redirect: "manual" });
    out([401, 403, 404].includes(cron.status) ? "PASS" : "FAIL", "cron without its secret", `HTTP ${cron.status}`);
  } catch (err) { out("FAIL", "HTTPS", `${origin}: ${String(err.cause?.code ?? err.message)}`); }
  return [...results];
}

/** The live operator console (protected internal build of the public site, docs/ADMIN_DEPLOYMENT_GTP_OPS.md). Never this app's host. */
export const OPERATOR_CONSOLE_PROJECT = "gtp-ops";
const MODEL_KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "OPENAI_API_KEY", "XAI_API_KEY"];

/**
 * Names-only check of what is configured where. `vercelEnv` is [{key, type, target[]}] (no values), `ghSecrets` and
 * `ghVars` are name lists. Staging is the default: the publisher workflow must be absent.
 */
export function checkRemote({ project, vercelEnv, ghSecrets, ghVars, staging = true }) {
  results.length = 0;
  if (project === OPERATOR_CONSOLE_PROJECT) out("FAIL", "Vercel project", `${project} is the protected operator console; the Command Center needs its own project`);
  const v = new Map(vercelEnv.map((e) => [e.key, e]));
  const prod = (e) => (e.target ?? []).includes("production");
  const vNeed = (k, { secret = false, why = "" } = {}) => {
    const e = v.get(k);
    if (!e || !prod(e)) return out("FAIL", `Vercel ${k}`, `not set for Production${why ? ` (${why})` : ""}`);
    if (secret && e.type !== "sensitive") return out("WARN", `Vercel ${k}`, `stored as ${e.type}: re-add it as Sensitive`);
    if (secret && (e.target ?? []).some((t) => t !== "production")) return out("WARN", `Vercel ${k}`, "also on Preview/Development: keep secrets Production-only");
    out("PASS", `Vercel ${k}`, secret ? "sensitive, Production" : "Production");
  };
  vNeed("DATABASE_URL", { secret: true });
  for (const k of ["GTP_CC_ORIGIN", "GTP_CC_RP_ID", "GH_OPS_OWNER", "GH_OPS_REPO"]) vNeed(k);
  for (const k of ["GH_DISPATCH_TOKEN", "CRON_SECRET", "GTP_CC_SECRET_KEY"]) vNeed(k, { secret: true });
  if (v.has("BLOB_STORE_ID") || v.has("BLOB_READ_WRITE_TOKEN")) out("PASS", "Vercel Blob store", "connected");
  else out("FAIL", "Vercel Blob store", "connect the PRIVATE Blob store to this project (Production)");
  if (v.has("GTP_CC_SETUP_TOKEN_SHA256")) out("WARN", "Vercel GTP_CC_SETUP_TOKEN_SHA256", "set: remove it once your first passkey is registered");
  for (const k of [...MODEL_KEYS, "DATABASE_URL_OWNER"]) if (v.has(k)) out("FAIL", `Vercel ${k}`, "must not be on the web app");
  if (staging) out(v.has("GH_PUBLISHER_WORKFLOW") ? "FAIL" : "PASS", "Vercel GH_PUBLISHER_WORKFLOW", v.has("GH_PUBLISHER_WORKFLOW") ? "set: hosted publishing could be dispatched; remove it" : "absent: hosted publishing cannot be dispatched");
  for (const k of ["CC_WORKER_DATABASE_URL", "CC_READER_DATABASE_URL", "CC_PUBLISHER_DATABASE_URL", "CC_BLOB_READ_WRITE_TOKEN", "GTP_CC_SECRET_KEY"]) {
    out(ghSecrets.includes(k) ? "PASS" : "FAIL", `GitHub secret ${k}`, ghSecrets.includes(k) ? "set" : "not set");
  }
  if (ghSecrets.includes("ANTHROPIC_API_KEY")) out("FAIL", "GitHub secret ANTHROPIC_API_KEY", "must not exist (Claude Code runs on the subscription token only)");
  if (!ghSecrets.includes("CLAUDE_CODE_OAUTH_TOKEN")) out("WARN", "GitHub secret CLAUDE_CODE_OAUTH_TOKEN", "not set: hosted queue builds stay off (CP-H2)");
  for (const k of ["GTP_CC_X_CLIENT_ID", "GTP_CC_X_HANDLE"]) if (!ghVars.includes(k)) out("WARN", `GitHub variable ${k}`, "not set: needed before the publisher's first dry run");
  return [...results];
}

/** Reads names/types/targets from Vercel and GitHub. Values are never requested or kept. */
export function fetchRemote({ project, repo, cli = "vercel@64.1.0" }) {
  const v = spawnSync("npx", ["-y", cli, "api", `/v9/projects/${encodeURIComponent(project)}`], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (v.status !== 0) throw new Error(`Vercel: can't read project ${project} (signed in? npx ${cli} whoami)`);
  const vercelEnv = (JSON.parse(v.stdout).env ?? []).map((e) => ({ key: e.key, type: e.type, target: e.target ?? [] }));
  const names = (args) => {
    const r = spawnSync("gh", [...args, "--repo", repo, "--json", "name"], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`GitHub: can't list ${args[0]}s for ${repo}`);
    return JSON.parse(r.stdout).map((x) => x.name);
  };
  return { project, vercelEnv, ghSecrets: names(["secret", "list"]), ghVars: names(["variable", "list"]) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = arg("--env-file");
  const env = file ? parseEnvFile(fs.readFileSync(file, "utf8")) : process.env; // --target only
  const rows = arg("--probe") ? await probe(arg("--probe"))
    : process.argv.includes("--remote") ? checkRemote(fetchRemote({ project: arg("--vercel-project") ?? "gtp-team", repo: arg("--repo") ?? "yashwantbalaji3/gtp-ops" }))
    : checkEnv(arg("--target"), env, { staging: process.argv.includes("--staging") });
  for (const r of rows) console.log(`${r.level.padEnd(4)}  ${r.name.padEnd(28)} ${r.why}`);
  const fails = rows.filter((r) => r.level === "FAIL").length;
  console.log(fails ? `\n${fails} problem(s). Nothing was changed.` : "\nAll checks passed. Nothing was changed.");
  process.exitCode = fails ? 1 : 0;
}
