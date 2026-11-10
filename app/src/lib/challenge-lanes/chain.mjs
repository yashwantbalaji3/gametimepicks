/**
 * CHALLENGE LANES · HASH-CHAINED EVENT LOG (`gtp.challenge-lane.event@1`). PURE.
 *
 * One lane run is one append-only JSONL file; line i is one event. HASHING RULE (the contract every writer — this
 * module and the console's receipt inbox — follows):
 *   canonical(x)   JSON with object keys sorted (recursively), no whitespace, undefined keys dropped; arrays keep order.
 *   sha256         hex sha256 of the UTF-8 bytes of canonical(event without its `sha256` field).
 *   prevSha256     the previous line's `sha256`; GENESIS (64 zeros) on line 0.
 *   seq            the line index (0-based), so a dropped or reordered line breaks the chain.
 * Each line on disk is canonical(event including `sha256`) + "\n".
 */
import { createHash } from "node:crypto";

export const EVENT_SCHEMA = "gtp.challenge-lane.event@1";
export const GENESIS = "0".repeat(64);

export function canonical(x) {
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  if (x && typeof x === "object") return `{${Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`).join(",")}}`;
  return JSON.stringify(x);
}
export const sha256 = (s) => createHash("sha256").update(s).digest("hex");
export const eventSha = (event) => { const { sha256: _s, ...rest } = event; return sha256(canonical(rest)); };

/** The next event: schema, seq, prevSha256 and sha256 filled in from the chain so far. */
export function chainEvent(events, body) {
  const prev = events.at(-1);
  const e = { schema: EVENT_SCHEMA, ...body, seq: events.length, prevSha256: prev ? prev.sha256 : GENESIS };
  return { ...e, sha256: eventSha(e) };
}

/** `{ ok: true }` or `{ ok: false, seq, reason }` for the first broken link. */
export function verifyChain(events) {
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i];
    if (e?.seq !== i) return { ok: false, seq: i, reason: "SEQ_MISMATCH" };
    if (e.prevSha256 !== (i === 0 ? GENESIS : events[i - 1].sha256)) return { ok: false, seq: i, reason: "PREV_SHA_MISMATCH" };
    if (e.sha256 !== eventSha(e)) return { ok: false, seq: i, reason: "SHA_MISMATCH" };
  }
  return { ok: true };
}

export const serializeEvents = (events) => events.map((e) => `${canonical(e)}\n`).join("");
export const parseEvents = (text) => String(text).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
