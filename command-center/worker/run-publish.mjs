#!/usr/bin/env node
/**
 * HOSTED PUBLISHER JOB — GitHub Actions entry point (deploy/github/cc-publisher.yml):  node command-center/worker/run-publish.mjs
 *
 * Runs every publishing job that is due through the gate (orchestrator/publish-flow.mjs), with the freshest public
 * data: the workflow checks out the public repo and the gate fetches it again right before each send. No Claude Code,
 * no model, no project code from a branch runs here.
 *
 *   DATABASE_URL         the PUBLISHER's Postgres role: it may append only publishing records and their claims, and
 *                        read/refresh the encrypted X tokens (deploy/sql/roles.sql) — never an approval or a decision
 *   GTP_CC_SECRET_KEY    decrypts the X tokens (cc_secrets)
 *   GTP_CC_X_CLIENT_ID   the X app's OAuth 2.0 Client ID (not secret); a confidential app's secret is in cc_secrets
 *   GTP_CC_PUBLIC_ROOT   the public repo checkout (data source; refreshed with git fetch before each send)
 *   GTP_CC_ORIGIN        https://team.gametimepicks.yashwantbalaji.com (the registered callback's origin)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { neon, pglite } from "../ledger/pg-adapters.mjs";
import { createSqlStore } from "../ledger/sql-store.mjs";
import { sqlObjectStore } from "../ledger/object-store.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { createSqlVault } from "../publishers/token-vault.mjs";
import { createXOAuth, createSqlStateStore, CALLBACK_PATH } from "../publishers/x-oauth.mjs";
import { wallClock } from "../lib/util.mjs";

const env = process.env;
for (const k of ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "OPENAI_API_KEY", "XAI_API_KEY"]) {
  if (env[k]) { console.error(`${k} must not be set in the publisher job`); process.exit(2); }
}
const publicRoot = env.GTP_CC_PUBLIC_ROOT;
if (!publicRoot || !fs.existsSync(publicRoot)) { console.error("GTP_CC_PUBLIC_ROOT (the public repo checkout) is required"); process.exit(2); }

const db = env.DATABASE_URL ? await neon(env.DATABASE_URL) : await pglite(env.GTP_CC_PGLITE_DIR);
const clock = wallClock;
const outDir = path.resolve(env.GTP_CC_OUT_DIR ?? path.join(env.RUNNER_TEMP ?? os.tmpdir(), "gtp-publisher"));
fs.mkdirSync(path.join(outDir, "media"), { recursive: true });
const objects = sqlObjectStore({ db, clock });
const oauth = createXOAuth({
  vault: createSqlVault({ db, key: env.GTP_CC_SECRET_KEY, clock }), states: createSqlStateStore(db),
  redirectUri: `${env.GTP_CC_ORIGIN ?? "https://team.gametimepicks.yashwantbalaji.com"}${CALLBACK_PATH}`, clock, clientId: env.GTP_CC_X_CLIENT_ID || null,
});
const refreshData = async () => {
  const r = spawnSync("git", ["-C", publicRoot, "fetch", "-q", "--depth", "1", "origin", "main"], { timeout: 60_000, encoding: "utf8" });
  return r.status === 0 ? { ok: true, detail: `fetched origin/main at ${clock()}` } : { ok: false, detail: `git fetch failed (${r.status ?? r.signal})` };
};

const session = await createSqlStore({ db, clock }).open();
const o = createOrchestrator({
  store: session, clock, outDir, env: { GTP_CC_BUDGET_USD: "0", GTP_CC_DATA_REPO: publicRoot, GTP_CC_X_HANDLE: env.GTP_CC_X_HANDLE ?? "" },
  execution: "jobs", runnerId: "publisher", hosted: true, publishing: { oauth, refreshData },
});

// The approved images live in the object store; put each due job's images where the gate reads them.
for (const j of o.publishing.dueSoon(0)) {
  const rec = o.state().posts.find((p) => p.decisionId === j.decisionId);
  for (const m of rec?.package?.mediaSet ?? (rec?.package?.media ? [rec.package.media] : [])) {
    const obj = await objects.get(`media/${path.basename(m.file)}`);
    if (obj) fs.writeFileSync(path.join(outDir, "media", path.basename(m.file)), obj.body);
  }
}
const r = await o.publishing.runDue();
await session.flush();
console.log(JSON.stringify({ ran: r.ran ?? [], at: clock() }));
await db.close?.();
