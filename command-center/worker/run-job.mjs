#!/usr/bin/env node
/**
 * GitHub Actions entry point:  node command-center/worker/run-job.mjs
 *
 *   JOB_ID              the job to run (workflow_dispatch input)
 *   DATABASE_URL        the worker's Postgres role (INSERT/SELECT only on the ledger tables)
 *   GITHUB_RUN_ID       recorded on the job so Pause/Stop can cancel this run
 *   GTP_CC_OUT_DIR      scratch for renders and run logs (default: $RUNNER_TEMP/gtp-cc)
 *   GTP_CC_PUBLIC_ROOT  the read-only sparse checkout of the public repo (data the recap and tests read)
 *   CLAUDE_CODE_OAUTH_TOKEN   the founder's subscription token, present only in this step's environment
 *
 * After a G3 keep it writes the kept branch as a git bundle ($RUNNER_TEMP/kept.bundle) and sets the step output
 * kept_branch; the workflow's separate push job (the only one with contents: write) pushes exactly that branch.
 *
 * Exits 0 when the job finished, 1 when it failed or was refused (the ledger says why either way).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { neon, pglite } from "../ledger/pg-adapters.mjs";
import { sqlObjectStore, blobObjectStore } from "../ledger/object-store.mjs";
import { wallClock } from "../lib/util.mjs";
import { runWorkerJob } from "./worker.mjs";

const env = process.env;
const jobId = env.JOB_ID;
if (!jobId || !/^job-[0-9a-f]{12}$/.test(jobId)) {
  console.error("JOB_ID missing or malformed");
  process.exit(2);
}
if (env.GITHUB_ACTIONS === "true" && !env.GTP_CC_SANDBOX_USER) {
  console.error("refusing: on GitHub Actions the worker needs GTP_CC_SANDBOX_USER (Claude-written code must not run as this user)");
  process.exit(2);
}
const db = env.DATABASE_URL ? await neon(env.DATABASE_URL) : await pglite(env.GTP_CC_PGLITE_DIR);
const outDir = path.resolve(env.GTP_CC_OUT_DIR ?? path.join(env.RUNNER_TEMP ?? os.tmpdir(), "gtp-cc"));
const publicRoot = env.GTP_CC_PUBLIC_ROOT ?? null;
const links = publicRoot ? ["app", "data"].map((p) => ({ path: p, from: path.join(publicRoot, p) })) : [];

const r = await runWorkerJob({
  db, clock: wallClock, jobId, runId: env.GITHUB_RUN_ID ?? null, runnerId: "github-actions", outDir,
  objects: env.BLOB_READ_WRITE_TOKEN ? blobObjectStore({ db, clock: wallClock }) : sqlObjectStore({ db, clock: wallClock }),
  env: { GTP_CC_BUDGET_USD: "0" },
  engineering: {
    claudeEnv: env, allowOauthToken: true, pushKept: "workflow",
    workcopyPaths: ["command-center"], workcopyLinks: links, nodeModulesFrom: null,
    // Code Claude wrote (tests, the console server for screenshots) runs as this no-sudo user with an empty
    // environment; the workflow creates it and proves it can't read this process's environment before we start.
    sandbox: env.GTP_CC_SANDBOX_USER ? { user: env.GTP_CC_SANDBOX_USER, home: env.GTP_CC_SANDBOX_HOME ?? "/tmp/ccsandbox" } : null,
    // The runner's process environments hold DATABASE_URL and the OAuth token; Claude's own read tools must not
    // reach them either.
    extraDisallowedTools: ["Read(//proc/**)", "Read(//sys/**)", "Read(//dev/**)", "Read(//home/runner/work/_temp/**)", "Grep(//proc/**)", "Glob(//proc/**)"],
  },
});
if (r.kept && /^cc\/[a-z0-9-]+$/.test(r.kept.branch)) {
  const bundle = path.join(env.RUNNER_TEMP ?? os.tmpdir(), "kept.bundle");
  execFileSync("git", ["bundle", "create", bundle, `refs/heads/${r.kept.branch}`, "--not", "--remotes=origin"], { stdio: "inherit" });
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `kept_branch=${r.kept.branch}\nkept_commit=${r.kept.commit}\n`);
}
console.log(JSON.stringify({ jobId, ok: r.ok, code: r.code ?? null, detail: r.detail ?? null, uploaded: r.uploaded.length, kept: r.kept?.branch ?? null }));
await db.close?.();
process.exit(r.ok ? 0 : 1);
