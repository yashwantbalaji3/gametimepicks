/**
 * DAILY CANDIDATE RECEIPTS (P0-E). Write-once pregame receipts + an append-only status log, the same conventions as
 * the other product receipts (recommendation-receipt.mjs: frozen, no mutator; level-a/record.mjs: content-addressed
 * id, `wx` writes, nothing recorded is edited or regraded).
 *
 *   makeDailyCandidateReceipt   pure; deep-frozen; id = sha256 of (product, productDay, card legs or NO_CANDIDATE, asOf)
 *                               and `contentSha256` over the canonical bytes. No wall clock: the instant is the build's
 *                               as-of, passed in, so regenerating from the same inputs yields identical bytes.
 *   writeReceiptOnce            refuses after the first leg's start (pregame only), refuses a card whose legs are not
 *                               its inputs verbatim, writes with flag "wx"; an identical rewrite is a no-op, a
 *                               DIFFERENT receipt at the same path throws (immutability).
 *   appendStatusEvent           draft → published → live → pending → won | lost | push (NO_CANDIDATE: draft →
 *                               published only). Appends a line; never rewrites the receipt or an earlier status.
 *
 * WHERE RECEIPTS LIVE. A CANDIDATE receipt holds sportsbook prices, and provider terms forbid publishing price JSON
 * (the repository is public). The CLI (scripts/products/record-daily-candidate.mjs) therefore writes only to a
 * directory outside every git repository.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fabricatedLegs } from "./engine.mjs";
import { DAILY_CANDIDATE_RECEIPT_SCHEMA, DAILY_CANDIDATE_STATUS_SCHEMA } from "./policy.mjs";

export const STATUS = Object.freeze(["draft", "published", "live", "pending", "won", "lost", "push"]);
const NEXT = Object.freeze({
  CANDIDATE: Object.freeze({ draft: ["published"], published: ["live", "pending"], live: ["pending", "won", "lost", "push"], pending: ["won", "lost", "push"], won: [], lost: [], push: [] }),
  NO_CANDIDATE: Object.freeze({ draft: ["published"], published: [] }),
});

/** Canonical JSON: keys sorted at every depth, so the same content always hashes to the same bytes. */
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
const sha = (s) => createHash("sha256").update(s).digest("hex");
const deepFreeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };

/** Pure. The receipt for one engine result. */
export function makeDailyCandidateReceipt(result) {
  if (!result?.product || !result?.productDay || !result?.asOf) throw new Error("receipt needs product, productDay and asOf");
  const legKey = result.card ? result.card.legs.map((l) => `${l.legId}@${l.american}@${l.bookmaker}@${l.capturedAt}`).join("|") : "NO_CANDIDATE";
  const body = {
    schema: DAILY_CANDIDATE_RECEIPT_SCHEMA,
    receiptId: sha([result.product, result.productDay, legKey, result.asOf].join("|")).slice(0, 16),
    product: result.product,
    productDay: result.productDay,
    frozenAt: result.asOf,
    kind: result.status,
    initialStatus: "draft",
    firstStartUtc: result.card?.firstStartUtc ?? null,
    hypotheticalStakeOnly: true,
    placed: false,
    result: structuredClone(result),
  };
  return deepFreeze({ ...body, contentSha256: sha(canonicalJson(body)) });
}

export const receiptBytes = (receipt) => `${JSON.stringify(receipt, null, 2)}\n`;
export const receiptPath = (dir, receipt) => path.join(dir, receipt.productDay, `${receipt.product}-${receipt.receiptId}.json`);

/**
 * Write once. Returns { file, written } or throws.
 * @param {string} dir     receipts root
 * @param {object} receipt from makeDailyCandidateReceipt
 * @param {{ inputs: object[], nowIso: string }} ctx  the inputs the card was built from; the writer's own instant
 */
export function writeReceiptOnce(dir, receipt, { inputs, nowIso }) {
  const now = Date.parse(nowIso ?? "");
  if (!Number.isFinite(now)) throw new Error("writeReceiptOnce: nowIso is required");
  if (receipt.firstStartUtc && now >= Date.parse(receipt.firstStartUtc)) throw new Error(`refused: ${receipt.firstStartUtc} has started; a pregame receipt cannot be written after the first leg's start`);
  if (Date.parse(receipt.frozenAt) > now) throw new Error("refused: the receipt's as-of is in the writer's future");
  const bad = fabricatedLegs(receipt.result, inputs);
  if (bad.length) throw new Error(`refused: card legs are not their inputs verbatim: ${bad.join("; ")}`);
  if (sha(canonicalJson(Object.fromEntries(Object.entries(receipt).filter(([k]) => k !== "contentSha256")))) !== receipt.contentSha256) throw new Error("refused: contentSha256 does not match the receipt body");
  const file = receiptPath(dir, receipt);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bytes = receiptBytes(receipt);
  try {
    fs.writeFileSync(file, bytes, { flag: "wx" });
    return { file, written: true };
  } catch (e) {
    if (e?.code !== "EEXIST") throw e;
    if (fs.readFileSync(file, "utf8") === bytes) return { file, written: false };
    throw new Error(`IMMUTABLE: ${file} already holds a different receipt; receipts are never rewritten`);
  }
}

/** The status log for a receipts root (one JSON line per event). */
export const statusLogPath = (dir) => path.join(dir, "status.jsonl");

export function readStatusEvents(dir) {
  const f = statusLogPath(dir);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/** Current status of a receipt: its last logged status, else "draft". */
export function currentStatus(events, receiptId) {
  const mine = (events ?? []).filter((e) => e.receiptId === receiptId);
  return mine.length ? mine[mine.length - 1].status : "draft";
}

/** Append one status transition. Throws on an unknown status or an illegal transition. */
export function appendStatusEvent(dir, receipt, { status, at, note = null }) {
  if (!STATUS.includes(status)) throw new Error(`unknown status ${status}`);
  if (!Number.isFinite(Date.parse(at ?? ""))) throw new Error("status event needs an ISO `at`");
  const events = readStatusEvents(dir);
  const from = currentStatus(events, receipt.receiptId);
  const allowed = (NEXT[receipt.kind] ?? NEXT.NO_CANDIDATE)[from] ?? [];
  if (!allowed.includes(status)) throw new Error(`illegal transition ${from} → ${status} for a ${receipt.kind} receipt`);
  const ev = { schema: DAILY_CANDIDATE_STATUS_SCHEMA, receiptId: receipt.receiptId, contentSha256: receipt.contentSha256, from, status, at, note };
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(statusLogPath(dir), `${JSON.stringify(ev)}\n`);
  return ev;
}
