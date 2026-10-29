#!/usr/bin/env node
/**
 * Copy the ledger (entries + once-only claims) and the approved media between this Mac and the hosted Command
 * Center. DRY RUN unless --apply. Never edits or removes a record; verifies afterwards. See ledger/ledger-sync.mjs.
 *
 *   DATABASE_URL_OWNER='postgres://…' BLOB_READ_WRITE_TOKEN='…' \
 *     node command-center/deploy/sync-ledger.mjs --to-hosted [--apply]     Mac → hosted (migration; cutover re-sync)
 *     node command-center/deploy/sync-ledger.mjs --to-local  [--apply]     hosted → Mac (rollback)
 *   options: --ledger <dir> (default command-center/out/console/ledger) · --media <dir> (default …/out/console/media)
 *            --pglite <dir> instead of DATABASE_URL_OWNER (a local staging database) · --no-media (ledger only)
 *
 * The local console may keep running: both ledgers are append-only, and a claim either side takes meanwhile is
 * detected as a conflict before anything is written.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon, pglite } from "../ledger/pg-adapters.mjs";
import { migrate } from "../ledger/sql-store.mjs";
import { createFileStore } from "../ledger/file-store.mjs";
import { blobObjectStore, sqlObjectStore } from "../ledger/object-store.mjs";
import { readSql, readFile, planSync, verifySync, applyToSql, applyToFile, mediaKeysOf, pushMedia, pullMedia } from "../ledger/ledger-sync.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const has = (f) => process.argv.includes(f);
const toHosted = has("--to-hosted");
if (toHosted === has("--to-local")) { console.error("Give exactly one of --to-hosted / --to-local."); process.exit(2); }
const apply = has("--apply");
const ledgerDir = path.resolve(arg("--ledger", path.join(HERE, "../out/console/ledger")));
const mediaDir = path.resolve(arg("--media", path.join(HERE, "../out/console/media")));
const pg = arg("--pglite");
if (!pg && !process.env.DATABASE_URL_OWNER) { console.error("Set DATABASE_URL_OWNER (or --pglite <dir> for a local staging database)."); process.exit(2); }

const clock = () => new Date().toISOString();
const db = pg ? await pglite(path.resolve(pg)) : await neon(process.env.DATABASE_URL_OWNER);
await migrate(db);
const files = createFileStore({ dir: ledgerDir, clock });
const objects = process.env.BLOB_READ_WRITE_TOKEN ? blobObjectStore({ db, clock }) : sqlObjectStore({ db, clock });

const local = readFile(files);
const hosted = await readSql(db);
const [from, to] = toHosted ? [local, hosted] : [hosted, local];
const plan = planSync(from, to);
const where = toHosted ? "Mac → hosted" : "hosted → Mac";
console.log(`${apply ? "APPLY" : "DRY RUN"} ${where}: source ${from.entries.length} entries / ${from.claims.length} claims; target ${to.entries.length} / ${to.claims.length}`);
console.log(`  to copy: ${plan.entries.length} entries, ${plan.claims.length} claims · conflicts: ${plan.conflicts.length} · bad ids: ${plan.badIds.length}`);
for (const c of plan.conflicts.slice(0, 20)) console.log(`  CONFLICT ${c.key}`);
const keys = mediaKeysOf(from.entries);
console.log(`  media referenced by posts: ${keys.length} (store: ${objects.kind})`);
if (plan.conflicts.length || plan.badIds.length) { console.error("Refused: resolve the conflicts above first. Nothing was written."); process.exit(1); }

if (apply) {
  const r = toHosted ? await applyToSql(db, plan) : applyToFile(files, plan);
  console.log(`  copied ${r.entries} entries, ${r.claims} claims`);
  const m = has("--no-media") ? { skipped: true } : toHosted ? await pushMedia(objects, mediaDir, keys) : await pullMedia(objects, mediaDir, keys);
  console.log(`  media: ${JSON.stringify({ ...m, missingLocally: m.missingLocally?.length, unavailable: m.unavailable?.length, conflicts: m.conflicts?.length })}`);
  const after = toHosted ? await readSql(db) : readFile(files);
  const v = verifySync(from, after);
  console.log(`  verify: ${v.ok ? "OK" : "FAILED"} — ${v.entries} entries, ${v.claims} claims checked; missing ${v.missing.length}, changed ${v.changed.length}, claims missing ${v.claimsMissing.length}, claims differ ${v.claimsDiffer.length}`);
  if (!v.ok || m.conflicts?.length) process.exitCode = 1;
} else console.log("Nothing written. Re-run with --apply.");
await db.close();
