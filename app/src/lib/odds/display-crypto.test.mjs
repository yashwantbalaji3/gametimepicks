/* Odds display artifacts encrypted at rest (AES-256-GCM, founder 2026-10-29). Every key here is a THROWAWAY generated
   inside the test (never written, never printed); every payload is synthetic.
   Run: npx tsx --test src/lib/odds/display-crypto.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  decryptDisplayArtifact, DisplayArtifactTamperedError, encryptDisplayArtifact, keyId, ODDS_DISPLAY_ENC_FORMAT, ODDS_DISPLAY_KEY_ENV, readDisplayKey,
} from "./display-crypto.mjs";

const KEY = crypto.randomBytes(32);
const PLAIN = `${JSON.stringify({ schema: "fixture", rows: [{ book: "fixturebook", line: 1.5, overPrice: -110 }] }, null, 1)}\n`;
const AAD = "nba/lines/2099-01-15";

test("round trip: encrypt → decrypt returns the exact bytes; the envelope carries no plaintext and no key", () => {
  const sealed = encryptDisplayArtifact(PLAIN, KEY, AAD);
  assert.equal(decryptDisplayArtifact(sealed, KEY, AAD), PLAIN);
  const e = JSON.parse(sealed);
  assert.deepEqual(Object.keys(e), ["format", "alg", "kid", "aad", "iv", "tag", "ct"]);
  assert.deepEqual([e.format, e.alg, e.aad], [ODDS_DISPLAY_ENC_FORMAT, "AES-256-GCM", AAD]);
  assert.match(e.kid, /^[0-9a-f]{16}$/);
  assert.doesNotMatch(sealed, /fixturebook|overPrice|-110|1\.5/, "no plaintext in the envelope");
  assert.ok(!sealed.includes(KEY.toString("hex")) && !sealed.includes(KEY.toString("base64")), "no key in the envelope");
  assert.ok(sealed.endsWith("\n") && sealed.split("\n").length === 2, "one line");
});

test("deterministic: same key, identity and plaintext → identical bytes; any change → a different IV", () => {
  assert.equal(encryptDisplayArtifact(PLAIN, KEY, AAD), encryptDisplayArtifact(PLAIN, KEY, AAD));
  const iv = (t) => JSON.parse(t).iv;
  assert.notEqual(iv(encryptDisplayArtifact(PLAIN, KEY, AAD)), iv(encryptDisplayArtifact(`${PLAIN} `, KEY, AAD)));
  assert.notEqual(iv(encryptDisplayArtifact(PLAIN, KEY, AAD)), iv(encryptDisplayArtifact(PLAIN, KEY, "nba/lines/2099-01-16")));
  assert.notEqual(encryptDisplayArtifact(PLAIN, KEY, AAD), encryptDisplayArtifact(PLAIN, crypto.randomBytes(32), AAD));
});

test("no key or a different key → null (not available to this build), never an exception", () => {
  const sealed = encryptDisplayArtifact(PLAIN, KEY, AAD);
  assert.equal(decryptDisplayArtifact(sealed, null, AAD), null);
  assert.equal(decryptDisplayArtifact(sealed, Buffer.alloc(16), AAD), null);
  assert.equal(decryptDisplayArtifact(sealed, crypto.randomBytes(32), AAD), null);
});

test("tamper under the right key THROWS: ciphertext, tag, iv, identity (a renamed file), or a broken envelope", () => {
  const sealed = encryptDisplayArtifact(PLAIN, KEY, AAD);
  const e = JSON.parse(sealed);
  const flip = (b64) => { const b = Buffer.from(b64, "base64"); b[0] ^= 1; return b.toString("base64"); };
  for (const [what, text, aad] of [
    ["ciphertext", JSON.stringify({ ...e, ct: flip(e.ct) }), AAD],
    ["tag", JSON.stringify({ ...e, tag: flip(e.tag) }), AAD],
    ["iv", JSON.stringify({ ...e, iv: flip(e.iv) }), AAD],
    ["identity in the envelope", JSON.stringify({ ...e, aad: "nba/lines/2099-01-16" }), "nba/lines/2099-01-16"],
    ["renamed to another date", sealed, "nba/lines/2099-01-16"],
    ["not JSON", "garbage", AAD],
    ["wrong format", JSON.stringify({ ...e, format: "x" }), AAD],
  ]) assert.throws(() => decryptDisplayArtifact(text, KEY, aad), DisplayArtifactTamperedError, what);
});

test("the key comes from GTP_ODDS_DISPLAY_KEY only: 64 hex chars; a refusal names the variable, never the value", () => {
  assert.equal(ODDS_DISPLAY_KEY_ENV, "GTP_ODDS_DISPLAY_KEY");
  const hex = KEY.toString("hex");
  const ok = readDisplayKey({ [ODDS_DISPLAY_KEY_ENV]: hex });
  assert.equal(ok.ok, true);
  assert.ok(ok.key.equals(KEY));
  assert.equal(ok.kid, keyId(KEY));
  for (const v of [undefined, "", "  ", hex.slice(2), `${hex}00`, `zz${hex.slice(2)}`]) {
    const r = readDisplayKey({ [ODDS_DISPLAY_KEY_ENV]: v });
    assert.equal(r.ok, false, String(v));
    assert.equal(r.key, null);
    assert.match(r.reason, /GTP_ODDS_DISPLAY_KEY/);
    if (v && v.trim()) assert.ok(!r.reason.includes(v.trim()), "the value is never echoed");
  }
  assert.throws(() => encryptDisplayArtifact(PLAIN, Buffer.alloc(31), AAD), /32 bytes/);
  assert.throws(() => encryptDisplayArtifact(PLAIN, KEY, ""), /aad/);
});

test("server only: the module reads no file and logs nothing", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/odds/display-crypto.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(src, /console\.|readFileSync|writeFileSync|^"use client"/m);
});
