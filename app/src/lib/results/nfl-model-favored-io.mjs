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
