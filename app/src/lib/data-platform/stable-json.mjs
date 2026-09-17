/**
 * Deterministic serialization for platform artifacts.
 *
 * Byte stability is a contract (docs/GAMETIME_DATA_PLATFORM.md §Determinism): identical inputs must
 * produce identical files, so nothing here depends on insertion order, filesystem order or the clock.
 * Object keys are sorted recursively; array order is the caller's responsibility (every builder sorts
 * with `compareIds` / explicit comparators before serializing).
 */
import crypto from "node:crypto";

/** @param {unknown} v @returns {unknown} */
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      if (v[k] === undefined) throw new Error(`undefined value at key ${k} — platform records use explicit null, never undefined`);
      out[k] = canonical(v[k]);
    }
    return out;
  }
  if (typeof v === "number" && !Number.isFinite(v)) throw new Error(`non-finite number ${v} cannot be serialized`);
  return v;
}

/** Compact canonical JSON (one line). */
export function stableStringify(v) {
  return JSON.stringify(canonical(v));
}

/** Pretty canonical JSON for small registry/receipt files. */
export function stablePretty(v) {
  return `${JSON.stringify(canonical(v), null, 1)}\n`;
}

/** JSONL: one canonical record per line, trailing newline; empty list ⇒ empty string. */
export function toJsonl(records) {
  return records.length ? `${records.map(stableStringify).join("\n")}\n` : "";
}

/** @param {string} text */
export function parseJsonl(text) {
  return text.split("\n").filter((l) => l.trim() !== "").map((l, i) => {
    try { return JSON.parse(l); } catch (e) { throw new Error(`invalid JSONL at line ${i + 1}: ${e.message}`); }
  });
}

export const sha256Hex = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

/**
 * Total order for ids: numeric provider ids compare numerically when both are pure digits, otherwise by
 * code unit. Deterministic and locale-free (never localeCompare, whose order varies by ICU build).
 */
export function compareIds(a, b) {
  const da = /^\d+$/.test(a), db = /^\d+$/.test(b);
  if (da && db) {
    if (a.length !== b.length) return a.length - b.length;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Compare by a list of string/number/null keys, nulls last. */
export function compareTuple(ka, kb) {
  for (let i = 0; i < ka.length; i++) {
    const a = ka[i], b = kb[i];
    if (a === b) continue;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    const c = compareIds(String(a), String(b));
    if (c) return c;
  }
  return 0;
}
