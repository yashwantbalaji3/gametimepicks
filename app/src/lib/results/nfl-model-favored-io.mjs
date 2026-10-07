/**
 * Stage 3C — file IO for the NFL winner rule (nfl-model-favored.mjs stays pure). Reads the committed correction logs
 * and the frozen receipt a settled event graded. Never writes.
 */
import fs from "node:fs";
import path from "node:path";

import { CORRECTIONS_DIR, indexCorrections } from "./nfl-model-favored.mjs";

/** Every committed correction log under <root>/data/internal/nfl/winner-corrections, indexed (throws on disagreement). */
export function readNflWinnerCorrections(rootDir) {
  const dir = path.join(rootDir, CORRECTIONS_DIR);
  if (!fs.existsSync(dir)) return new Map();
  const logs = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => ({ file: path.posix.join(CORRECTIONS_DIR, f), doc: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }));
  return indexCorrections(logs);
}

/** The frozen receipt a settler event graded (lineage.receiptFile, repo-relative), or null when it cannot be read. */
export function readGradedReceipt(rootDir, event) {
  const rel = event?.lineage?.receiptFile;
  if (typeof rel !== "string" || !rel) return null;
  try { return JSON.parse(fs.readFileSync(path.join(rootDir, rel), "utf8")); } catch { return null; }
}

/** Stage 3D: where the NFL side-decision cutover is recorded (written once by the forecast producer). */
export const NFL_SIDE_CUTOVER_FILE = "data/internal/nfl/side-decision-cutover.json";

/** The cutover's firstFrozenAt, or null while no receipt has frozen a side decision. */
export function readNflSideCutover(rootDir) {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(rootDir, NFL_SIDE_CUTOVER_FILE), "utf8"));
    if (typeof doc?.firstFrozenAt !== "string" || !Number.isFinite(Date.parse(doc.firstFrozenAt))) throw new Error("firstFrozenAt");
    return doc.firstFrozenAt;
  } catch (e) {
    if (e?.code === "ENOENT") return null;
    throw new Error(`${NFL_SIDE_CUTOVER_FILE} is unreadable: ${e?.message ?? e}`); // fail closed: never silently historical
  }
}
