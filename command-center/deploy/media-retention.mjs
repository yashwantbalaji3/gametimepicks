#!/usr/bin/env node
/**
 * Apply the media retention policy (ledger/media-retention.mjs) to the hosted Blob store. DRY RUN unless --apply.
 * Run from the Mac with the Neon OWNER connection string (only the owner may write stored_object_deletions) and the
 * Blob token; neither is stored anywhere by this script:
 *
 *   node command-center/deploy/media-retention.mjs [--keep-days 14] [--apply]   (asks for both, hidden)
 *
 * Removes only bytes; every key keeps its reference row and sha256, and each removal is recorded with its reason.
 * Media of any approved or published post is never a candidate.
 */
import { neon } from "../ledger/pg-adapters.mjs";
import { createSqlStore } from "../ledger/sql-store.mjs";
import { blobObjectStore } from "../ledger/object-store.mjs";
import { planRetention, DEFAULT_KEEP_DAYS } from "../ledger/media-retention.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { ownerUrl, secretInput } from "./owner-url.mjs";

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const apply = process.argv.includes("--apply");
const keepDays = Number(arg("--keep-days") ?? DEFAULT_KEEP_DAYS);
if (!(keepDays >= 7)) {
  console.error("--keep-days must be at least 7.");
  process.exit(2);
}
const clock = () => new Date().toISOString();
const owner = await ownerUrl();
await secretInput("BLOB_READ_WRITE_TOKEN", "Vercel Blob read-write token");
const db = await neon(owner);
const session = await createSqlStore({ db, clock }).open();
const o = createOrchestrator({ store: session, clock, outDir: "/tmp/gtp-cc-retention", env: { GTP_CC_BUDGET_USD: "0" }, execution: "jobs", hosted: true });
const objects = blobObjectStore({ db, clock });
const plan = planRetention({ posts: o.state().posts, refs: await objects.listRefs(), now: clock(), keepDays });

console.log(`${apply ? "APPLY" : "DRY RUN"} · keep ${plan.keep.length} · remove ${plan.remove.length} (${(plan.bytes / 1e6).toFixed(1)} MB) · keepDays ${keepDays}`);
for (const r of plan.remove) console.log(`  remove ${r.key}  ${r.why}`);
if (apply) {
  let n = 0;
  for (const r of plan.remove) if ((await objects.remove(r.key, r.why)).removed) n++;
  console.log(`removed ${n}; references and hashes kept.`);
} else console.log("Nothing removed. Re-run with --apply to remove the listed bytes.");
await db.close();
