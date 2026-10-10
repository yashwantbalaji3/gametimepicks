/**
 * TRUTH-001 Stage B — the ONE loader for MLB grade rows of record (fs side of lib/mlb/results/restatements.mjs).
 *
 * Every MLB Results reader, the forecast-ledger builder and the model-health scorecard read the grade logs through
 * this loader, so no reader can carry its own version of the record.
 *
 * APPROVAL GATE. A restatement log applies only when its `status` is "APPROVED" (set in the founder-approved
 * implementation PR). A PROPOSED log is ignored everywhere — even on main — unless the caller explicitly opts in for
 * local validation (`includeProposed`, or GTP_INCLUDE_PROPOSED_RESTATEMENTS=1). So a proposal can never change Results
 * by being committed.
 */
import fs from "node:fs";
import path from "node:path";
import { indexRestatements, rowsOfRecord } from "./restatements.mjs";

export const RESTATEMENTS_DIR_REL = "data/internal/mlb/forecast-of-record-restatements";
export const APPROVED = "APPROVED";

const readJsonl = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
const includeProposedDefault = () => process.env.GTP_INCLUDE_PROPOSED_RESTATEMENTS === "1";

/** The committed restatement logs that apply. @returns {Array<{ file: string, doc: object }>} */
export function readRestatementLogs(rootDir, { includeProposed = includeProposedDefault() } = {}) {
  const dir = path.join(rootDir, RESTATEMENTS_DIR_REL);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => ({ file: `${RESTATEMENTS_DIR_REL}/${f}`, doc: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }))
    .filter(({ doc }) => doc?.status === APPROVED || includeProposed);
}

/**
 * @param {string} rootDir  repository root
 * @returns {{ graded: object[], projected: object[], logs: string[] }}
 */
export function readMlbGradesOfRecord(rootDir, opts = {}) {
  const pub = path.join(rootDir, "app/public/data/mlb/results");
  const graded = readJsonl(path.join(pub, "game-predictions-graded.jsonl"));
  const projected = readJsonl(path.join(pub, "game-projected-scores-graded.jsonl"));
  const logs = readRestatementLogs(rootDir, opts);
  if (!logs.length) return { graded, projected, logs: [] };
  const index = indexRestatements(logs);
  return {
    graded: rowsOfRecord("game-predictions-graded", graded, index),
    projected: rowsOfRecord("game-projected-scores-graded", projected, index),
    logs: logs.map((l) => l.file),
  };
}
