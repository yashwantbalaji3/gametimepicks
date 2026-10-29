#!/usr/bin/env node
/**
 * Apply command-center/ledger/migrations/*.sql to the hosted database (idempotent), after any migration change. Run
 * from the Mac; the Neon OWNER string is asked for at a hidden prompt (deploy/owner-url.mjs) and never stored:
 *
 *   node command-center/deploy/migrate.mjs
 *
 * First-time setup (migrations + least-privilege roles + credentials straight into GitHub/Vercel, nothing printed)
 * is deploy/provision-db.mjs, not this script.
 */
import { neon } from "../ledger/pg-adapters.mjs";
import { migrate } from "../ledger/sql-store.mjs";
import { ownerUrl } from "./owner-url.mjs";

if (process.argv.includes("--roles")) {
  console.error("Roles are created by deploy/provision-db.mjs, which never prints a password. Nothing was changed.");
  process.exit(2);
}
const db = await neon(await ownerUrl());
await migrate(db);
const t = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1");
console.log(`migrated: ${t.rows.map((r) => r.table_name).join(", ")}`);
await db.close();
