#!/usr/bin/env node
/**
 * Sets the hosted Command Center's remaining settings, without printing or storing any value:
 *
 *   node command-center/deploy/configure-hosted.mjs --vercel-project gtp-team                     config + generated secrets
 *   node command-center/deploy/configure-hosted.mjs --vercel-project gtp-team --dispatch-token    + the GitHub PAT (hidden prompt)
 *   node command-center/deploy/configure-hosted.mjs --vercel-project gtp-team --blob-token        + the Blob token for Actions (hidden prompt)
 *   node command-center/deploy/configure-hosted.mjs --vercel-project gtp-team --setup-token       + a one-time passkey setup token: its
 *        sha256 goes to Vercel; the token itself is shown ONCE, only in your own Terminal (refused when not a terminal)
 *   node command-center/deploy/configure-hosted.mjs --vercel-project gtp-team --blob-from-vercel  + the same token, copied from the project's
 *        Blob connection straight into GitHub (pulled to a private temp file that is deleted at once; never shown)
 *
 * Only ADDS what is missing (names are read first; nothing existing is overwritten):
 *   Vercel Production   GTP_CC_ORIGIN, GTP_CC_RP_ID, GH_OPS_OWNER, GH_OPS_REPO, GH_WORKER_WORKFLOW (plain config);
 *                       CRON_SECRET and GTP_CC_SECRET_KEY (random, Sensitive); GH_DISPATCH_TOKEN (you paste it)
 *   GitHub gtp-ops      GTP_CC_SECRET_KEY (the SAME random value, generated once for both), CC_BLOB_READ_WRITE_TOKEN
 * Never sets GH_PUBLISHER_WORKFLOW (hosted publishing stays off) and refuses the operator console project.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseEnvFile } from "./preflight.mjs";
import { spawnSync } from "node:child_process";
import { OPERATOR_CONSOLE_PROJECT, fetchRemote, checkRemote } from "./preflight.mjs";
import { hiddenPrompt } from "./owner-url.mjs";

export const ORIGIN_HOST = "team.gametimepicks.yashwantbalaji.com";
export const REPO = "yashwantbalaji3/gtp-ops";
const CLI = "vercel@64.1.0";
export const PLAIN = {
  GTP_CC_ORIGIN: `https://${ORIGIN_HOST}`,
  GTP_CC_RP_ID: ORIGIN_HOST,
  GH_OPS_OWNER: "yashwantbalaji3",
  GH_OPS_REPO: "gtp-ops",
  GH_WORKER_WORKFLOW: "cc-worker.yml",
};
const NEVER = new Set(["GH_PUBLISHER_WORKFLOW", "DATABASE_URL_OWNER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "XAI_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"]);

/**
 * Decides what to add, from names only. A secret key present on just one side can't be copied (its value is
 * unreadable), so that is refused rather than silently diverging.
 * @returns {{vercel: {name: string, kind: string}[], github: {name: string, kind: string}[], refuse: string[]}}
 */
export function planConfig({ project, vercelEnv, ghSecrets }, { dispatchToken = false, blobToken = false } = {}) {
  const refuse = [];
  if (project === OPERATOR_CONSOLE_PROJECT) refuse.push(`${project} is the protected operator console: use the Command Center's own project`);
  const has = new Set(vercelEnv.filter((e) => (e.target ?? []).includes("production")).map((e) => e.key));
  const vercel = [];
  const github = [];
  for (const name of Object.keys(PLAIN)) if (!has.has(name)) vercel.push({ name, kind: "plain" });
  if (!has.has("CRON_SECRET")) vercel.push({ name: "CRON_SECRET", kind: "random" });
  const keyV = has.has("GTP_CC_SECRET_KEY");
  const keyG = ghSecrets.includes("GTP_CC_SECRET_KEY");
  if (!keyV && !keyG) { vercel.push({ name: "GTP_CC_SECRET_KEY", kind: "shared-key" }); github.push({ name: "GTP_CC_SECRET_KEY", kind: "shared-key" }); }
  else if (keyV !== keyG) refuse.push(`GTP_CC_SECRET_KEY exists only on ${keyV ? "Vercel" : "GitHub"}: its value can't be read to copy; ask before replacing it on both`);
  if (dispatchToken && !has.has("GH_DISPATCH_TOKEN")) vercel.push({ name: "GH_DISPATCH_TOKEN", kind: "prompt" });
  if (blobToken && !ghSecrets.includes("CC_BLOB_READ_WRITE_TOKEN")) github.push({ name: "CC_BLOB_READ_WRITE_TOKEN", kind: "prompt" });
  for (const x of [...vercel, ...github]) if (NEVER.has(x.name)) refuse.push(`${x.name} is never set by this script`);
  return { vercel, github, refuse };
}

