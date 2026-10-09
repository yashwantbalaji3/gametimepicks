/**
 * Local filesystem adapter with the SAME semantics as the Vercel Blob store the pilot targets (write-once by default,
 * ETag compare-and-swap) — so the store rules are tested for real without a token. Not for production use.
 * `failNext` lets a test inject a failure on the next put to a key (atomicity tests).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function fsAdapter(root) {
  const failures = new Map();
  const file = (key) => { const p = path.resolve(root, key); if (!p.startsWith(path.resolve(root) + path.sep)) throw new Error("key escapes root"); return p; };
  const etagOf = (text) => `"${crypto.createHash("sha256").update(text).digest("hex").slice(0, 32)}"`;
  return {
    failNext(key, err) { failures.set(key, err); },
    async get(key) { const p = file(key); if (!fs.existsSync(p)) return null; const text = fs.readFileSync(p, "utf8"); return { text, etag: etagOf(text) }; },
    async put(key, text, { allowOverwrite = false, ifMatch } = {}) {
      if (failures.has(key)) { const e = failures.get(key); failures.delete(key); throw e; }
      const p = file(key); const exists = fs.existsSync(p);
      if (exists && !allowOverwrite && !ifMatch) throw Object.assign(new Error("blob already exists"), { code: "EXISTS" });
      if (ifMatch && (!exists || etagOf(fs.readFileSync(p, "utf8")) !== ifMatch)) throw Object.assign(new Error("precondition failed"), { code: "PRECONDITION" });
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const tmp = `${p}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
      fs.writeFileSync(tmp, text); fs.renameSync(tmp, p); // atomic replace, as the store's own write is
      return { etag: etagOf(text) };
    },
  };
}
