#!/usr/bin/env node
/**
 * One command, run by the founder in a Mac Terminal, that sets up the hosted database and hands each runtime role its
 * credentials WITHOUT any of them appearing on screen, in history, in a file or in Git:
 *
 *   node command-center/deploy/provision-db.mjs                 everything (GitHub secrets + Vercel DATABASE_URL)
 *   node command-center/deploy/provision-db.mjs --github-only   worker / reader / publisher → GitHub Actions secrets
 *   node command-center/deploy/provision-db.mjs --vercel-only   app → Vercel (Production) DATABASE_URL
 *   --vercel-project <name>   the Command Center's Vercel project (default gtp-team; never gtp-ops, the operator console)
 *   node command-center/deploy/provision-db.mjs --check         schema + policies only (no passwords change, nothing sent)
 *
 * 1. Reads the Neon OWNER string at a hidden prompt (deploy/owner-url.mjs).
 * 2. Checks the destinations answer first (gh for gtp-ops; the Vercel CLI for the project), so no role is created with
 *    nowhere to put its password.
 * 3. Applies the migrations (idempotent), then deploy/sql/roles.sql once, in one transaction.
 * 4. Gives each role being configured a NEW random password (re-running rotates it; the old one stops working).
 * 5. Logs in AS each role and proves what it may and may not do (tests/db-roles.test.mjs, against the real database):
 *    every probe runs inside a transaction that is rolled back, so nothing is written.
 * 6. Only if every probe passes, pipes each connection string straight into `gh secret set` / `vercel env add`
 *    (stdin, never argv). Prints names and PASS/FAIL, never a value.
 *
 * The owner string is never stored anywhere. Nothing here deploys, publishes or touches the local console.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { neon } from "../ledger/pg-adapters.mjs";
import { migrate } from "../ledger/sql-store.mjs";
import { ownerUrl } from "./owner-url.mjs";
import { OPERATOR_CONSOLE_PROJECT } from "./preflight.mjs";

export const GH_REPO = "yashwantbalaji3/gtp-ops";
export const VERCEL_PROJECT_DEFAULT = "gtp-team";
export const VERCEL_CLI = "vercel@64.1.0";
/** role → where its connection string goes */
export const DESTINATIONS = {
  gtp_cc_app: { to: "vercel", name: "DATABASE_URL" },
  gtp_cc_worker: { to: "github", name: "CC_WORKER_DATABASE_URL" },
  gtp_cc_reader: { to: "github", name: "CC_READER_DATABASE_URL" },
  gtp_cc_publisher: { to: "github", name: "CC_PUBLISHER_DATABASE_URL" },
};
const ROLES = Object.keys(DESTINATIONS);

const entry = (kind, data = "{}") => `INSERT INTO ledger_entries (id, at, kind, actor, data) VALUES ('probe-${kind}', '2026-01-01T00:00:00Z', '${kind}', 'probe', '${data}')`;
const claim = (key) => `INSERT INTO ledger_claims (key_hash, key, value) VALUES ('probe-${key}', '${key}', '{}')`;
const denied = (role, what, sql) => ({ role, what, sql, expect: "denied" });
const allowed = (role, what, sql) => ({ role, what, sql, expect: "ok" });

