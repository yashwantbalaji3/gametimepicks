/**
 * FILE-BACKED LEDGER — append-only records and create-only idempotency claims.
 *
 * Layout (identical to the planned private-repo layout, so Phase 2 only swaps the commit/push transport):
 *   <dir>/ledger/YYYY/MM/DD/<compact-ts>-<n>-<kind>.json   one record per file, never edited
 *   <dir>/claims/<sha256(key)>.json                        first writer wins
 *
 * Both writes are create-only AND never visible half-written: the bytes go to a private temp file first, then
 * link(2) publishes it at the final path. link fails with EEXIST if the path exists, so exactly one writer wins,
 * and because the file is complete before it has its name, a loser that reads the winner's claim always sees the
 * whole record. (Plain O_EXCL `wx` creates the name first and writes after — a concurrent loser could read an
 * empty file; tests/core.test.mjs races 12 processes to catch that.) Nothing here ever edits an existing path,
 * which is what "append-only" means in practice.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { canonicalJson, sha256, shortId } from "../lib/util.mjs";
import { LEDGER_KINDS } from "../contracts/index.mjs";

/**
 * @typedef {object} LedgerEntry
 * @property {string} id
 * @property {string} at      ISO time from the injected clock
 * @property {string} kind    one of LEDGER_KINDS
 * @property {string} actor   "founder" | a role id | "orchestrator" | "system"
 * @property {object} data
 */

/** @param {{dir:string, clock:() => string}} opts */
export function createFileStore({ dir, clock }) {
  const ledgerDir = path.join(dir, "ledger");
  const claimsDir = path.join(dir, "claims");
  const tmpDir = path.join(dir, ".tmp");
  for (const d of [ledgerDir, claimsDir, tmpDir]) fs.mkdirSync(d, { recursive: true });

  /** Write `text` to `file` only if `file` does not exist; returns false (and writes nothing) if it does. */
  function createComplete(file, text) {
    const tmp = path.join(tmpDir, `${process.pid}-${crypto.randomUUID()}`);
    fs.writeFileSync(tmp, text, { flag: "wx" });
    try {
      fs.linkSync(tmp, file);
      return true;
    } catch (err) {
      if (err.code === "EEXIST") return false;
      throw err;
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }

  function append(kind, actor, data) {
    if (!LEDGER_KINDS.includes(kind)) throw new Error(`unknown ledger kind: ${kind}`);
    const at = clock();
    return write({ id: shortId(kind, { at, actor, data }), at, kind, actor, data });
  }
  /**
   * Ledger sync only (deploy/sync-ledger.mjs): add an entry another store already holds, keeping its id and time.
   * An id already present is a no-op; the id is a hash of the content, so a different entry can't reuse it.
   */
  function importEntry(entry) {
    if (!LEDGER_KINDS.includes(entry.kind)) throw new Error(`unknown ledger kind: ${entry.kind}`);
    if (shortId(entry.kind, { at: entry.at, actor: entry.actor, data: entry.data }) !== entry.id) throw new Error(`entry ${entry.id} does not match its content`);
    if (list().some((e) => e.id === entry.id)) return { imported: false };
    write({ id: entry.id, at: entry.at, kind: entry.kind, actor: entry.actor, data: entry.data });
    return { imported: true };
  }
  function write(entry) {
    const { at, kind } = entry;
    const dayDir = path.join(ledgerDir, at.slice(0, 4), at.slice(5, 7), at.slice(8, 10));
    fs.mkdirSync(dayDir, { recursive: true });
    const stamp = at.replace(/[-:.]/g, "");
    for (let n = 0; n < 1000; n++) {
      const file = path.join(dayDir, `${stamp}-${String(n).padStart(3, "0")}-${kind}.json`);
      if (createComplete(file, canonicalJson(entry) + "\n")) return entry;
    }
    throw new Error("ledger: could not allocate a record name");
  }

  /**
   * Create-only claim. Returns { won: true, record } for the first caller and { won: false, record } with the
   * winner's record for everyone after — the caller then returns the existing result instead of acting twice.
   */
  function claim(key, value) {
    const file = path.join(claimsDir, `${sha256(key)}.json`);
    const record = { key, value };
    if (createComplete(file, canonicalJson(record) + "\n")) return { won: true, record };
    return { won: false, record: JSON.parse(fs.readFileSync(file, "utf8")) };
  }

  function readClaim(key) {
    const file = path.join(claimsDir, `${sha256(key)}.json`);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  }

  /** Every record in write order. */
  // Ledger files are write-once (O_EXCL, never rewritten), so a parsed entry can be kept: each list() parses only files
  // it hasn't seen. Callers get frozen copies, so nothing can change a cached entry in place.
  const parsed = new Map();
  function list() {
    const files = [];
    const walk = (d) => {
      for (const name of fs.readdirSync(d).sort()) {
        const p = path.join(d, name);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".json")) files.push(p);
      }
    };
    walk(ledgerDir);
    return files.map((f) => {
      if (!parsed.has(f)) parsed.set(f, deepFreeze(JSON.parse(fs.readFileSync(f, "utf8"))));
      return parsed.get(f);
    });
  }

  /**
   * Session API (same shape as the Postgres store): a local file store writes through immediately, so a session is
   * the store itself and flush/refresh have nothing to do.
   */
  /** Every claim record (ledger sync and backups). */
  const listClaims = () => fs.readdirSync(claimsDir).filter((n) => n.endsWith(".json")).sort().map((n) => JSON.parse(fs.readFileSync(path.join(claimsDir, n), "utf8")));
  const store = { kind: "file", dir, append, claim, readClaim, list, importEntry, listClaims };
  Object.assign(store, {
    open: async () => store,
    flush: async () => ({ entries: 0, claims: 0 }),
    refresh: async () => {},
    discard: () => {},
  });
  return store;
}

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
