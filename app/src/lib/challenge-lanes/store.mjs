/**
 * CHALLENGE LANES · PRIVATE LOG STORE. Node fs. Layout under ROOT (production: ~/gtp-private/challenge-lanes; tests and
 * replays: a temp dir — every caller passes the root explicitly, nothing defaults to the private folder):
 *   <root>/<laneId>/<runId>.jsonl            the run's chained log (append-only)
 *   <root>/<laneId>/inbox/<writer>.jsonl     another writer's chained receipts (console, renderer), ingested by the CLIs
 * Appends re-read and verify the whole chain first and refuse a broken or concurrently changed file.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseEvents, serializeEvents, verifyChain } from "./chain.mjs";
import { LANES } from "./lanes.mjs";

export const PRIVATE_ROOT = path.join(os.homedir(), "gtp-private", "challenge-lanes");

const runNo = (f) => Number(/^run-(\d+)\.jsonl$/.exec(f)?.[1] ?? NaN);
export function runFiles(root, laneId) {
  try { return fs.readdirSync(path.join(root, laneId)).filter((f) => Number.isFinite(runNo(f))).sort((a, b) => runNo(a) - runNo(b)); } catch { return []; }
}
export const readRun = (root, laneId, runFile) => parseEvents(fs.readFileSync(path.join(root, laneId, runFile), "utf8"));
export const readRuns = (root, laneId) => runFiles(root, laneId).map((f) => readRun(root, laneId, f));
export function currentRun(root, laneId) {
  const files = runFiles(root, laneId);
  return files.length ? { file: files.at(-1), events: readRun(root, laneId, files.at(-1)) } : null;
}

/** Append `newEvents` to a run whose current length is `expectedLength`; the combined chain must verify. */
export function appendEvents(root, laneId, runFile, expectedLength, newEvents) {
  if (!newEvents.length) return 0;
  if (!LANES[laneId]) throw new Error(`unknown lane ${laneId}`);
  const file = path.join(root, laneId, runFile);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = fs.existsSync(file) ? parseEvents(fs.readFileSync(file, "utf8")) : [];
  if (existing.length !== expectedLength) throw new Error(`appendEvents: ${laneId}/${runFile} changed underneath (${existing.length} ≠ ${expectedLength})`);
  const all = [...existing, ...newEvents];
  const v = verifyChain(all);
  if (!v.ok) throw new Error(`appendEvents: ${laneId}/${runFile} chain would break at ${v.seq} (${v.reason})`);
  fs.appendFileSync(file, serializeEvents(newEvents), { flag: "a", mode: 0o600 });
  return newEvents.length;
}

export function readInboxes(root, laneId) {
  const dir = path.join(root, laneId, "inbox");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort(); } catch { return []; }
  return files.map((f) => ({ writer: f.replace(/\.jsonl$/, ""), receipts: parseEvents(fs.readFileSync(path.join(dir, f), "utf8")) }));
}
