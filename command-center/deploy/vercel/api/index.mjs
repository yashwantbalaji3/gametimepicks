/**
 * Vercel Function entry for team.gametimepicks.yashwantbalaji.com (copied to api/index.mjs in the private ops repo
 * at CP-H1; vercel.json rewrites every path here). Configuration is environment variables only — see
 * deploy/env.example. Migrations are NOT run here: the app's database role cannot change the schema
 * (deploy/sql/roles.sql); deploy/migrate.mjs runs them with the owner role.
 */
import { neon } from "../command-center/ledger/pg-adapters.mjs";
import { sqlObjectStore, blobObjectStore } from "../command-center/ledger/object-store.mjs";
import { githubDispatcher } from "../command-center/jobs/dispatchers.mjs";
import { createHostedApp } from "../command-center/hosted/app.mjs";
import { wallClock } from "../command-center/lib/util.mjs";
import { createSqlVault } from "../command-center/publishers/token-vault.mjs";
import { createXOAuth, createSqlStateStore, CALLBACK_PATH } from "../command-center/publishers/x-oauth.mjs";

const env = process.env;
for (const k of ["DATABASE_URL", "GTP_CC_ORIGIN", "GTP_CC_RP_ID", "GH_DISPATCH_TOKEN", "GH_OPS_OWNER", "GH_OPS_REPO"]) {
  if (!env[k]) throw new Error(`${k} is not set`);
}
for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "OPENAI_API_KEY", "XAI_API_KEY"]) {
  if (env[k]) throw new Error(`${k} must not be set on the web app: no model runs here`);
}

const db = await neon(env.DATABASE_URL);
// X Publisher V1: the web app connects the account (OAuth) and records decisions; the publisher job sends.
const oauth = env.GTP_CC_SECRET_KEY && env.GTP_CC_X_CLIENT_ID
  ? createXOAuth({ vault: createSqlVault({ db, key: env.GTP_CC_SECRET_KEY, clock: wallClock }), states: createSqlStateStore(db), redirectUri: `${env.GTP_CC_ORIGIN}${CALLBACK_PATH}`, clock: wallClock, clientId: env.GTP_CC_X_CLIENT_ID })
  : null;
const app = createHostedApp({
  db, clock: wallClock,
  origin: env.GTP_CC_ORIGIN, rpID: env.GTP_CC_RP_ID,
  setupTokenSha256: env.GTP_CC_SETUP_TOKEN_SHA256 || null,
  dispatcher: githubDispatcher({ token: env.GH_DISPATCH_TOKEN, owner: env.GH_OPS_OWNER, repo: env.GH_OPS_REPO, workflow: env.GH_WORKER_WORKFLOW || "cc-worker.yml", ref: "main" }),
  // media bytes in the PRIVATE Blob store connected to this project (OIDC on Vercel); references stay in Postgres
  objects: env.BLOB_STORE_ID || env.BLOB_READ_WRITE_TOKEN ? blobObjectStore({ db, clock: wallClock }) : sqlObjectStore({ db, clock: wallClock }),
  outDir: "/tmp/gtp-cc",
  env: { GTP_CC_BUDGET_USD: "0", GTP_CC_X_HANDLE: env.GTP_CC_X_HANDLE ?? "" },
  oauth,
  cronSecret: env.CRON_SECRET || null,
  publishDispatcher: env.GH_PUBLISHER_WORKFLOW ? githubDispatcher({ token: env.GH_DISPATCH_TOKEN, owner: env.GH_OPS_OWNER, repo: env.GH_OPS_REPO, workflow: env.GH_PUBLISHER_WORKFLOW, ref: "main" }) : null,
});

export default { fetch: (request) => app.fetch(request) };
