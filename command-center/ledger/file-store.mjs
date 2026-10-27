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
    const entry = { id: shortId(kind, { at, actor, data }), at, kind, actor, data };
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
    return files.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
  }

  return { dir, append, claim, readClaim, list };
}