/** What each role may and may not do. Run as that role, inside a rolled-back transaction. */
export const PROBES = [
  ...ROLES.flatMap((r) => [
    denied(r, "create a table", "CREATE TABLE gtp_probe (x int)"),
    denied(r, "rewrite ledger history", "UPDATE ledger_entries SET kind = kind"),
    denied(r, "delete ledger history", "DELETE FROM ledger_entries"),
    denied(r, "rewrite a once-only claim", "UPDATE ledger_claims SET key = key"),
    denied(r, "drop the append-only guard", "ALTER TABLE ledger_entries DISABLE TRIGGER ALL"),
    denied(r, "record a media deletion", "INSERT INTO stored_object_deletions DEFAULT VALUES"),
  ]),
  // the publisher records what it did, and nothing else
  allowed("gtp_cc_publisher", "record a publish tick", entry("publish-tick")),
  allowed("gtp_cc_publisher", "record an X receipt", entry("publish-receipt", '{"provider":"x-api"}')),
  allowed("gtp_cc_publisher", "claim a once-only X send", claim("xlive|probe|0")),
  allowed("gtp_cc_publisher", "read the encrypted X tokens (to refresh them)", "SELECT 1 FROM cc_secrets LIMIT 1"),
  ...["decision", "design-approval", "caption-edit", "publish-policy", "publish-job", "publish-pause", "publisher-host", "control", "auth", "command"]
    .map((k) => denied("gtp_cc_publisher", `forge a "${k}" entry`, entry(k))),
  denied("gtp_cc_publisher", "forge a non-X receipt", entry("publish-receipt", '{"provider":"manual-handoff"}')),
  ...["decision|probe", "post-approval|probe|0", "design|probe|a", "job|probe|start"].map((k) => denied("gtp_cc_publisher", `claim "${k.split("|")[0]}|…"`, claim(k))),
  ...["auth_users", "auth_invites", "auth_sessions", "auth_passkeys", "auth_recovery_codes", "auth_setup", "cc_oauth_states"]
    .map((t) => denied("gtp_cc_publisher", `read ${t}`, `SELECT 1 FROM ${t} LIMIT 1`)),
  denied("gtp_cc_publisher", "create a user account", "INSERT INTO auth_users DEFAULT VALUES"),
  denied("gtp_cc_publisher", "change a user's role", "UPDATE auth_users SET role = role"),
  // the worker drafts; it can't approve, schedule or publish
  allowed("gtp_cc_worker", "record progress", entry("progress")),
  ...["decision", "publish-receipt", "publish-job", "publish-policy", "publisher-host", "control"].map((k) => denied("gtp_cc_worker", `forge a "${k}" entry`, entry(k))),
  denied("gtp_cc_worker", "claim a once-only X send", claim("xlive|probe|0")),
  ...["cc_secrets", "auth_users", "auth_sessions"].map((t) => denied("gtp_cc_worker", `read ${t}`, `SELECT 1 FROM ${t} LIMIT 1`)),
  // the reader only reads the ledger
  allowed("gtp_cc_reader", "read the ledger", "SELECT 1 FROM ledger_entries LIMIT 1"),
  denied("gtp_cc_reader", "append to the ledger", entry("progress")),
  ...["ledger_claims", "cc_secrets", "auth_users"].map((t) => denied("gtp_cc_reader", `read ${t}`, `SELECT 1 FROM ${t} LIMIT 1`)),
  // the web app: accounts and sign-in (server-side role and step-up checks sit above this)
  allowed("gtp_cc_app", "read accounts", "SELECT 1 FROM auth_users LIMIT 1"),
  allowed("gtp_cc_app", "append to the ledger", entry("progress")),
  denied("gtp_cc_app", "delete an account", "DELETE FROM auth_users"),
];

const DENIAL = /permission denied|row-level security|must be owner|append-only/;
const ROLLBACK = Symbol("rollback");

/**
 * Runs probes in ONE transaction that is always rolled back. `setRole` switches role per probe (PGlite tests, where
 * one owner connection plays every role); against Neon each role logs in with its own password instead.
 */
export async function runProbes(db, probes, { setRole = false } = {}) {
  const results = [];
  await db.transaction(async (tx) => {
    for (const p of probes) {
      await tx.query("SAVEPOINT probe");
      let got;
      try {
        if (setRole) await tx.query(`SET LOCAL ROLE ${p.role}`);
        await tx.query(p.sql);
        got = "ok";
      } catch (err) {
        got = DENIAL.test(err.message) ? "denied" : `error: ${String(err.message).slice(0, 90)}`;
      }
      await tx.query("ROLLBACK TO SAVEPOINT probe");
      results.push({ role: p.role, what: p.what, expect: p.expect, got, pass: got === p.expect });
    }
    throw ROLLBACK;
  }).catch((err) => { if (err !== ROLLBACK) throw err; });
  return results;
}

