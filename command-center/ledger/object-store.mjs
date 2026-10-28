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

const KEY = /^(media|runs|patches)\/[A-Za-z0-9._-]{1,160}$/;
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
  const TYPES = { ".png": "image/png", ".jsonl": "text/plain; charset=utf-8" };
  const done = [];
  for (const sub of ["media", "runs"]) {
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
