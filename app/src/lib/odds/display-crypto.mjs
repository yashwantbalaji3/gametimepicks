/**
 * ODDS DISPLAY ARTIFACTS — ENCRYPTED AT REST (founder 2026-10-29). SERVER / BUILD TIME ONLY (node:crypto); nothing under
 * lib/odds/ may reach a client bundle (prop-line-switch-off.test.mjs).
 *
 * Why: the repository is PUBLIC. A plaintext price file committed under data/odds-display/ would itself be a
 * "downloadable file" — the redistribution the provider's terms forbid (the-odds-api.com terms and conditions, updated
 * 2026-08-31: display "in a UI, website…" yes; "your own API, data feed, downloadable files" no). So every display
 * artifact is committed ONLY as `<key>.json.enc`, AES-256-GCM under a 32-byte key that lives in the environment
 * (GTP_ODDS_DISPLAY_KEY: 64 hex characters; Vercel Production env + the founder's local .env). The build decrypts it in
 * memory and renders HTML; the plaintext never touches disk in the repo or out/.
 *
 * KEY HANDLING: read from the environment only (readDisplayKey), never from a file or an argument; the value is never
 * returned in a message, logged, or written. Errors name the variable, never its content.
 *
 * FORMAT `gtp.odds-display.enc@1` — one JSON line:
 *   { format, alg: "AES-256-GCM", kid, aad, iv, tag, ct }   (iv / tag / ct base64)
 *   kid  16 hex chars = HKDF-SHA256(key, info "gtp-odds-display/kid") — identifies WHICH key without revealing it, so a
 *        reader holding a different key returns null (wrong key = not available) instead of failing the build;
 *   aad  the artifact's identity ("nba/lines/2099-01-15", "nfl/lines/999000001"), authenticated: a file renamed to
 *        another date/event fails;
 *   iv   12 bytes = HMAC-SHA256(HKDF(key, "gtp-odds-display/iv"), aad ‖ 0x00 ‖ plaintext)[0..12] — DETERMINISTIC (the
 *        exporters are byte-deterministic: same inputs → same file). An IV repeats only for the identical aad and
 *        plaintext, which yields the identical ciphertext, so no keystream is ever reused across different messages.
 *   The data key is HKDF(key, "gtp-odds-display/enc"); the raw environment key is never used directly.
 * Tampering (iv / tag / ct / aad changed under the right kid) THROWS DisplayArtifactTamperedError — a release error.
 */
import crypto from "node:crypto";

export const ODDS_DISPLAY_KEY_ENV = "GTP_ODDS_DISPLAY_KEY";
export const ODDS_DISPLAY_ENC_FORMAT = "gtp.odds-display.enc@1";
/** The only file extension allowed under data/odds-display/ (guard: odds-display-at-rest.test.mjs). */
export const ODDS_DISPLAY_ENC_EXT = ".json.enc";

const HEX64 = /^[0-9a-fA-F]{64}$/;
const hkdf = (key, info, len = 32) => Buffer.from(crypto.hkdfSync("sha256", key, Buffer.alloc(0), Buffer.from(info, "utf8"), len));

export class DisplayArtifactTamperedError extends Error {
  constructor(msg) {
    super(`odds display artifact failed authentication: ${msg}`);
    this.name = "DisplayArtifactTamperedError";
  }
}

/**
 * The display key from the environment. Never throws; never echoes the value.
 * @param {Record<string, string|undefined>} [env]
 * @returns {{ ok: true, key: Buffer, kid: string } | { ok: false, key: null, kid: null, reason: string }}
 */
export function readDisplayKey(env = process.env) {
  const v = env?.[ODDS_DISPLAY_KEY_ENV];
  if (v == null || String(v).trim() === "") return { ok: false, key: null, kid: null, reason: `${ODDS_DISPLAY_KEY_ENV} is not set` };
  const s = String(v).trim();
  if (!HEX64.test(s)) return { ok: false, key: null, kid: null, reason: `${ODDS_DISPLAY_KEY_ENV} must be 64 hex characters (32 bytes; generate with: openssl rand -hex 32)` };
  const key = Buffer.from(s, "hex");
  return { ok: true, key, kid: keyId(key) };
}

/** The non-secret key identifier (16 hex chars). */
export function keyId(key) {
  return hkdf(key, "gtp-odds-display/kid", 8).toString("hex");
}

/**
 * Encrypt one artifact's text. Deterministic for the same key, aad and plaintext.
 * @param {string} plaintext
 * @param {Buffer} key 32 bytes
 * @param {string} aad the artifact identity, e.g. "nba/lines/2099-01-15"
 * @returns {string} the envelope (one JSON line + "\n")
 */
export function encryptDisplayArtifact(plaintext, key, aad) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("encryptDisplayArtifact: the key must be 32 bytes");
  if (typeof aad !== "string" || aad === "") throw new Error("encryptDisplayArtifact: aad (the artifact identity) is required");
  const pt = Buffer.from(String(plaintext), "utf8");
  const iv = crypto.createHmac("sha256", hkdf(key, "gtp-odds-display/iv")).update(Buffer.concat([Buffer.from(aad, "utf8"), Buffer.from([0]), pt])).digest().subarray(0, 12);
  const c = crypto.createCipheriv("aes-256-gcm", hkdf(key, "gtp-odds-display/enc"), iv);
  c.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([c.update(pt), c.final()]);
  const env = { format: ODDS_DISPLAY_ENC_FORMAT, alg: "AES-256-GCM", kid: keyId(key), aad, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), ct: ct.toString("base64") };
  return `${JSON.stringify(env)}\n`;
}

/**
 * Decrypt one envelope.
 *   no key / a different key (kid mismatch) → null (the artifact is simply not available to this build);
 *   right key but the envelope is malformed, its aad is not `aad`, or authentication fails → THROWS (tampered).
 * @param {string} text
 * @param {Buffer|null} key
 * @param {string} aad the identity the caller expects
 * @returns {string|null} the plaintext
 */
export function decryptDisplayArtifact(text, key, aad) {
  if (!Buffer.isBuffer(key) || key.length !== 32) return null;
  let e;
  try { e = JSON.parse(String(text)); } catch { throw new DisplayArtifactTamperedError("not a JSON envelope"); }
  if (e?.format !== ODDS_DISPLAY_ENC_FORMAT || e?.alg !== "AES-256-GCM") throw new DisplayArtifactTamperedError(`format is not ${ODDS_DISPLAY_ENC_FORMAT}`);
  if (e.kid !== keyId(key)) return null;
  if (e.aad !== aad) throw new DisplayArtifactTamperedError(`identity ${JSON.stringify(e.aad)} is not ${JSON.stringify(aad)}`);
  try {
    const iv = Buffer.from(String(e.iv), "base64"), tag = Buffer.from(String(e.tag), "base64");
    if (iv.length !== 12 || tag.length !== 16) throw new Error("bad iv/tag length");
    const d = crypto.createDecipheriv("aes-256-gcm", hkdf(key, "gtp-odds-display/enc"), iv);
    d.setAAD(Buffer.from(aad, "utf8"));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(Buffer.from(String(e.ct), "base64")), d.final()]).toString("utf8");
  } catch {
    throw new DisplayArtifactTamperedError(`${aad}: ciphertext, iv or tag altered (or not produced with this key)`);
  }
}