/** Schema facts the owner can see: tables, RLS, policies, append-only triggers, roles. */
export async function checkSchema(db) {
  const q = async (sql) => (await db.query(sql)).rows;
  const tables = (await q("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1")).map((r) => r.table_name);
  const rls = Object.fromEntries((await q("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('ledger_entries','ledger_claims')")).map((r) => [r.relname, r.relrowsecurity]));
  const policies = (await q("SELECT policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY 1")).map((r) => r.policyname);
  const triggers = (await q("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'ledger_%' ORDER BY 1")).map((r) => r.tgname);
  const roles = (await q("SELECT rolname, rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls FROM pg_roles WHERE rolname LIKE 'gtp_cc_%' ORDER BY 1"));
  const rows = [];
  const need = (ok, name, why) => rows.push({ level: ok ? "PASS" : "FAIL", name, why });
  for (const t of ["ledger_entries", "ledger_claims", "stored_objects", "stored_object_refs", "stored_object_deletions", "auth_users", "auth_sessions", "auth_passkeys", "cc_secrets"]) need(tables.includes(t), `table ${t}`, tables.includes(t) ? "present" : "missing");
  need(rls.ledger_entries && rls.ledger_claims, "row-level security", "on for ledger_entries and ledger_claims");
  need(policies.includes("ledger_publisher_append") && policies.includes("ledger_worker_append") && policies.includes("claims_publisher_append"), "append policies", `${policies.length} policies`);
  for (const t of ["ledger_entries_append_only", "ledger_claims_append_only", "ledger_entries_no_truncate", "ledger_claims_no_truncate"]) need(triggers.includes(t), `trigger ${t}`, triggers.includes(t) ? "present" : "missing");
  for (const r of roles) need(r.rolcanlogin && !r.rolsuper && !r.rolcreaterole && !r.rolcreatedb && !r.rolbypassrls, `role ${r.rolname}`, "login only: no superuser, create-role, create-db or RLS bypass");
  return { rows, roles: roles.map((r) => r.rolname) };
}

/** A runtime role's string: Neon's POOLED endpoint (serverless functions and jobs); migrations stay on the direct one. */
export function roleUrl(owner, role, password) {
  const u = new URL(owner);
  u.hostname = u.hostname.replace(/^(ep-[^.]+?)(-pooler)?\./, "$1-pooler.");
  u.username = role;
  u.password = password;
  return u.toString();
}
const newPassword = () => crypto.randomBytes(32).toString("base64url");
const vercel = (args, input) => spawnSync("npx", ["-y", VERCEL_CLI, ...args], { input, encoding: "utf8", stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });

function destinationsReachable(targets, project) {
  const problems = [];
  if (targets.includes("github")) {
    const r = spawnSync("gh", ["secret", "list", "--repo", GH_REPO], { encoding: "utf8" });
    if (r.status !== 0) problems.push(`GitHub: can't reach ${GH_REPO} secrets with gh (run: gh auth status)`);
  }
  if (targets.includes("vercel")) {
    if (project === OPERATOR_CONSOLE_PROJECT) problems.push(`Vercel: ${project} is the protected operator console, not the Command Center's project`);
    else if (vercel(["project", "inspect", project]).status !== 0) problems.push(`Vercel: can't read project ${project} (run: npx ${VERCEL_CLI} login)`);
  }
  return problems;
}

/** Sends one value to its destination over stdin. Returns true/false, never the value. */
function deliver(dest, value, project) {
  if (dest.to === "github") return spawnSync("gh", ["secret", "set", dest.name, "--repo", GH_REPO], { input: value, encoding: "utf8" }).status === 0;
  return vercel(["env", "add", dest.name, "production", "--project", project, "--sensitive", "--force", "--yes"], value).status === 0;
}

