/**
 * LEDGER SYNC — copy the append-only ledger between the local Mac (file store) and the hosted database, both ways,
 * without ever changing or dropping a record. Used for the migration, the incremental re-sync at cutover, and a
 * rollback. deploy/sync-ledger.mjs is the command; this module is the logic (tested on PGlite).
 *
 *   entries  copied by id (a hash of the content), keeping id, time, actor and data exactly: present → skipped.
 *   claims   the once-only keys (xlive|<post>|<n> send claims among them) are copied too, so a post one host sent
 *            or started can never be sent again by the other. A claim held on both sides with DIFFERENT values is a
 *            conflict: the whole sync stops before writing anything.
 *   media    approved images follow the ledger (local files → private Blob; Blob → local files), write-once and
 *            hash-checked.
 * Every run is planned first (dry run) and verified after (every source id and claim present on the target, equal).
 */
import fs from "node:fs";
import path from "node:path";
import { canonicalJson, sha256, shortId } from "../lib/util.mjs";
import { LEDGER_LOCK } from "./sql-store.mjs";

const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);
const contentOk = (e) => shortId(e.kind, { at: e.at, actor: e.actor, data: e.data }) === e.id;

export async function readSql(db) {
  const e = await db.query("SELECT id, at, kind, actor, data FROM ledger_entries ORDER BY seq");
  const c = await db.query("SELECT key_hash, key, value FROM ledger_claims ORDER BY seq");
  return {
    entries: e.rows.map((r) => ({ id: r.id, at: r.at, kind: r.kind, actor: r.actor, data: parse(r.data) })),
    claims: c.rows.map((r) => ({ key: r.key, value: parse(r.value) })),
  };
}
export const readFile = (fileStore) => ({ entries: fileStore.list(), claims: fileStore.listClaims() });

/** What copying `from` into `to` would add, and any conflict that forbids it. */
export function planSync(from, to) {
  const have = new Set(to.entries.map((e) => e.id));
  const theirClaims = new Map(to.claims.map((c) => [sha256(c.key), c]));
  const entries = from.entries.filter((e) => !have.has(e.id)).sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? -1 : 1));
  const claims = [];
  const conflicts = [];
  for (const c of from.claims) {
    const t = theirClaims.get(sha256(c.key));
    if (!t) claims.push(c);
    else if (canonicalJson(t.value) !== canonicalJson(c.value)) conflicts.push({ key: c.key, from: c.value, to: t.value });
  }
  const badIds = entries.filter((e) => !contentOk(e)).map((e) => e.id);
  return { entries, claims, conflicts, badIds };
}

/** After a sync: every source entry and claim must be on the target, unchanged. */
export function verifySync(from, to) {
  const byId = new Map(to.entries.map((e) => [e.id, e]));
  const claims = new Map(to.claims.map((c) => [sha256(c.key), c]));
  const missing = from.entries.filter((e) => !byId.has(e.id)).map((e) => e.id);
  const changed = from.entries.filter((e) => byId.has(e.id) && canonicalJson(byId.get(e.id)) !== canonicalJson({ id: e.id, at: e.at, kind: e.kind, actor: e.actor, data: e.data })).map((e) => e.id);
  const claimsMissing = from.claims.filter((c) => !claims.has(sha256(c.key))).map((c) => c.key);
  const claimsDiffer = from.claims.filter((c) => claims.has(sha256(c.key)) && canonicalJson(claims.get(sha256(c.key)).value) !== canonicalJson(c.value)).map((c) => c.key);
  return { ok: !missing.length && !changed.length && !claimsMissing.length && !claimsDiffer.length, missing, changed, claimsMissing, claimsDiffer, entries: from.entries.length, claims: from.claims.length };
}

