/**
 * SIMULATION THEATER · NFL PLAYER BOXES STORED IN A SIM-V2 RECEIPT (`nfl-representative-run-boxes@1`). Server only.
 *
 * WHY STORED. A receipt's representative runs carry their drive path only. Re-deriving a run's player lines later means
 * rebuilding the engine's player inputs from files that keep moving (role shares, injury captures), so a run degrades
 * as soon as those inputs change, and a public route would have to read them. Instead the shadow producer
 * (sim-v2/receipt.mjs buildNflSimulationReceipt) folds each representative run's play log into its player box AT
 * PRODUCTION TIME — with the exact inputs the run was simulated with, cross-checked against the engine's own
 * accumulators — and stores the boxes in the receipt. The page reads nothing but the receipt.
 *
 * RECEIPT FIELD `representativeRunBoxes` (inside the receipt body, so it is covered by `artifactHash` too):
 *   {
 *     schemaVersion: "nfl-representative-run-boxes@1",
 *     boxVersion:    "nfl-run-player-box@1",          the box shape (nfl-run-box-score.mjs nflRunBoxScore)
 *     encoding:      "run-box-pack@1",                 packRunBoxes(): shared [id, name, position] table + per-run rows
 *     pack:          { v, p, r },                      the verified boxes, keyed by run index (each distinct index once)
 *     refusals:      { [runIndex]: { code, reason } }, runs whose box failed at production (never a partial box)
 *     sha256:        hex sha256 of JSON.stringify({ pack, refusals })
 *   }
 *
 * READ (storedRunBoxes) — fail closed, per run:
 *   receipt without the field        → every run "unavailable" (NOT_RECORDED): receipts written before this field exist
 *                                      unchanged; they are historical records and are never rewritten
 *   wrong schema / encoding / sha    → every run unavailable (RECORD_SCHEMA / SHA_MISMATCH)
 *   per representative run           → the unpacked box must name the run, its teams must be the receipt's, and
 *                                      reconcileRunBox (the same box-level checks nflRunBoxScore applies to every box
 *                                      it returns) must hold against THIS run's stored drives and final score;
 *                                      otherwise that run is unavailable (typed code), never a guessed number.
 */
import crypto from "node:crypto";

import { RUN_BOX_PACK_VERSION, RUN_BOX_VERSION, RunBoxScoreError, packRunBoxes, reconcileRunBox, unpackRunBoxes } from "./nfl-run-box-score.mjs";

export const RUN_BOX_RECORD_SCHEMA = "nfl-representative-run-boxes@1";
export const RUN_BOX_RECORD_FIELD = "representativeRunBoxes";

/** sha256 over the record's content (pack + refusals), as stored in `sha256`. */
export function runBoxRecordSha(pack, refusals) {
  return crypto.createHash("sha256").update(JSON.stringify({ pack, refusals })).digest("hex");
}

/**
 * Producer side: the record for a receipt from per-run results ({ [runIndex]: { ok, box, error } }, safeNflRunBoxScore).
 * Deterministic: run indices in ascending order, the pack's player table in first-seen order.
 */
export function buildRunBoxRecord(results) {
  const boxes = {};
  const refusals = {};
  for (const k of Object.keys(results).map(Number).sort((a, b) => a - b)) {
    const v = results[k];
    if (v?.ok && v.box) boxes[k] = v.box;
    else refusals[k] = { code: String(v?.error?.code ?? "RUN_BOX_ERROR"), reason: String(v?.error?.reason ?? "no box") };
  }
  const pack = packRunBoxes(boxes);
  return { schemaVersion: RUN_BOX_RECORD_SCHEMA, boxVersion: RUN_BOX_VERSION, encoding: RUN_BOX_PACK_VERSION, pack, refusals, sha256: runBoxRecordSha(pack, refusals) };
}

/**
 * Reader side: the verified player boxes of a receipt's representative runs, in the Theater's RunBoxes shape.
 * @returns {{ boxes: Record<string, object>, refusals: Record<string, {code, reason}>, error: {code, reason}|null }}
 */
export function storedRunBoxes(receipt) {
  const none = (code, reason) => ({ boxes: {}, refusals: {}, error: { code, reason } });
  const rec = receipt?.[RUN_BOX_RECORD_FIELD];
  if (rec == null) return none("NOT_RECORDED", "this receipt was produced before player lines were stored with each run");
  if (rec.schemaVersion !== RUN_BOX_RECORD_SCHEMA || rec.encoding !== RUN_BOX_PACK_VERSION || rec.boxVersion !== RUN_BOX_VERSION || !rec.pack || typeof rec.refusals !== "object") {
    return none("RECORD_SCHEMA", `unrecognised stored player-box record ${rec.schemaVersion}/${rec.encoding}`);
  }
  if (runBoxRecordSha(rec.pack, rec.refusals) !== rec.sha256) return none("SHA_MISMATCH", "the stored player boxes do not match their sha256");
  let unpacked;
  try { unpacked = unpackRunBoxes(rec.pack); } catch { return none("RECORD_SCHEMA", "the stored player boxes do not unpack"); }
  const boxes = {};
  const refusals = {};
  for (const rep of receipt.representativeRuns ?? []) {
    const k = String(rep.runIndex);
    if (boxes[k] || refusals[k]) continue; // one run can carry two kinds
    const box = unpacked[k];
    if (!box) {
      refusals[k] = rec.refusals[k] ? { code: String(rec.refusals[k].code), reason: String(rec.refusals[k].reason) } : { code: "NOT_RECORDED", reason: `no stored player box for run #${k}` };
      continue;
    }
    try {
      if (box.runIndex !== rep.runIndex) throw new RunBoxScoreError("RUN_INDEX", `stored box names run ${box.runIndex}, not ${rep.runIndex}`);
      if (box.home.abbr !== receipt.home?.abbr || box.away.abbr !== receipt.away?.abbr) throw new RunBoxScoreError("TEAMS", "stored box teams are not the receipt's");
      reconcileRunBox(box, { drives: rep.drives, final: rep.final });
      boxes[k] = box;
    } catch (e) {
      refusals[k] = e instanceof RunBoxScoreError ? { code: e.code, reason: e.detail } : { code: "RUN_BOX_ERROR", reason: String(e?.message ?? e) };
    }
  }
  return { boxes, refusals, error: null };
}
