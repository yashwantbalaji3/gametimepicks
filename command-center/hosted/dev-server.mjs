/**
 * HOSTED MODE, LOCALLY — the exact hosted handler (passkeys, step-up, stateless requests, jobs) on this Mac.
 *
 *   node command-center/hosted/dev-server.mjs          → http://localhost:4191
 *
 * Postgres is PGlite in command-center/out/hosted-dev/ (git-ignored), jobs run in-process through the local
 * dispatcher, and Claude Code (if a delegated-engineering job reaches it) uses this Mac's login exactly as the
 * console does. Binds 127.0.0.1 only. WebAuthn treats http://localhost as a secure context, so real passkeys
 * (Touch ID) work here; the RP ID is "localhost".
 *
 * First run prints a one-time setup token for registering the first passkey (only its sha256 is kept). Set
 * GTP_CC_SETUP_TOKEN to choose it (tests do).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CC_ROOT, sha256, wallClock } from "../lib/util.mjs";
import { pglite } from "../ledger/pg-adapters.mjs";
import { migrate } from "../ledger/sql-store.mjs";
import { dirObjectStore } from "../ledger/object-store.mjs";
import { localDispatcher } from "../jobs/dispatchers.mjs";
import { runWorkerJob } from "../worker/worker.mjs";
import { createHostedApp } from "./app.mjs";
import { createSqlVault } from "../publishers/token-vault.mjs";
import { createXOAuth, createSqlStateStore, CALLBACK_PATH } from "../publishers/x-oauth.mjs";

const PORT = Number(process.env.GTP_CC_HOSTED_PORT ?? 4191);
const ORIGIN = `http://localhost:${PORT}`;
const ROOT = path.resolve(process.env.GTP_CC_OUT_DIR ?? path.join(CC_ROOT, "out/hosted-dev"));
fs.mkdirSync(ROOT, { recursive: true });

const db = await pglite(path.join(ROOT, "pgdata"));
await migrate(db);
const objects = dirObjectStore(path.join(ROOT, "objects"));
const outDir = path.join(ROOT, "work");
const clock = wallClock;

const tokenFile = path.join(ROOT, "setup-token.sha256");
let setupTokenSha256 = fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, "utf8").trim() : null;
if (process.env.GTP_CC_SETUP_TOKEN) setupTokenSha256 = sha256(process.env.GTP_CC_SETUP_TOKEN);
if (!setupTokenSha256) {
  const token = crypto.randomBytes(18).toString("base64url");
  setupTokenSha256 = sha256(token);
  fs.writeFileSync(tokenFile, setupTokenSha256);
  console.log(`One-time setup token for the first passkey: ${token}`);
}

const slateDate = process.env.GTP_CC_SLATE_DATE || undefined;
const dispatcher = localDispatcher({
  runWorker: (jobId) => runWorkerJob({ db, clock, jobId, runnerId: "local-worker", outDir, objects, env: process.env, slateDate }),
});
// X: tokens AES-GCM in PGlite under a dev key kept beside the database (dev only; hosted uses GTP_CC_SECRET_KEY)
const keyFile = path.join(ROOT, "secret-key.b64");
if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32).toString("base64"), { mode: 0o600 });
const oauth = createXOAuth({ vault: createSqlVault({ db, key: fs.readFileSync(keyFile, "utf8").trim(), clock }), states: createSqlStateStore(db), redirectUri: `${ORIGIN}${CALLBACK_PATH}`, clock, clientId: process.env.GTP_CC_X_CLIENT_ID || null });
const app = createHostedApp({ db, clock, origin: ORIGIN, rpID: "localhost", setupTokenSha256, dispatcher, objects, outDir, env: process.env, slateDate, oauth, cronSecret: process.env.CRON_SECRET || null });

const server = http.createServer(async (req, res) => {
  if (req.headers.host !== `localhost:${PORT}`) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("use http://localhost:" + PORT);
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`${ORIGIN}${req.url}`, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
  const response = await app.fetch(request);
  const headers = {};
  response.headers.forEach((v, k) => { headers[k] = v; });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  if (setCookie.length) headers["set-cookie"] = setCookie;
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
});
server.listen(PORT, "127.0.0.1", () => console.log(`Hosted-mode Command Center (local dev) on ${ORIGIN}`));
