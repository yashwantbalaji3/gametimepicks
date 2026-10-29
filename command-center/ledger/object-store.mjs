/**
 * OBJECT STORE — write-once blobs by key: rendered media, screenshots, raw run logs, G3 change sets.
 *
 *   put(key, bytes, contentType)   first write wins; writing the same key again with the same bytes is a no-op,
 *                                  with different bytes it throws (nothing is ever silently replaced)
 *   get(key)                       → { body: Buffer, contentType, sha256 } | null
 *
 * Two implementations with one contract: a directory (local console and dev server) and Postgres (hosted; the
 * stored_objects table from migration 003). Keys are "media/<file>", "runs/<file>" or "patches/<file>".
 */
import fs from "node:fs";
import path from "node:path";
import { sha256 } from "../lib/util.mjs";

const KEY = /^(media|runs|patches|strategies)\/[A-Za-z0-9._-]{1,160}$/;
export const MAX_OBJECT_BYTES = 8 * 1024 * 1024;

function check(key, bytes) {
  if (!KEY.test(key)) throw new Error(`invalid object key ${JSON.stringify(key)}`);
  if (bytes && bytes.length > MAX_OBJECT_BYTES) throw new Error(`object ${key} is ${bytes.length} bytes (max ${MAX_OBJECT_BYTES})`);
}

export function dirObjectStore(root) {
  return {
    kind: "dir",
    async put(key, bytes, contentType) {
      check(key, bytes);
      const file = path.join(root, key);
      if (fs.existsSync(file)) {
        if (sha256(fs.readFileSync(file)) !== sha256(bytes)) throw new Error(`object ${key} already exists with different content`);
        return { key, created: false };
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes);
      fs.writeFileSync(`${file}.type`, contentType);
      return { key, created: true };
    },
    async get(key) {
      check(key);
      const file = path.join(root, key);
      if (!fs.existsSync(file)) return null;
      const body = fs.readFileSync(file);
      const type = fs.existsSync(`${file}.type`) ? fs.readFileSync(`${file}.type`, "utf8") : "application/octet-stream";
      return { body, contentType: type, sha256: sha256(body) };
    },
  };
}

/** @param {{ db: object, clock: () => string }} o */
export function sqlObjectStore({ db, clock }) {
  return {
    kind: "sql",
    async put(key, bytes, contentType) {
      check(key, bytes);
      const digest = sha256(bytes);
      const r = await db.query(
        "INSERT INTO stored_objects (key, content_type, bytes, sha256, size, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (key) DO NOTHING RETURNING key",
        [key, contentType, bytes, digest, bytes.length, clock()],
      );
      if (r.rows.length) return { key, created: true };
      const existing = await db.query("SELECT sha256 FROM stored_objects WHERE key = $1", [key]);
      if (existing.rows[0]?.sha256 !== digest) throw new Error(`object ${key} already exists with different content`);
      return { key, created: false };
    },
    async get(key) {
      check(key);
      const r = await db.query("SELECT content_type, bytes, sha256 FROM stored_objects WHERE key = $1", [key]);
      const row = r.rows[0];
      return row ? { body: Buffer.from(row.bytes), contentType: row.content_type, sha256: row.sha256 } : null;
    },
  };
}

/**
 * After a job: upload what the worker wrote under outDir/media and outDir/runs (raw logs capped at 2 MB, with a
 * marker) so the hosted app can serve them. Returns the keys uploaded.
 */
export async function uploadOutputs(objects, outDir, { maxLogBytes = 2 * 1024 * 1024 } = {}) {
  const TYPES = { ".png": "image/png", ".jsonl": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8" };
  const done = [];
  for (const sub of ["media", "runs", "strategies"]) {
    const dir = path.join(outDir, sub);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      const type = TYPES[path.extname(name)];
      if (!type || !KEY.test(`${sub}/${name}`)) continue;
      let bytes = fs.readFileSync(path.join(dir, name));
      if (sub === "runs" && bytes.length > maxLogBytes) bytes = Buffer.concat([bytes.subarray(0, maxLogBytes), Buffer.from(`\n… truncated at ${maxLogBytes} bytes\n`)]);
      const r = await objects.put(`${sub}/${name}`, bytes, type);
      if (r.created) done.push(r.key);
    }
  }
  return done;
}

