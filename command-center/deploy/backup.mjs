#!/usr/bin/env node
/**
 * Encrypted backup of the hosted Command Center to a file on this Mac: every ledger entry and claim, every media
 * reference and deletion record, the auth audit (no secrets: cc_secrets and sessions are NOT exported), and the BYTES
 * of every image an approved or published post used (the audit evidence; drafts are re-renderable and left out).
 *
 *   node command-center/deploy/backup.mjs --new-key                       print a fresh key (keep it in your password manager)
 *   node command-center/deploy/backup.mjs --out ~/GTP-backups            write gtp-cc-backup-<time>.enc
 *   node command-center/deploy/backup.mjs --verify <file>                decrypt + check counts and hashes
 * The owner string, Blob token and backup key are asked for at hidden prompts (or taken from the environment).
 *
 * Format: "GTPCCB1" | 12-byte IV | 16-byte GCM tag | AES-256-GCM(gzip(JSON)). Tampering fails the tag check.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { sha256 } from "../lib/util.mjs";
import { ownerUrl, secretInput } from "./owner-url.mjs";

const MAGIC = Buffer.from("GTPCCB1");
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };

export function seal(obj, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(zlib.gzipSync(JSON.stringify(obj))), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}
export function open(buf, key) {
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("not a Command Center backup");
  const iv = buf.subarray(7, 19);
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(buf.subarray(19, 35));
  return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(35)), d.final()])).toString("utf8"));
}
/** Every check a restore relies on: media bytes hash to their references, counts match the manifest. */
export function check(b) {
  const bad = Object.entries(b.media).filter(([k, v]) => sha256(Buffer.from(v.base64, "base64")) !== v.sha256).map(([k]) => k);
  const counts = { entries: b.entries.length, claims: b.claims.length, refs: b.refs.length, deletions: b.deletions.length, media: Object.keys(b.media).length };
  return { ok: !bad.length && JSON.stringify(counts) === JSON.stringify(b.counts), counts, badMedia: bad };
}
const keyFrom = (s) => {
  const k = Buffer.from(String(s ?? ""), "base64url");
  if (k.length !== 32) { console.error("GTP_CC_BACKUP_KEY must be 32 bytes, base64url (make one with --new-key)."); process.exit(2); }
  return k;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--new-key")) {
    console.log(crypto.randomBytes(32).toString("base64url"));
  } else if (arg("--verify")) {
    const r = check(open(fs.readFileSync(arg("--verify")), keyFrom(await secretInput("GTP_CC_BACKUP_KEY", "Backup key"))));
    console.log(`${r.ok ? "OK" : "FAILED"} ${JSON.stringify(r.counts)}${r.badMedia.length ? ` bad media: ${r.badMedia.join(", ")}` : ""}`);
    process.exitCode = r.ok ? 0 : 1;
  } else {
    const key = keyFrom(await secretInput("GTP_CC_BACKUP_KEY", "Backup key"));
    const owner = await ownerUrl();
    await secretInput("BLOB_READ_WRITE_TOKEN", "Vercel Blob read-write token");
    const { neon } = await import("../ledger/pg-adapters.mjs");
    const { readSql } = await import("../ledger/ledger-sync.mjs");
    const { blobObjectStore, sqlObjectStore } = await import("../ledger/object-store.mjs");
    const { createSqlStore } = await import("../ledger/sql-store.mjs");
    const { createOrchestrator } = await import("../orchestrator/orchestrator.mjs");
    const { planRetention } = await import("../ledger/media-retention.mjs");
    const clock = () => new Date().toISOString();
    const db = await neon(owner);
    const { entries, claims } = await readSql(db);
    const refs = (await db.query("SELECT * FROM stored_object_refs ORDER BY created_at")).rows;
    const deletions = (await db.query("SELECT * FROM stored_object_deletions ORDER BY deleted_at")).rows;
    const objects = process.env.BLOB_READ_WRITE_TOKEN ? blobObjectStore({ db, clock }) : sqlObjectStore({ db, clock });
    const o = createOrchestrator({ store: await createSqlStore({ db, clock }).open(), clock, outDir: path.join(os.tmpdir(), "gtp-cc-backup"), env: { GTP_CC_BUDGET_USD: "0" }, execution: "jobs", hosted: true, queueRender: false });
    const plan = planRetention({ posts: o.state().posts, refs: refs.map((r) => ({ key: r.key, createdAt: r.created_at, size: r.size, deleted: false })), now: clock(), keepDays: 0 });
    const evidence = plan.keep.filter((k) => /^(published|approved)/.test(k.why)).map((k) => k.key);
    const media = {};
    for (const k of evidence) {
      const got = await objects.get(k);
      if (got) media[k] = { sha256: got.sha256, contentType: got.contentType, base64: got.body.toString("base64") };
    }
    const b = { schema: "gtp.cc.backup@1", at: clock(), entries, claims, refs, deletions, media };
    b.counts = { entries: entries.length, claims: claims.length, refs: refs.length, deletions: deletions.length, media: Object.keys(media).length };
    const dir = path.resolve(arg("--out") ?? ".");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `gtp-cc-backup-${b.at.replace(/[:.]/g, "-")}.enc`);
    fs.writeFileSync(file, seal(b, key), { flag: "wx", mode: 0o600 });
    const r = check(open(fs.readFileSync(file), key));
    console.log(`${r.ok ? "wrote" : "FAILED"} ${file} ${JSON.stringify(r.counts)}`);
    await db.close();
  }
}
