/**
 * POSTGRES LEDGER — the hosted LedgerStore, for stateless functions and short-lived workers.
 *
 * The orchestrator speaks the synchronous LedgerStore API (append / claim / readClaim / list). Over a network
 * database that is provided by a SESSION:
 *
 *   const session = await sqlStore.open();   // loads every row newer than this process has seen (append-only,
 *                                            //   so an incremental cache is exact)
 *   ... orchestrator works against `session` synchronously; appends and claims are buffered ...
 *   await session.flush();                   // one transaction: claims first (INSERT … ON CONFLICT DO NOTHING),
 *                                            //   then entries. A lost claim rolls the whole flush back and throws
 *                                            //   ClaimConflictError: nothing half-written, caller retries fresh.
 *
 * `refresh()` pulls rows other writers committed since (a worker uses it to see the founder's Pause mid-run).
 * Ordering is the database sequence, so every reader sees one global order. Flushes take a transaction-scoped
 * advisory lock, so sequence order is also commit order and the incremental `seq > last` read never skips a row.
 *
 * `db` is any driver with `query(text, params) → { rows }` and `transaction(async (tx) => …)`: PGlite in tests and
 * local hosting, the Neon serverless Pool in production (pg-adapters.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, sha256, shortId } from "../lib/util.mjs";
import { LEDGER_KINDS } from "../contracts/index.mjs";

/** Advisory-lock id serializing ledger writers ("gtp-cc" as an integer). */
export const LEDGER_LOCK = 0x6774702d6363;
const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export class ClaimConflictError extends Error {
  constructor(key) {
    super(`claim already taken by another writer: ${key}`);
    this.code = "CLAIM_CONFLICT";
  }
}

export async function migrate(db) {
  for (const f of fs.readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  }
}

const toEntry = (r) => ({ id: r.id, at: r.at, kind: r.kind, actor: r.actor, data: typeof r.data === "string" ? JSON.parse(r.data) : r.data });

/** @param {{ db: object, clock: () => string }} o */
export function createSqlStore({ db, clock }) {
  const cache = { entrySeq: 0, claimSeq: 0, entries: [], claims: new Map() };

  /**
   * Bring the shared cache up to date. Serialized: two concurrent requests in one process must not both append the
   * same rows (each row is also skipped if its seq is already cached).
   */
  let pulling = Promise.resolve();
  function pull() {
    pulling = pulling.then(pullOnce, pullOnce);
    return pulling;
  }
  async function pullOnce() {
    const e = await db.query("SELECT seq, id, at, kind, actor, data FROM ledger_entries WHERE seq > $1 ORDER BY seq", [cache.entrySeq]);
    for (const r of e.rows) {
      if (Number(r.seq) <= cache.entrySeq) continue;
      cache.entries.push(toEntry(r));
      cache.entrySeq = Number(r.seq);
    }
    const c = await db.query("SELECT seq, key_hash, key, value FROM ledger_claims WHERE seq > $1 ORDER BY seq", [cache.claimSeq]);
    for (const r of c.rows) {
      cache.claims.set(r.key_hash, { key: r.key, value: typeof r.value === "string" ? JSON.parse(r.value) : r.value });
      cache.claimSeq = Math.max(cache.claimSeq, Number(r.seq));
    }
  }

  /** Open a session: a consistent, synchronous view plus a write buffer. */
  async function open() {
    await pull();
    let pendingEntries = [];
    let pendingClaims = new Map();
    /** Claims and entries being written by a flush that hasn't finished: still visible to this session meanwhile. */
    let inflightClaims = new Map();
    let inflightEntries = [];

    const session = {
      kind: "sql",
      append(kind, actor, data) {
        if (!LEDGER_KINDS.includes(kind)) throw new Error(`unknown ledger kind: ${kind}`);
        const at = clock();
        const entry = { id: shortId(kind, { at, actor, data }), at, kind, actor, data: JSON.parse(JSON.stringify(data)) };
        pendingEntries.push(entry);
        return entry;
      },
      claim(key, value) {
        const h = sha256(key);
        const existing = pendingClaims.get(h) ?? inflightClaims.get(h) ?? cache.claims.get(h);
        if (existing) return { won: false, record: existing };
        const record = { key, value: JSON.parse(JSON.stringify(value)) };
        pendingClaims.set(h, record);
        return { won: true, record };
      },
      readClaim(key) {
        const h = sha256(key);
        return pendingClaims.get(h) ?? inflightClaims.get(h) ?? cache.claims.get(h) ?? null;
      },
      list() {
        return [...cache.entries, ...inflightEntries, ...pendingEntries];
      },
      /** Rows waiting to be written (for tests and diagnostics). */
      pending: () => ({ entries: pendingEntries.length, claims: pendingClaims.size }),
      /** Commit everything buffered so far, atomically. Throws ClaimConflictError (and writes nothing) on a lost claim. */
      async flush() {
        if (!pendingEntries.length && !pendingClaims.size) return { entries: 0, claims: 0 };
        // Swap the buffers first: anything appended while this flush awaits lands in the next flush, not nowhere.
        const entries = pendingEntries;
        const claims = pendingClaims;
        pendingEntries = [];
        pendingClaims = new Map();
        inflightClaims = claims;
        inflightEntries = entries;
        try {
          await db.transaction(async (tx) => {
            // One writer at a time: seq values are then assigned and committed in the same order, so a reader that
            // has seen seq N can never later miss a row < N committed by a slower transaction.
            await tx.query("SELECT pg_advisory_xact_lock($1)", [LEDGER_LOCK]);
            for (const [h, rec] of claims) {
              const r = await tx.query(
                "INSERT INTO ledger_claims (key_hash, key, value) VALUES ($1, $2, $3) ON CONFLICT (key_hash) DO NOTHING RETURNING key_hash",
                [h, rec.key, JSON.stringify(rec.value)],
              );
              if (!r.rows.length) {
                // Our own earlier commit whose acknowledgement was lost (then retried) holds the same value: fine.
                const prev = await tx.query("SELECT value FROM ledger_claims WHERE key_hash = $1", [h]);
                const v = prev.rows[0]?.value;
                if (canonicalJson(typeof v === "string" ? JSON.parse(v) : v) !== canonicalJson(rec.value)) throw new ClaimConflictError(rec.key);
              }
            }
            for (const e of entries) {
              // Entry ids are content hashes, so a retried flush of an already-committed entry is a no-op.
              await tx.query("INSERT INTO ledger_entries (id, at, kind, actor, data) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING", [e.id, e.at, e.kind, e.actor, JSON.stringify(e.data)]);
            }
          });
          await pull();
        } catch (err) {
          // A lost claim is final: what was built on it is wrong and stays dropped (the caller redoes the request
          // against fresh state). Anything else (network, timeout) is retryable: put it all back, in order.
          if (!(err instanceof ClaimConflictError)) {
            pendingEntries = [...entries, ...pendingEntries];
            pendingClaims = new Map([...claims, ...pendingClaims]);
          }
          throw err;
        } finally {
          inflightClaims = new Map();
          inflightEntries = [];
        }
        return { entries: entries.length, claims: claims.size };
      },
      /** Drop everything buffered (after a conflict, or a refused request). */
      discard() {
        pendingEntries = [];
        pendingClaims = new Map();
      },
      /** See rows other writers committed since this session opened. Buffered rows stay buffered. */
      async refresh() {
        await pull();
      },
    };
    return session;
  }

  return { open, migrate: () => migrate(db) };
}