/** Local → hosted, in ONE transaction under the ledger writers' lock: a conflict found inside writes nothing. */
export async function applyToSql(db, plan) {
  if (plan.conflicts.length || plan.badIds.length) throw new Error(`sync refused: ${plan.conflicts.length} claim conflicts, ${plan.badIds.length} entries whose id doesn't match their content`);
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1)", [LEDGER_LOCK]);
    for (const c of plan.claims) {
      const r = await tx.query("INSERT INTO ledger_claims (key_hash, key, value) VALUES ($1, $2, $3) ON CONFLICT (key_hash) DO NOTHING RETURNING key_hash", [sha256(c.key), c.key, JSON.stringify(c.value)]);
      if (!r.rows.length) {
        const prev = await tx.query("SELECT value FROM ledger_claims WHERE key_hash = $1", [sha256(c.key)]);
        if (canonicalJson(parse(prev.rows[0]?.value)) !== canonicalJson(c.value)) throw new Error(`sync refused: claim ${c.key} was taken on the hosted side meanwhile`);
      }
    }
    for (const e of plan.entries) {
      await tx.query("INSERT INTO ledger_entries (id, at, kind, actor, data) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING", [e.id, e.at, e.kind, e.actor, JSON.stringify(e.data)]);
    }
  });
  return { entries: plan.entries.length, claims: plan.claims.length };
}

/** Hosted → local: claims first (create-only; a lost race stops before any entry is written), then entries. */
export function applyToFile(fileStore, plan) {
  if (plan.conflicts.length || plan.badIds.length) throw new Error(`sync refused: ${plan.conflicts.length} claim conflicts, ${plan.badIds.length} entries whose id doesn't match their content`);
  for (const c of plan.claims) {
    const r = fileStore.claim(c.key, c.value);
    if (!r.won && canonicalJson(r.record.value) !== canonicalJson(c.value)) throw new Error(`sync refused: claim ${c.key} was taken on this Mac meanwhile`);
  }
  let n = 0;
  for (const e of plan.entries) if (fileStore.importEntry(e).imported) n++;
  return { entries: n, claims: plan.claims.length };
}

/**
 * Media keys ("media/<file>") the ledger points at: post graphics (package.media / mediaSet) and any other image an
 * entry names in a `file` field (e.g. engineering verification screenshots). A key with no local file is reported by
 * pushMedia as missing, never invented.
 */
export function mediaKeysOf(entries) {
  const keys = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    if (typeof v.file === "string" && /\.(png|jpe?g|webp|gif)$/i.test(v.file)) keys.add(`media/${path.basename(v.file)}`);
    for (const x of Object.values(v)) if (x && typeof x === "object") walk(x);
  };
  for (const e of entries) walk(e.data);
  return [...keys].sort();
}

/** Local media files → object store (write-once; a same-key different-bytes object is reported, never replaced). */
export async function pushMedia(objects, mediaDir, keys) {
  const out = { uploaded: 0, present: 0, missingLocally: [], conflicts: [] };
  for (const key of keys) {
    const file = path.join(mediaDir, path.basename(key));
    if (!fs.existsSync(file)) { out.missingLocally.push(key); continue; }
    try {
      const r = await objects.put(key, fs.readFileSync(file), "image/png");
      r.created ? out.uploaded++ : out.present++;
    } catch (err) {
      out.conflicts.push({ key, detail: String(err.message ?? err) });
    }
  }
  return out;
}

/** Object store → local media files that are missing here (hash-checked by the store's get). */
export async function pullMedia(objects, mediaDir, keys) {
  const out = { downloaded: 0, present: 0, unavailable: [] };
  fs.mkdirSync(mediaDir, { recursive: true });
  for (const key of keys) {
    const file = path.join(mediaDir, path.basename(key));
    if (fs.existsSync(file)) { out.present++; continue; }
    const o = await objects.get(key);
    if (!o) { out.unavailable.push(key); continue; }
    fs.writeFileSync(file, o.body, { flag: "wx" });
    out.downloaded++;
  }
  return out;
}
