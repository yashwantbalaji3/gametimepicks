/**
 * THE LEDGER STORE INTERFACE — what every caller depends on, so the backing store can change without them.
 *
 *   append(kind, actor, data) → LedgerEntry     append-only; never edits or deletes
 *   claim(key, value)         → {won, record}   create-only; exactly one winner per key
 *   readClaim(key)            → record | null
 *   list()                    → LedgerEntry[]   in write order
 *
 * Phase 1: file-store.mjs (local disk, temp file + atomic link). Phase 2: the same layout committed to the private
 * ops repo with fast-forward pushes. Later: Postgres. Callers never learn which.
 */
export { createFileStore } from "./file-store.mjs";
