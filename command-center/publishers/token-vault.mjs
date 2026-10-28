/**
 * SECRET STORAGE for the X connection — the OAuth tokens and (for a confidential X app) the client secret.
 *
 *   keychain  the founder's Mac: macOS Keychain, service "gtp-command-center". Values go to `security` on stdin
 *             (`security -i`), never on a command line, so they never appear in `ps`, shell history or logs.
 *   sql       hosted: AES-256-GCM in Postgres (table cc_secrets), key from GTP_CC_SECRET_KEY (32 random bytes,
 *             base64), which lives only in the hosting provider's encrypted environment settings.
 *   memory    tests.
 *
 * A vault never logs, prints or returns a secret except to its caller; errors name the item, never its value.
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

export const KEYCHAIN_SERVICE = "gtp-command-center";
/** The names the X integration uses. */
export const SECRET = Object.freeze({ tokens: "x-oauth-tokens", clientId: "x-client-id", clientSecret: "x-client-secret" });

export function createMemoryVault(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { kind: "memory", get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, String(v)), delete: async (k) => void m.delete(k) };
}

/**
 * `security -i` reads commands from stdin, so a value is written base64url-encoded (letters, digits, - and _ only:
 * nothing the command parser could misread, whatever the value — JSON tokens included) and decoded on read.
 */
const ENC = "b64u:";
const encodeForKeychain = (v) => `${ENC}${Buffer.from(String(v), "utf8").toString("base64url")}`;
const decodeFromKeychain = (v) => (v.startsWith(ENC) ? Buffer.from(v.slice(ENC.length), "base64url").toString("utf8") : v);

export function createKeychainVault({ service = KEYCHAIN_SERVICE, run = spawnSync } = {}) {
  if (process.platform !== "darwin" && run === spawnSync) throw new Error("the Keychain vault needs macOS");
  return {
    kind: "keychain",
    async get(name) {
      const r = run("security", ["find-generic-password", "-s", service, "-a", name, "-w"], { encoding: "utf8" });
      if (r.status !== 0) return null;
      const raw = String(r.stdout).replace(/\n$/, "");
      return raw ? decodeFromKeychain(raw) : null;
    },
    async set(name, value) {
      if (!/^[a-z0-9-]+$/.test(name)) throw new Error("invalid secret name");
      const r = run("security", ["-i"], { input: `add-generic-password -U -s "${service}" -a "${name}" -w "${encodeForKeychain(value)}"\n`, encoding: "utf8" });
      if (r.status !== 0) throw new Error(`could not save ${name} to the Keychain (security exited ${r.status})`);
    },
    async delete(name) {
      run("security", ["delete-generic-password", "-s", service, "-a", name], { encoding: "utf8" });
    },
  };
}

/** Hosted: encrypted rows. `key` = 32 bytes (GTP_CC_SECRET_KEY, base64). Each value has its own random IV. */
export function createSqlVault({ db, key, clock = () => new Date().toISOString() }) {
  const k = Buffer.from(String(key ?? ""), "base64");
  if (k.length !== 32) throw new Error("GTP_CC_SECRET_KEY must be 32 random bytes, base64");
  return {
    kind: "sql",
    async get(name) {
      const r = await db.query("SELECT iv, tag, ciphertext FROM cc_secrets WHERE name = $1", [name]);
      const row = r.rows[0];
      if (!row) return null;
      const d = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(row.iv, "base64"));
      d.setAAD(Buffer.from(name));
      d.setAuthTag(Buffer.from(row.tag, "base64"));
      return Buffer.concat([d.update(Buffer.from(row.ciphertext, "base64")), d.final()]).toString("utf8");
    },
    async set(name, value) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv("aes-256-gcm", k, iv);
      c.setAAD(Buffer.from(name));
      const ct = Buffer.concat([c.update(String(value), "utf8"), c.final()]);
      await db.query(
        "INSERT INTO cc_secrets (name, iv, tag, ciphertext, updated_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO UPDATE SET iv = EXCLUDED.iv, tag = EXCLUDED.tag, ciphertext = EXCLUDED.ciphertext, updated_at = EXCLUDED.updated_at",
        [name, iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64"), clock()],
      );
    },
    async delete(name) {
      await db.query("DELETE FROM cc_secrets WHERE name = $1", [name]);
    },
  };
}