/** The Blob connection's token, read from Production env into a 0700 temp dir and deleted before returning. */
export function blobTokenFromVercel(project) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-blob-"));
  const file = path.join(dir, ".env.pull");
  try {
    const r = spawnSync("npx", ["-y", CLI, "env", "pull", file, "--environment", "production", "--yes", "--project", project], { encoding: "utf8", cwd: dir });
    const token = r.status === 0 && fs.existsSync(file) ? parseEnvFile(fs.readFileSync(file, "utf8")).BLOB_READ_WRITE_TOKEN : null;
    if (!token || !/^vercel_blob_rw_\w{16,}$/.test(token)) throw new Error("couldn't read the Blob token from the project's Production settings; nothing was changed");
    return token;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const toVercel = (project, name, value, sensitive) => spawnSync("npx", ["-y", CLI, "env", "add", name, "production", "--project", project, sensitive ? "--sensitive" : "--no-sensitive", "--yes"], { input: value, encoding: "utf8" }).status === 0;
const toGitHub = (name, value) => spawnSync("gh", ["secret", "set", name, "--repo", REPO], { input: value, encoding: "utf8" }).status === 0;

async function main() {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  const project = arg("--vercel-project");
  if (!project) { console.error("usage: configure-hosted.mjs --vercel-project <name> [--dispatch-token] [--blob-token]"); process.exit(2); }
  const remote = fetchRemote({ project, repo: REPO });
  const plan = planConfig(remote, { dispatchToken: process.argv.includes("--dispatch-token"), blobToken: process.argv.includes("--blob-token") });
  if (plan.refuse.length) { plan.refuse.forEach((r) => console.error(`refused: ${r}`)); console.error("Nothing was changed."); process.exit(1); }

  const values = {};
  let setupToken = null;
  if (process.argv.includes("--setup-token")) {
    if (!process.stdout.isTTY) { console.error("--setup-token shows the token once and only in a Terminal window. Nothing was changed."); process.exit(1); }
    setupToken = crypto.randomBytes(18).toString("base64url");
    plan.vercel.push({ name: "GTP_CC_SETUP_TOKEN_SHA256", kind: "plain" });
    values.GTP_CC_SETUP_TOKEN_SHA256 = crypto.createHash("sha256").update(setupToken).digest("hex");
  }
  if (process.argv.includes("--blob-from-vercel") && !remote.ghSecrets.includes("CC_BLOB_READ_WRITE_TOKEN")) {
    plan.github.push({ name: "CC_BLOB_READ_WRITE_TOKEN", kind: "from-vercel" });
    values.CC_BLOB_READ_WRITE_TOKEN = blobTokenFromVercel(project);
  }
  const sharedKey = crypto.randomBytes(32).toString("base64");
  for (const x of [...plan.vercel, ...plan.github]) {
    if (x.name in values) continue;
    if (x.kind === "plain") values[x.name] = PLAIN[x.name];
    else if (x.kind === "random") values[x.name] = crypto.randomBytes(36).toString("base64url");
    else if (x.kind === "shared-key") values[x.name] = sharedKey;
    else if (!(x.name in values)) {
      const v = await hiddenPrompt(`${x.name === "GH_DISPATCH_TOKEN" ? "GitHub fine-grained token for gtp-ops (github_pat_…)" : "Vercel Blob read-write token (vercel_blob_rw_…)"} (paste; it stays hidden), then Return: `);
      const ok = x.name === "GH_DISPATCH_TOKEN" ? /^github_pat_\w{20,}$/.test(v) : /^vercel_blob_rw_\w{16,}$/.test(v);
      if (!ok) { console.error(`${x.name}: that doesn't look like the right kind of token. Nothing more was changed.`); process.exit(1); }
      values[x.name] = v;
    }
  }
  let failed = 0;
  // GitHub first for the shared key: if Vercel then failed, a re-run sees it on one side only and refuses, never diverges silently
  for (const x of plan.github) { const ok = toGitHub(x.name, values[x.name]); failed += ok ? 0 : 1; console.log(`  ${ok ? "PASS" : "FAIL"}  GitHub ${REPO}  ${x.name}`); }
  for (const x of plan.vercel) { const ok = toVercel(project, x.name, values[x.name], x.kind !== "plain"); failed += ok ? 0 : 1; console.log(`  ${ok ? "PASS" : "FAIL"}  Vercel ${project} (Production)  ${x.name}${x.kind === "plain" ? ` = ${values[x.name]}` : " (sensitive)"}`); }
  if (!plan.github.length && !plan.vercel.length) console.log("  nothing to add");
  if (setupToken && !failed) {
    console.log(`\nYour one-time passkey setup token (shown once; save it in your password manager, not in a note or chat):\n\n    ${setupToken}\n`);
    console.log("You will type it once on your iPhone to register your Face ID passkey. After that it no longer works.");
  }
  console.log("\nWhat is configured now (names only):");
  for (const r of checkRemote(fetchRemote({ project, repo: REPO }))) console.log(`  ${r.level.padEnd(4)}  ${r.name.padEnd(42)} ${r.why}`);
  process.exitCode = failed ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((err) => { console.error(err.message); process.exit(1); });