async function main() {
  const flag = (f) => process.argv.includes(f);
  const check = flag("--check");
  const targets = flag("--github-only") ? ["github"] : flag("--vercel-only") ? ["vercel"] : ["github", "vercel"];
  const issue = check ? [] : ROLES.filter((r) => targets.includes(DESTINATIONS[r].to));
  const i = process.argv.indexOf("--vercel-project");
  const project = i > 0 ? process.argv[i + 1] : VERCEL_PROJECT_DEFAULT;
  const log = (s = "") => console.log(s);
  const table = (rows) => rows.forEach((r) => log(`  ${r.level.padEnd(4)}  ${r.name.padEnd(34)} ${r.why}`));

  const owner = await ownerUrl();
  if (!check) {
    const problems = destinationsReachable(targets, project);
    if (problems.length) { problems.forEach((p) => console.error(p)); console.error("Nothing was changed."); process.exit(1); }
  }
  const db = await neon(owner);
  try {
    log("1. Migrations");
    await migrate(db);
    const existing = (await db.query("SELECT rolname FROM pg_roles WHERE rolname LIKE 'gtp_cc_%'")).rows.map((r) => r.rolname);
    if (!check) {
      log("2. Roles");
      if (existing.length === 0) {
        let sql = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "sql/roles.sql"), "utf8");
        for (const k of ["app_pw", "worker_pw", "reader_pw", "publisher_pw"]) sql = sql.replace(`:'${k}'`, `'${newPassword()}'`); // unknown to anyone until step 4 issues the real one
        await db.transaction((tx) => tx.query(sql));
        log("  created gtp_cc_app, gtp_cc_worker, gtp_cc_reader, gtp_cc_publisher with grants and row-level policies");
      } else if (existing.length !== ROLES.length) {
        throw new Error(`only some roles exist (${existing.join(", ")}): stop and ask before changing anything`);
      } else log("  roles already exist: keeping grants and policies; issuing new passwords");
    }
    log(`${check ? "2" : "3"}. Schema`);
    const schema = await checkSchema(db);
    table(schema.rows);
    if (check) return;

    const urls = {};
    for (const role of issue) {
      const pw = newPassword();
      await db.query(`ALTER ROLE ${role} WITH PASSWORD '${pw}'`);
      urls[role] = roleUrl(owner, role, pw);
    }
    log("4. Logging in as each role (every probe is rolled back)");
    const results = [];
    for (const role of issue) {
      const as = await neon(urls[role]);
      try { results.push(...await runProbes(as, PROBES.filter((p) => p.role === role))); } finally { await as.close(); }
    }
    for (const r of results) log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.role.padEnd(17)} ${r.expect === "ok" ? "may" : "may not"} ${r.what}${r.pass ? "" : `  (got: ${r.got})`}`);
    const failed = results.filter((r) => !r.pass).length + schema.rows.filter((r) => r.level === "FAIL").length;
    if (failed) throw new Error(`${failed} check(s) failed: NO credentials were sent anywhere`);

    log("5. Delivering credentials (stdin only; values never shown)");
    let sent = 0;
    for (const role of issue) {
      const dest = DESTINATIONS[role];
      const ok = deliver(dest, urls[role], project);
      sent += ok ? 1 : 0;
      log(`  ${ok ? "PASS" : "FAIL"}  ${dest.to === "github" ? `GitHub ${GH_REPO}` : `Vercel ${project} (Production)`}  ${dest.name}`);
    }
    if (sent !== issue.length) throw new Error("some deliveries failed: re-run this command for that destination (it issues fresh passwords)");
    log("\nDone. No value was printed and the owner string was not stored.");
  } finally {
    await db.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(`\n${err.message}`); process.exit(1); });
}
