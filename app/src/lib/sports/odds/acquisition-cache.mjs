/**
 * THE ACQUISITION CACHE — the bytes we paid for, kept so the transform can be re-run for free.
 *
 * WHY
 * ---
 * A paid capture does two different things in one script: it BUYS a provider response, and it
 * TRANSFORMS that response into a published artifact. The spend guard could not tell them apart, so
 * it stopped both. On 2026-08-27 that meant a corrected join and a corrected coverage classifier
 * each ran against a live UFC card, matched nothing, and changed nothing — the run exited at the
 * cooldown before reaching the transform at all. It took three dispatches to notice, and the wrong
 * labels stayed published in the meantime.
 *
 * A cooldown is a statement about purchases. Re-deriving from bytes already bought costs zero, and
 * a guard that blocks it is not protecting the budget — it is protecting nothing and preventing a
 * fix from landing.
 *
 * WHAT IS STORED
 * --------------
 * The raw response, plus the three things that make it a distinct acquisition rather than a
 * generic cache entry: the response hash (did the provider actually say something new), the
 * provider's own usage headers (what it cost, from the authority rather than our arithmetic), and
 * the acquisition instant (when we looked, which is unrecoverable afterwards).
 *
 * PRIVATE, AND COMMITTED. It is a raw provider payload under a commercial licence, so it lives on
 * the internal research path (outside `app/public`, therefore structurally absent from the export)
 * — the same class and location as the per-book shadow snapshot already kept there.
 *
 * Committed rather than left as a scratch file because CI runners are ephemeral: a cache written on
 * one runner does not exist on the next, and an acquisition cache that only survives inside a
 * single run would make re-derivation work exactly where it is least needed.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Cache schema. Bumping it invalidates every entry, which is the point of having it. */
export const ACQUISITION_VERSION = 1;

/**
 * One file per request fingerprint, so a different market/region/event set is a different
 * acquisition rather than a silent overwrite of the last one.
 */
function entryPath(root, fingerprint) {
  const safe = crypto.createHash("sha256").update(String(fingerprint)).digest("hex").slice(0, 32);
  return path.join(root, "acquisitions", `${safe}.json`);
}

/** Stable hash of the response body — what tells a genuinely new payload from a repeated one. */
export function responseHash(body) {
  return crypto.createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
}

/**
 * Persist a completed paid acquisition.
 *
 * Called only on a real network read. A re-derivation must never rewrite the cache: doing so would
 * move `acquiredAt` forward for bytes nobody re-bought, which is the same provenance lie the board
 * generator's `capturedAt` re-stamping was.
 */
export function writeAcquisition({ root, fingerprint, at, status, headers, body }) {
  const file = entryPath(root, fingerprint);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = {
    version: ACQUISITION_VERSION,
    fingerprint,
    acquiredAt: at,
    status,
    responseHash: responseHash(body),
    // The provider's own accounting, kept verbatim. Our arithmetic is a derivation of this, never
    // a replacement for it.
    providerUsage: {
      last: headers?.["x-requests-last"] ?? null,
      used: headers?.["x-requests-used"] ?? null,
      remaining: headers?.["x-requests-remaining"] ?? null,
    },
    body,
  };
  fs.writeFileSync(file, `${JSON.stringify(payload)}\n`);
  return payload;
}

/**
 * Load a cached acquisition for re-derivation, or null.
 *
 * Fails closed on anything it cannot fully trust — a missing file, a schema it does not recognise,
 * a body whose hash no longer matches what was stored. A half-trusted payload re-derived into a
 * published artifact is worse than no re-derivation, because it looks exactly like a fresh one.
 */
export function readAcquisition({ root, fingerprint }) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(entryPath(root, fingerprint), "utf8"));
  } catch {
    return null;
  }
  if (raw?.version !== ACQUISITION_VERSION) return null;
  if (raw.fingerprint !== fingerprint) return null;
  if (raw.status !== 200) return null;
  if (responseHash(raw.body) !== raw.responseHash) return null;
  return {
    acquiredAt: raw.acquiredAt,
    status: raw.status,
    responseHash: raw.responseHash,
    headers: {
      "x-requests-last": raw.providerUsage?.last ?? null,
      "x-requests-used": raw.providerUsage?.used ?? null,
      "x-requests-remaining": raw.providerUsage?.remaining ?? null,
    },
    body: raw.body,
  };
}
