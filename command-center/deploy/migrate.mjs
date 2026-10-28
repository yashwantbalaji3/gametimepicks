#!/usr/bin/env node
/**
 * Apply command-center/ledger/migrations/*.sql to the hosted database (idempotent). Run from the Mac at CP-H1
 * and after any migration change, with the Neon OWNER connection string — never stored in Vercel or GitHub:
 *
 *   DATABASE_URL_OWNER='postgres://…' node command-center/deploy/migrate.mjs            migrations only
 *   DATABASE_URL_OWNER='postgres://…' node command-center/deploy/migrate.mjs --roles    + create the three roles
 *
 * --roles (once) generates three passwords, applies deploy/sql/roles.sql with them, and prints the three
 * connection strings to paste into Vercel / GitHub. They are printed once and never written to disk.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { neon } from "../ledger/pg-adapters.mjs";
import { migrate } from "../ledger/sql-store.mjs";

const url = process.env.DATABASE_URL_OWNER;
if (!url) {
  console.error("Set DATABASE_URL_OWNER (the Neon owner role) for this one command.");
  process.exit(2);
}
const db = await neon(url);
await migrate(db);
const t = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1");
console.log(`migrated: ${t.rows.map((r) => r.table_name).join(", ")}`);

if (process.argv.includes("--roles")) {
  const pw = { app_pw: crypto.randomBytes(24).toString("base64url"), worker_pw: crypto.randomBytes(24).toString("base64url"), reader_pw: crypto.randomBytes(24).toString("base64url") };
  let sql = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "sql/roles.sql"), "utf8");
  for (const [k, v] of Object.entries(pw)) sql = sql.replace(`:'${k}'`, `'${v}'`);
  await db.exec(sql);
  const u = new URL(url);
  const conn = (role, p) => { const x = new URL(u); x.username = role; x.password = p; return x.toString(); };
  console.log("\nPaste each once, then clear this terminal:");
  console.log(`  Vercel  DATABASE_URL           = ${conn("gtp_cc_app", pw.app_pw)}`);
  console.log(`  GitHub  CC_WORKER_DATABASE_URL = ${conn("gtp_cc_worker", pw.worker_pw)}`);
  console.log(`  GitHub  CC_READER_DATABASE_URL = ${conn("gtp_cc_reader", pw.reader_pw)}`);
}
await db.close();
