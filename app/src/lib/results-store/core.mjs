/**
 * RUNTIME RESULTS STORE — the write and read rules (COST-001 Stage B / LEDGER-001 / RESULTS-001; LOCAL PILOT, not deployed).
 *
 * Design: docs/research/ops/runtime-results-pilot-design-2026-10-09.md. Settlement publishes graded results WITHOUT a git
 * push, so without a Vercel build, into a store with two kinds of object:
 *
 *   results/v1/<sport>/<family>/<eventId>/<sha16>.json   an IMMUTABLE version: write-once, content-addressed
 *   results/v1/<sport>/<family>/manifest.json            the CURRENT pointer per event, replaced by compare-and-swap
 *
 * The rules, each pinned by results-store.test.mjs:
 *   · idempotent — the same content is the same key; "already exists" is success, not a second version;
 *   · versions before pointer — a version is written before the manifest names it, so a reader never sees a pointer to
 *     nothing, and a failed manifest write leaves the previous current untouched (atomic publication);
 *   · no lost update — the manifest is replaced only if its ETag is unchanged since it was read; on a conflict the
 *     writer re-reads and re-applies (bounded retries), so two concurrent settlers both land;
 *   · corrections add — a corrected result is a new version with `supersedes`; nothing is overwritten or deleted;
 *   · rollback moves the pointer back to a version that exists, and is itself recorded.
 *
 * The adapter is the only storage-specific part: `get(key, { fresh }) → { text, etag } | null` and
 * `put(key, text, { allowOverwrite, ifMatch }) → { etag }`, throwing an error whose `code` is "EXISTS" (write-once key
 * taken) or "PRECONDITION" (ETag moved). fs-adapter.mjs implements it on disk for tests; blob-adapter.mjs on Vercel Blob.
 */
import crypto from "node:crypto";

export const PREFIX = "results/v1";
const SEG = /^[a-z0-9][a-z0-9-]{0,40}$/;
const EVENT = /^[0-9]{5,12}$/;

export function keysFor({ sport, family, eventId }) {
  if (!SEG.test(String(sport)) || !SEG.test(String(family))) throw new Error("bad sport/family");
  if (eventId != null && !EVENT.test(String(eventId))) throw new Error("bad event id");
  const base = `${PREFIX}/${sport}/${family}`;
  return { manifest: `${base}/manifest.json`, eventDir: eventId != null ? `${base}/${eventId}` : null };
}

/** Canonical JSON (sorted keys) so equal content always hashes to the same key. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
export const sha16 = (text) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);

async function readManifest(store, key) {
  const got = await store.get(key, { fresh: true });
  if (!got) return { manifest: { schemaVersion: 1, events: {} }, etag: null };
  return { manifest: JSON.parse(got.text), etag: got.etag };
}

async function casManifest(store, key, mutate, { now, retries = 3 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const { manifest, etag } = await readManifest(store, key);
    const next = mutate(structuredClone(manifest));
    if (next === null) return { changed: false, manifest };
    next.updatedAt = now;
    try {
      await store.put(key, JSON.stringify(next), etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false });
      return { changed: true, manifest: next, attempts: attempt };
    } catch (e) {
      if (e?.code !== "PRECONDITION" && e?.code !== "EXISTS") throw e; // a real failure: the old pointer stands
    }
  }
  throw Object.assign(new Error("manifest contention: retries exhausted — the previous current version stands"), { code: "CONTENTION" });
}

/**
 * Publish one event's result. `body` must already be public-safe (see wm2-projection.mjs). Returns the version key and
 * whether anything changed. Never deletes, never overwrites a version.
 */
export async function publishResult(store, { sport, family, eventId, body, finality, now }) {
  const { manifest: mKey, eventDir } = keysFor({ sport, family, eventId });
  const text = canonical(body);
  const vKey = `${eventDir}/${sha16(text)}.json`;
  let created = true;
  try { await store.put(vKey, text, { allowOverwrite: false }); }
  catch (e) { if (e?.code !== "EXISTS") throw e; created = false; } // same content = same version: idempotent
  const res = await casManifest(store, mKey, (m) => {
    const ev = m.events[eventId];
    if (ev?.current === vKey && ev.finality === finality) return null; // already current: nothing to do
    m.events[eventId] = {
      current: vKey, finality, publishedAt: now,
      supersedes: ev?.current && ev.current !== vKey ? ev.current : ev?.supersedes ?? null,
      versions: [...new Set([...(ev?.versions ?? []), vKey])],
    };
    return m;
  }, { now });
  return { versionKey: vKey, versionCreated: created, pointerChanged: res.changed };
}

/** Point an event back at an earlier version. The version must exist and be one of the event's recorded versions. */
export async function rollback(store, { sport, family, eventId, toKey, now, reason }) {
  const { manifest: mKey } = keysFor({ sport, family, eventId });
  if (!(await store.get(toKey, { fresh: true }))) throw new Error("rollback target does not exist");
  return casManifest(store, mKey, (m) => {
    const ev = m.events[eventId];
    if (!ev || !ev.versions.includes(toKey)) throw new Error("rollback target is not a recorded version of this event");
    if (ev.current === toKey) return null;
    m.events[eventId] = { ...ev, current: toKey, rolledBackAt: now, rollbackReason: String(reason ?? "").slice(0, 200), supersedes: ev.current };
    return m;
  }, { now });
}

/** The current version of one event, with the manifest facts a reader needs to judge freshness. */
export async function readCurrent(store, { sport, family, eventId }) {
  const { manifest: mKey } = keysFor({ sport, family, eventId });
  const got = await store.get(mKey, { fresh: false });
  if (!got) return null;
  const m = JSON.parse(got.text);
  const ev = m.events?.[eventId];
  if (!ev) return null;
  const v = await store.get(ev.current, { fresh: false });
  if (!v) return null;
  return { result: JSON.parse(v.text), versionKey: ev.current, finality: ev.finality, publishedAt: ev.publishedAt, manifestUpdatedAt: m.updatedAt ?? null, versions: ev.versions.length };
}