/**
 * HOSTED MEDIA (2026-10-29): bytes in a PRIVATE Vercel Blob store, a permanent reference row in Postgres.
 *
 *   put   write-once like the others: a key already stored (here or, before this store existed, in stored_objects) with
 *         the same bytes is a no-op, with different bytes it throws. The blob is written with overwrite refused; a blob
 *         left by an interrupted earlier put is accepted only if its bytes hash the same.
 *   get   reads the reference, then the bytes, and checks the bytes still hash to the recorded sha256 (a swapped or
 *         corrupted file is refused, never served). Keys written before this store existed are read from stored_objects.
 *   remove (retention only) deletes the BYTES and records the deletion with the hash and reason; the reference and the
 *         ledger keep the evidence. A removed key reads as null.
 *
 * `client` is the @vercel/blob SDK ({ put, get, del }); tests inject a fake. Reads and writes always pass
 * access: "private". On Vercel the SDK authenticates with the project's OIDC token; elsewhere (the GitHub worker,
 * a migration run on the Mac) with BLOB_READ_WRITE_TOKEN — never a public URL.
 *
 * @param {{ db: object, clock: () => string, client?: object, prefix?: string }} o
 */
export function blobObjectStore({ db, clock, client = null, prefix = "gtp-cc" }) {
  let sdk = client;
  const blob = async () => (sdk ??= await import("@vercel/blob"));
  const pathOf = (key) => `${prefix}/${key}`;
  const legacy = sqlObjectStore({ db, clock });
  const readAll = async (stream) => {
    const chunks = [];
    for await (const c of stream) chunks.push(Buffer.from(c));
    return Buffer.concat(chunks);
  };
  async function ref(key) {
    const r = await db.query("SELECT r.key, r.content_type, r.sha256, r.size, r.pathname, d.deleted_at FROM stored_object_refs r LEFT JOIN stored_object_deletions d ON d.key = r.key WHERE r.key = $1", [key]);
    return r.rows[0] ?? null;
  }
  return {
    kind: "blob",
    async put(key, bytes, contentType) {
      check(key, bytes);
      const digest = sha256(bytes);
      const have = await ref(key);
      if (have) {
        if (have.sha256 !== digest) throw new Error(`object ${key} already exists with different content`);
        return { key, created: false };
      }
      const old = await db.query("SELECT sha256 FROM stored_objects WHERE key = $1", [key]);
      if (old.rows[0]) {
        if (old.rows[0].sha256 !== digest) throw new Error(`object ${key} already exists with different content`);
        return { key, created: false };
      }
      const b = await blob();
      try {
        await b.put(pathOf(key), bytes, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false });
      } catch (err) {
        // an earlier put may have written the blob and then failed before its reference row: accept identical bytes only
        const existing = await b.get(pathOf(key), { access: "private", useCache: false }).catch(() => null);
        if (!existing || existing.statusCode !== 200 || sha256(await readAll(existing.stream)) !== digest) throw err;
      }
      await db.query(
        "INSERT INTO stored_object_refs (key, content_type, sha256, size, storage, pathname, created_at) VALUES ($1, $2, $3, $4, 'blob', $5, $6) ON CONFLICT (key) DO NOTHING",
        [key, contentType, digest, bytes.length, pathOf(key), clock()],
      );
      return { key, created: true };
    },
    async get(key) {
      check(key);
      const r = await ref(key);
      if (!r) return legacy.get(key);
      if (r.deleted_at) return null;
      const res = await (await blob()).get(r.pathname, { access: "private" });
      if (!res || res.statusCode !== 200 || !res.stream) return null;
      const body = await readAll(res.stream);
      if (sha256(body) !== r.sha256) throw new Error(`object ${key} failed its integrity check (stored bytes differ from the recorded sha256)`);
      return { body, contentType: r.content_type, sha256: r.sha256 };
    },
    /** Retention only: delete the bytes, record why. Evidence (key, hash, ledger) stays. */
    async remove(key, reason) {
      check(key);
      const r = await ref(key);
      if (!r || r.deleted_at) return { key, removed: false };
      await (await blob()).del(r.pathname);
      await db.query("INSERT INTO stored_object_deletions (key, sha256, reason, deleted_at) VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING", [key, r.sha256, String(reason).slice(0, 300), clock()]);
      return { key, removed: true };
    },
    /** Every reference (for retention planning and backups); `deleted` marks removed bytes. */
    async listRefs() {
      const r = await db.query("SELECT r.key, r.sha256, r.size, r.created_at, d.deleted_at FROM stored_object_refs r LEFT JOIN stored_object_deletions d ON d.key = r.key ORDER BY r.created_at");
      return r.rows.map((x) => ({ key: x.key, sha256: x.sha256, size: Number(x.size), createdAt: x.created_at, deleted: Boolean(x.deleted_at) }));
    },
  };
}
